import type { Metadata } from "next";

/**
 * Site-wide metadata, rendered into <head> by Next via the re-export in
 * `layout.tsx`. Individual routes override title and description in their own
 * `layout.tsx`; everything else here is inherited.
 */

export const metadata: Metadata = {
  title: "DiveBlendr - A Custom Blend of Technical Diving Tools",
  description:
    "Professional technical diving tools including gas mixing, trimix analysis, MOD calculations, dive planning, marine conditions, and underwater photography. A custom blend of essential tools for technical divers.",
  keywords: [
    "nitrox calculator",
    "trimix calculator", 
    "MOD calculator",
    "gas mixing calculator",
    "technical diving calculator",
    "gas blending calculator",
    "dive planning tools",
    "SAC calculator",
    "surface air consumption",
    "maximum operating depth",
    "END calculator",
    "equivalent narcotic depth",
    "gas density calculator",
    "technical diving tools",
    "scuba diving calculator",
    "dive gas analyzer",
    "ppO2 calculator",
    "partial pressure oxygen",
    "helium calculation",
    "oxygen calculation",
    "bottom time calculator",
    "minimum gas calculator",
    "air consumption calculator",
    "RMV calculator",
    "respiratory minute volume",
    "marine conditions",
    "diving weather",
    "tide calculator",
    "underwater photography",
    "photo color correction",
    "diving safety tools",
    "rebreather calculations",
    "CCR diving",
    "open circuit diving",
    "progressive web app diving",
    "dive share card",
    "technical diving resources"
  ],
  authors: [{ name: "DiveBlendr" }],
  creator: "DiveBlendr",
  publisher: "DiveBlendr",
  category: "Technical Diving Tools",
  classification: "Technical Diving Software",
  metadataBase: new URL("https://diveblendr.com"),
  openGraph: {
    title: "DiveBlendr — technical diving tools that show their working",
    description:
      "Best mix, MOD checks against oxygen, narcosis and density together, real-gas blending and consumption planning. Free, open source, and works offline.",
    type: "website",
    siteName: "DiveBlendr",
    locale: "en_US",
    url: "https://diveblendr.com",
  },
  twitter: {
    card: "summary_large_image",
    title: "DiveBlendr — technical diving tools that show their working",
    description:
      "Best mix, MOD checks against oxygen, narcosis and density together, real-gas blending and consumption planning. Free, open source, and works offline.",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  verification: {
    google: process.env.GOOGLE_SITE_VERIFICATION,
  },
  icons: {
    icon: [
      { url: "/icons/icon16.png", sizes: "16x16", type: "image/png" },
      { url: "/icons/icon32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon48.png", sizes: "48x48", type: "image/png" },
      { url: "/icons/icon96.png", sizes: "96x96", type: "image/png" },
      { url: "/icons/icon128.png", sizes: "128x128", type: "image/png" },
    ],
    apple: "/icons/icon128.png",
  },
};
