import type { Metadata } from 'next'
import LegalPage from '@components/Legal/LegalPage'
import { getHostOrgSlug } from '@services/org/orgResolution'
import { TERMS_LEDE, TERMS_SECTIONS, TERMS_UPDATED } from '@/lib/legal/terms'

// The public Terms of Use (v0.10.0 GS-3, DEV-23): signed out, on every Life2Launch address. Its text is lib/legal/terms.tsx.

export const metadata: Metadata = {
  title: 'Terms of Use',
  description: 'The terms for schools, organizations, their staff and their students using Life2Launch.',
}

export default async function TermsPage() {
  return <LegalPage orgslug={await getHostOrgSlug()} title="Terms of Use" lede={TERMS_LEDE} updated={TERMS_UPDATED} sections={TERMS_SECTIONS} current="/terms" />
}
