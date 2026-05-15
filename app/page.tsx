import { redirect } from 'next/navigation'

// Root page redirects to monitor (main dashboard).
// Auth guard in monitor/page.tsx handles unauthenticated users.
export default function Home() {
  redirect('/monitor')
}
