import type React from "react"
import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import "./globals.css"

const _geist = Geist({ subsets: ["latin"] })
const _geistMono = Geist_Mono({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "The Model's Dilemma",
  description:
    "Testing whether LLMs are strategic reasoners or sophisticated mimics by pitting them against each other in Axelrod's classic Prisoner's Dilemma tournament.",
  generator: 'v0.app',
  metadataBase: new URL('https://models-dilemma.vercel.app'),
  openGraph: {
    title: "The Model's Dilemma",
    description: "Testing whether LLMs are strategic reasoners or sophisticated mimics by pitting them against each other in Axelrod's classic Prisoner's Dilemma tournament.",
    type: 'website',
    images: [
      {
        url: '/og.png',
        width: 1200,
        height: 630,
        alt: "The Model's Dilemma - AI Prisoner's Dilemma Tournament",
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: "The Model's Dilemma",
    description: "Testing whether LLMs are strategic reasoners or sophisticated mimics by pitting them against each other in Axelrod's classic Prisoner's Dilemma tournament.",
    images: ['/og.png'],
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="dark">
      <body className="font-sans antialiased">{children}</body>
    </html>
  )
}
