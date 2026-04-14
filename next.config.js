import withPWABuilder from '@ducanh2912/next-pwa';

const withPWA = withPWABuilder({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development',
  register: true,
  skipWaiting: true,
  reloadOnOnline: true,
  swcMinify: true,
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  publicExcludes: ['!robots.txt', '!sitemap*.xml'],
  workboxOptions: {
    disableDevLogs: true,
    skipWaiting: true,
    clientsClaim: true,
    additionalManifestEntries: [
      // Explicitly cache the actual route HTML and RSC payload files for offline access
      { url: '/calculator/', revision: null },
      { url: '/calculator/index.html', revision: null },
      { url: '/calculator/index.txt', revision: null },
      { url: '/marine-conditions/', revision: null },
      { url: '/marine-conditions/index.html', revision: null },
      { url: '/marine-conditions/index.txt', revision: null },
      { url: '/photo-correction/', revision: null },
      { url: '/photo-correction/index.html', revision: null },
      { url: '/photo-correction/index.txt', revision: null },
      { url: '/index.html', revision: null },
      { url: '/index.txt', revision: null }
    ],
    manifestTransforms: [
      (originalManifest) => {
        // Filter out incorrect .html and .txt files that don't exist
        const manifest = originalManifest.filter(entry => {
          // Remove phantom files that don't actually exist
          const phantomFiles = [
            '/calculator.html', '/calculator.txt',
            '/marine-conditions.html', '/marine-conditions.txt',
            '/photo-correction.html', '/photo-correction.txt',
            '/tank-test.html', '/tank-test.txt'
          ];
          return !phantomFiles.includes(entry.url);
        });

        return { manifest };
      }
    ],
    navigateFallback: '/index.html',
    navigateFallbackDenylist: [/^\/_next\//, /^\/api\//],
    runtimeCaching: [
      // RSC Payload files (.txt) - Cache First for offline support
      {
        urlPattern: /\.txt$/i,
        handler: 'CacheFirst',
        options: {
          cacheName: 'rsc-payloads',
          expiration: {
            maxEntries: 32,
            maxAgeSeconds: 24 * 60 * 60, // 24 hours
          },
          cacheableResponse: {
            statuses: [0, 200],
          },
        },
      },
      // Static data (JSON, XML, CSV) - NetworkFirst with fast timeout for offline fallback
      {
        urlPattern: /\.(?:json|xml|csv)$/i,
        handler: 'NetworkFirst',
        options: {
          cacheName: 'static-data-assets',
          networkTimeoutSeconds: 2,
          expiration: {
            maxEntries: 32,
            maxAgeSeconds: 24 * 60 * 60, // 24 hours
          },
        },
      },
      // Pages RSC Prefetch - NetworkFirst with fast timeout
      {
        urlPattern: ({request, url, sameOrigin}) =>
          request.headers.get('RSC') === '1' &&
          request.headers.get('Next-Router-Prefetch') === '1' &&
          sameOrigin &&
          !url.pathname.startsWith('/api/'),
        handler: 'NetworkFirst',
        options: {
          cacheName: 'pages-rsc-prefetch',
          networkTimeoutSeconds: 2,
          expiration: {
            maxEntries: 32,
            maxAgeSeconds: 24 * 60 * 60,
          },
        },
      },
      // Pages RSC - NetworkFirst with fast timeout
      {
        urlPattern: ({request, url, sameOrigin}) =>
          request.headers.get('RSC') === '1' &&
          sameOrigin &&
          !url.pathname.startsWith('/api/'),
        handler: 'NetworkFirst',
        options: {
          cacheName: 'pages-rsc',
          networkTimeoutSeconds: 2,
          expiration: {
            maxEntries: 32,
            maxAgeSeconds: 24 * 60 * 60,
          },
        },
      },
      // Regular pages - NetworkFirst with fast timeout
      {
        urlPattern: ({url, sameOrigin}) =>
          sameOrigin &&
          !url.pathname.startsWith('/api/'),
        handler: 'NetworkFirst',
        options: {
          cacheName: 'pages',
          networkTimeoutSeconds: 2,
          expiration: {
            maxEntries: 32,
            maxAgeSeconds: 24 * 60 * 60,
          },
        },
      },
    ],
  }
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  trailingSlash: true,
  webpack: (config, { isServer }) => {
    // Fix @ducanh2912/next-pwa generating a pages/_document.js whose
    // webpack-runtime resolves server chunks via `require("./" + chunkId + ".js")`
    // (i.e. relative to .next/server/) while Next.js 15 emits server chunks into
    // .next/server/chunks/. The mismatch crashes prerender with
    // "TypeError: a[d] is not a function". Flatten server chunkFilename so chunks
    // land in .next/server/ directly.
    if (isServer) {
      config.output = {
        ...config.output,
        chunkFilename: '[id].js',
      };
    }
    return config;
  },
  async headers() {
    // Note: Headers don't work with output: "export" (static export)
    // CSP headers are only applied in server environments
    if (process.env.NODE_ENV !== 'production') return [];

    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://*.jsdelivr.net https://www.google.com https://www.gstatic.com https://apis.emailjs.com https://www.googletagmanager.com https://rodneyrich.goatcounter.com https://gc.zgo.at/",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "img-src 'self' data: blob: https://www.google-analytics.com https://ssl.google-analytics.com https://www.googletagmanager.com https://www.google.com https://rodneyrich.goatcounter.com https://gc.zgo.at/",
              "font-src 'self' https://fonts.gstatic.com",
              "connect-src 'self' https://api.emailjs.com https://fonts.googleapis.com https://www.googletagmanager.com https://www.google-analytics.com https://ssl.google-analytics.com https://www.google.com https://pagead2.googlesyndication.com https://rodneyrich.goatcounter.com https://gc.zgo.at/ https://marine-api.open-meteo.com https://api.open-meteo.com https://geocoding-api.open-meteo.com https://api.bigdatacloud.net https://nominatim.openstreetmap.org https://cdn.jsdelivr.net https://*.jsdelivr.net",
              "media-src 'self'",
              "object-src 'none'",
              "worker-src 'self'",
              "child-src 'self'",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'"
            ].join('; ')
          }
        ]
      }
    ];
  }
};

export default withPWA(nextConfig);