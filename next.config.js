/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  trailingSlash: true,
  // Nothing to trace: `output: export` ships static HTML/JS with no server
  // bundle. Next 15 has no `outputFileTracing: false` switch (only Root /
  // Excludes / Includes), so an earlier attempt to set one was silently ignored.
  // The service worker is generated after the export completes, by
  // `scripts/build-sw.mjs` (wired up as the `postbuild` script). No PWA plugin
  // participates in the webpack compile — see that file for the rationale.
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

export default nextConfig;