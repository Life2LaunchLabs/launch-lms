import { redirect } from 'next/navigation'
import { getUriWithOrg } from '@services/config/config'

export default async function LegacyProgramsPage({ params }: { params: Promise<{ orgslug: string }> }) {
  const { orgslug } = await params
  redirect(getUriWithOrg(orgslug, '/plans'))
}
