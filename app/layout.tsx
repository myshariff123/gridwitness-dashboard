import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'GridWitness — Hardware-Anchored ESG Compliance',
  description: 'Canada\'s first hardware-verified AI compute attestation platform. OSFI B-15 · Bill C-59 · ISO 14064-1.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-gw-dark text-white min-h-screen font-sans antialiased">
        {children}
      </body>
    </html>
  )
}
