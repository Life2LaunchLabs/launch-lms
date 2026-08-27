import { redirect } from 'next/navigation'
import { getUriWithOrg } from '@services/config/config'

export default async function LegacyProgramPage({ params }: { params: Promise<{ orgslug: string; programslug: string }> }) {
  const { orgslug } = await params
  redirect(getUriWithOrg(orgslug, '/plans'))
}
