import type { Metadata } from 'next'
import AccountRoute from '@components/Objects/Account/AccountRoute'

export const metadata: Metadata = { title: 'Appearance', robots: { index: false, follow: false } }

export default async function AppearancePage({ params }: { params: Promise<{ orgslug: string }> }) {
  const { orgslug } = await params
  return <AccountRoute orgslug={orgslug} tab="preferences" />
}
