import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'CXAllies',
  description: 'Intelligent AI/ERP Solutions',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  )
}
