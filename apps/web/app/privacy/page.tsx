import type { Metadata } from 'next'
import LegalPage from '@components/Legal/LegalPage'
import { getHostOrgSlug } from '@services/org/orgResolution'
import { PRIVACY_LEDE, PRIVACY_SECTIONS, PRIVACY_UPDATED } from '@/lib/legal/privacy'

// The public Privacy Policy (v0.10.0 GS-3, DEV-23): signed out, on every Life2Launch address. Its text is lib/legal/privacy.tsx.

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'What Life2Launch collects, why, who can see it, how long it is kept, and how schools, students and parents can see, correct or delete it.',
}

export default async function PrivacyPage() {
  return <LegalPage orgslug={await getHostOrgSlug()} title="Privacy Policy" lede={PRIVACY_LEDE} updated={PRIVACY_UPDATED} sections={PRIVACY_SECTIONS} current="/privacy" />
}
