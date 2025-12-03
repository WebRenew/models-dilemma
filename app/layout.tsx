import type React from "react"
import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import "./globals.css"

const _geist = Geist({ subsets: ["latin"] })
const _geistMono = Geist_Mono({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "The Model's Dilemma",
  description:
    "A recreation of Robert Axelrod's 1984 experiment on Game Theory's classic thought experiment the Prisoner's Dilemma.",
  generator: 'v0.app',
  metadataBase: new URL('https://models-dilemma.vercel.app'),
  openGraph: {
    title: "The Model's Dilemma",
    description: "A recreation of Robert Axelrod's 1984 experiment on the Prisoner's Dilemma with AI models.",
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: "The Model's Dilemma",
    description: "A recreation of Robert Axelrod's 1984 experiment on the Prisoner's Dilemma with AI models.",
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
