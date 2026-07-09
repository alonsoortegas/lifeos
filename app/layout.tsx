import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
  display: 'swap',
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
  display: 'swap',
})

// Runs before paint: applies the stored theme (or system preference) so the
// first frame is already in the right mode — no flash.
const THEME_INIT = `(function(){try{var t=localStorage.getItem('lifeos-theme');var l=t==='light'||(t!=='dark'&&window.matchMedia('(prefers-color-scheme: light)').matches);document.documentElement.classList.toggle('light',l)}catch(e){}})()`

export const metadata: Metadata = {
  title: 'LifeOS',
  description: 'Personal life operating system',
  manifest: '/manifest.json',
  icons: {
    icon: [
      { url: '/lifeos-icon.svg', type: 'image/svg+xml' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    shortcut: '/favicon.ico',
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'LifeOS',
  },
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f3f5fa' },
    { media: '(prefers-color-scheme: dark)', color: '#0b0d12' },
  ],
  width: 'device-width',
  initialScale: 1,
  // iOS auto-zooms when focusing inputs with font-size < 16px, and the zoom
  // persists after the keyboard closes — which detaches position:fixed
  // elements (TabBar, rest timer) from the screen while scrolling.
  // maximumScale: 1 disables that auto-zoom; manual pinch-zoom still works.
  maximumScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full`}
      suppressHydrationWarning
    >
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <link rel="manifest" href="/manifest.json" />
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
      </head>
      <body className="h-full antialiased">
        {children}
      </body>
    </html>
  )
}
