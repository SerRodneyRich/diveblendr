import './globals.css'
import { Analytics } from '@vercel/analytics/next'
import Script from 'next/script'
import { Geist, Geist_Mono } from 'next/font/google'
import LayoutClient from '@/components/LayoutClient'

// Fonts
const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] })
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] })

/**
 * Analytics are OPTIONAL, and must actually be optional.
 *
 * `.env.example` says "leave blank to disable", but both scripts used to
 * render unconditionally. With the vars unset that produced, on every page:
 *
 *   - `gtag/js?id=undefined` — a request for a measurement ID literally named
 *     "undefined", which fails.
 *   - `//gc.zgo.at/count.js` — protocol-relative, so an HTTP page requests it
 *     over HTTP, where GoatCounter answers with a 301 HTML page. The browser
 *     parses that HTML as JavaScript and throws `Unexpected token '<'`.
 *
 * Read once at module scope so the checks below are plain booleans. These are
 * `NEXT_PUBLIC_` vars inlined at build time; `process.env` is not indexable
 * dynamically in a static export, so they must be written out in full.
 */
const GA_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim() || ''
const GOATCOUNTER_DOMAIN = process.env.NEXT_PUBLIC_GOATCOUNTER_DOMAIN?.trim() || ''

export { metadata } from './metadata'

export default function RootLayout({ children }: { children: React.ReactNode }) {

  return (
    <html lang="en">
      <head>
        {/* Title, description, keywords, icons, OpenGraph, Twitter cards and
            search-console verification all come from the `metadata` export
            below, which Next renders into this head. They used to be written
            by hand here as well — and the hand-written set was missing every
            OpenGraph and Twitter tag, so a shared link had no card, and
            GOOGLE_SITE_VERIFICATION reached nothing. */}
        {/* Apple/iOS PWA Meta Tags */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="DiveBlendr" />
        <meta name="mobile-web-app-capable" content="yes" />
        {/* Pinch-zoom must stay available: `user-scalable=no` is a WCAG 1.4.4 failure. */}
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="theme-color" content="#080d14" />
        {/* Apple Home Screen icons - iOS Standard Sizes */}
        <link rel="apple-touch-icon" href="/icons/icon180.png" />
        <link rel="apple-touch-icon" sizes="152x152" href="/icons/icon152.png" />
        <link rel="apple-touch-icon" sizes="167x167" href="/icons/icon167.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/icons/icon180.png" />
        <link rel="apple-touch-icon" sizes="192x192" href="/icons/icon192.png" />
        <link rel="apple-touch-icon" sizes="512x512" href="/icons/icon512.png" />
        {/* PWA manifest */}
        <link rel="manifest" href="/manifest.json" />

        {/* Preconnect for faster resource loading */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {GA_ID && <link rel="preconnect" href="https://www.googletagmanager.com" />}


        {/* Structured Data for SEO */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "WebApplication",
              "name": "DiveBlendr",
              "description": "A custom blend of technical diving tools including gas mixing, trimix analysis, MOD calculations, dive planning, marine conditions, and underwater photography",
              "url": "https://diveblendr.com",
              "applicationCategory": "UtilitiesApplication",
              "operatingSystem": "All",
              "offers": {
                "@type": "Offer",
                "price": "0",
                "priceCurrency": "USD"
              },
              "featureList": [
                "Nitrox Gas Calculator",
                "Trimix Gas Calculator",
                "Maximum Operating Depth (MOD) Calculator",
                "Gas Blending Calculator",
                "Surface Air Consumption (SAC) Calculator",
                "Bottom Time Calculator",
                "Equivalent Narcotic Depth (END) Calculator",
                "Gas Density Calculator",
                "Marine Conditions and Tides",
                "Underwater Photo Correction",
                "Dive Share Card"
              ],
              "audience": {
                "@type": "Audience",
                "audienceType": "Technical Divers"
              },
              "keywords": "nitrox calculator, trimix calculator, MOD calculator, gas mixing, technical diving, scuba diving calculator"
            })
          }}
        />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased`}>
        <LayoutClient>
          {children}
        </LayoutClient>

        {/* Analytics — loaded after interaction, no blocking, and only when
            actually configured. See the note on GA_ID above. */}
        {GA_ID && (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
              strategy="afterInteractive"
            />
            <Script id="google-analytics" strategy="afterInteractive">{`
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', '${GA_ID}');
            `}</Script>
          </>
        )}
        {GOATCOUNTER_DOMAIN && (
          <Script
            id="goatcounter"
            strategy="afterInteractive"
            data-goatcounter={`https://${GOATCOUNTER_DOMAIN}/count`}
            // Explicit https, not protocol-relative: over HTTP this host
            // answers with an HTML redirect page that parses as broken JS.
            src="https://gc.zgo.at/count.js"
          />
        )}
        <Analytics />
      </body>

    </html>
  )
}
