import './globals.css'
import { Analytics } from '@vercel/analytics/next'
import Script from 'next/script'
import { Geist, Geist_Mono } from 'next/font/google'
import LayoutClient from '@/components/LayoutClient'

// Fonts
const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] })
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] })

export default function RootLayout({ children }: { children: React.ReactNode }) {

  return (
    <html lang="en">
      <head>
        <title>DiveBlendr - A Custom Blend of Technical Diving Tools</title>
        <meta name="description" content="Professional technical diving tools including gas mixing, trimix analysis, MOD calculations, dive planning, marine conditions, and underwater photography. A custom blend of essential tools for technical divers." />
        <meta name="keywords" content="nitrox calculator, trimix calculator, MOD calculator, gas mixing calculator, technical diving calculator, gas blending, dive planning, SAC calculator, maximum operating depth, END calculator" />
        {/* Apple/iOS PWA Meta Tags */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="DiveBlendr" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no" />
        {/* Apple Home Screen icons - iOS Standard Sizes */}
        <link rel="apple-touch-icon" href="/icons/icon180.png" />
        <link rel="apple-touch-icon" sizes="152x152" href="/icons/icon152.png" />
        <link rel="apple-touch-icon" sizes="167x167" href="/icons/icon167.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/icons/icon180.png" />
        <link rel="apple-touch-icon" sizes="192x192" href="/icons/icon192.png" />
        <link rel="apple-touch-icon" sizes="512x512" href="/icons/icon512.png" />
        {/* Favicon */}
        <link rel="shortcut icon" href="/icons/icon32.png" />
        <link rel="icon" type="image/png" sizes="32x32" href="/icons/icon32.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/icons/icon16.png" />
        {/* PWA manifest */}
        <link rel="manifest" href="/manifest.json" />

        {/* Preconnect for faster resource loading */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="preconnect" href="https://www.googletagmanager.com" />
        <link rel="preconnect" href="https://api.emailjs.com" />


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
                "Marine Conditions Checker",
                "Underwater Photo Correction"
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
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <LayoutClient>
          {children}
        </LayoutClient>

        {/* Analytics - loaded after interaction, no blocking */}
        <Script src={`https://www.googletagmanager.com/gtag/js?id=${process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID}`} strategy="afterInteractive" />
        <Script id="google-analytics" strategy="afterInteractive">{`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID}');
        `}</Script>
        <Script id="goatcounter" strategy="afterInteractive"
          data-goatcounter={`https://${process.env.NEXT_PUBLIC_GOATCOUNTER_DOMAIN}/count`}
          src="//gc.zgo.at/count.js" />
        <Analytics />
      </body>

    </html>
  )
}
