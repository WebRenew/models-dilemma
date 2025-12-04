import type React from "react"
import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import { Analytics } from "@vercel/analytics/react"
import "./globals.css"

const _geist = Geist({ subsets: ["latin"] })
const _geistMono = Geist_Mono({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "The Model's Dilemma",
  description:
    "A recreation of Robert Axelrod's 1984 experiment on Game Theory's classic thought experiment the Prisoner's Dilemma with LLMs.",
  generator: 'v0.app',
  metadataBase: new URL('https://modelsdilemma.ai'),
  openGraph: {
    title: "The Model's Dilemma",
    description: "A recreation of Robert Axelrod's 1984 experiment on the Prisoner's Dilemma with LLMs.",
    type: 'website',
    url: 'https://modelsdilemma.ai',
    siteName: "The Model's Dilemma",
    images: [
      {
        url: '/og.png',
        width: 1200,
        height: 630,
        alt: "The Model's Dilemma - Prisoner's Dilemma with LLMs",
      },
    ],
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
    title: "The Model's Dilemma",
    description: "A recreation of Robert Axelrod's 1984 experiment on the Prisoner's Dilemma with LLMs.",
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
      <body className="font-sans antialiased">
        {children}
        <Analytics />
      </body>
    </html>
  )
}
