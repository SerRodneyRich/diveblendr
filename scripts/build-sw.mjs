/**
 * Post-build service worker generation.
 *
 * Runs AFTER `next build` has finished exporting to `out/`, via the
 * `postbuild` npm script. This replaces the `@ducanh2912/next-pwa` webpack
 * plugin, which injected a legacy pages-router `_document.js`/`_error.js` into
 * this App-Router-only project and corrupted the server webpack graph
 * ("TypeError: a[d] is not a function" during prerender, nondeterministically
 * failing a different route on each run).
 *
 * Generating the worker as a separate step means no plugin participates in the
 * Next.js compile at all, so the corruption cannot recur. It also means the
 * precache manifest is derived from the real exported files instead of a
 * hand-maintained list.
 */
import { generateSW } from 'workbox-build';
import { existsSync } from 'node:fs';
import { copyFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const outDir = path.join(root, 'out');
const publicDir = path.join(root, 'public');

if (!existsSync(outDir)) {
  console.error('[build-sw] `out/` not found — run `next build` first.');
  process.exit(1);
}

// Remove stale workbox runtime copies from previous builds so `public/` does
// not accumulate one hashed `workbox-*.js` file per build.
for (const dir of [publicDir, outDir]) {
  if (!existsSync(dir)) continue;
  for (const entry of await readdir(dir)) {
    if (/^workbox-[0-9a-f]+\.js(\.map)?$/.test(entry)) {
      await rm(path.join(dir, entry), { force: true });
    }
  }
}

const { count, size, warnings, filePaths } = await generateSW({
  globDirectory: outDir,
  // Precache the exported route HTML, the RSC payloads (.txt) that App Router
  // navigations fetch, and the static assets. Because this runs post-export,
  // every route's real HTML/RSC file is discovered automatically — the
  // `additionalManifestEntries` list and the phantom-file `manifestTransforms`
  // filter that the next-pwa config needed are both obsolete.
  globPatterns: ['**/*.{html,txt,js,css,json,woff,woff2,png,jpg,jpeg,svg,ico,webp}'],
  // Exclude the worker's own output (including source maps, which would
  // otherwise be copied into `public/` and swept into the next build's
  // manifest) plus files that must always be fetched fresh.
  globIgnores: [
    'sw.js',
    'sw.js.map',
    'workbox-*.js',
    'workbox-*.js.map',
    'sw-assets.json',
    'robots.txt',
    'sitemap*.xml',
  ],
  swDest: path.join(outDir, 'sw.js'),
  // Route HTML is content-hash-revisioned by workbox; the `_next/static/*`
  // assets are already immutable-by-filename, so skip redundant revisions.
  dontCacheBustURLsMatching: /\/_next\/static\//,
  maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
  cleanupOutdatedCaches: true,
  sourcemap: false,
  skipWaiting: true,
  clientsClaim: true,
  disableDevLogs: true,
  navigateFallback: '/index.html',
  navigateFallbackDenylist: [/^\/_next\//, /^\/api\//],
  // Ported verbatim from the `workboxOptions.runtimeCaching` array that was in
  // next.config.js, preserving cache names, handlers, timeouts and expiries so
  // existing clients reuse their populated caches rather than refilling them.
  runtimeCaching: [
    // RSC payload files (.txt) — CacheFirst for offline support.
    {
      urlPattern: /\.txt$/i,
      handler: 'CacheFirst',
      options: {
        cacheName: 'rsc-payloads',
        expiration: { maxEntries: 32, maxAgeSeconds: 24 * 60 * 60 },
        cacheableResponse: { statuses: [0, 200] },
      },
    },
    // Static data (JSON, XML, CSV) — NetworkFirst with fast offline fallback.
    {
      urlPattern: /\.(?:json|xml|csv)$/i,
      handler: 'NetworkFirst',
      options: {
        cacheName: 'static-data-assets',
        networkTimeoutSeconds: 2,
        expiration: { maxEntries: 32, maxAgeSeconds: 24 * 60 * 60 },
      },
    },
    // Pages RSC prefetch — NetworkFirst with fast timeout.
    {
      urlPattern: ({ request, url, sameOrigin }) =>
        request.headers.get('RSC') === '1' &&
        request.headers.get('Next-Router-Prefetch') === '1' &&
        sameOrigin &&
        !url.pathname.startsWith('/api/'),
      handler: 'NetworkFirst',
      options: {
        cacheName: 'pages-rsc-prefetch',
        networkTimeoutSeconds: 2,
        expiration: { maxEntries: 32, maxAgeSeconds: 24 * 60 * 60 },
      },
    },
    // Pages RSC — NetworkFirst with fast timeout.
    {
      urlPattern: ({ request, url, sameOrigin }) =>
        request.headers.get('RSC') === '1' &&
        sameOrigin &&
        !url.pathname.startsWith('/api/'),
      handler: 'NetworkFirst',
      options: {
        cacheName: 'pages-rsc',
        networkTimeoutSeconds: 2,
        expiration: { maxEntries: 32, maxAgeSeconds: 24 * 60 * 60 },
      },
    },
    // Everything else same-origin — NetworkFirst with fast timeout.
    {
      urlPattern: ({ url, sameOrigin }) =>
        sameOrigin && !url.pathname.startsWith('/api/'),
      handler: 'NetworkFirst',
      options: {
        cacheName: 'pages',
        networkTimeoutSeconds: 2,
        expiration: { maxEntries: 32, maxAgeSeconds: 24 * 60 * 60 },
      },
    },
  ],
});

// `generateSW` emits sw.js plus a hashed workbox runtime bundle. Mirror both
// into `public/` so the committed artifact matches what was just deployed and
// so `next dev` serves the same worker.
for (const filePath of filePaths) {
  await copyFile(filePath, path.join(publicDir, path.basename(filePath)));
}

// Keep the sw-assets.json inventory that previous builds published.
const precached = filePaths.find((f) => f.endsWith('sw.js'));
if (precached) {
  const manifest = (
    await readdir(outDir, { recursive: true, withFileTypes: true })
  )
    .filter((d) => d.isFile())
    .map((d) =>
      '/' +
      path
        .relative(outDir, path.join(d.parentPath ?? d.path, d.name))
        .split(path.sep)
        .join('/')
    )
    .sort();
  const assetsJson = JSON.stringify(manifest, null, 2) + '\n';
  await writeFile(path.join(publicDir, 'sw-assets.json'), assetsJson);
  await writeFile(path.join(outDir, 'sw-assets.json'), assetsJson);
}

for (const warning of warnings) console.warn('[build-sw]', warning);
console.log(
  `[build-sw] Precached ${count} files, ${(size / 1024 / 1024).toFixed(2)} MiB -> out/sw.js (+ public/sw.js)`
);
