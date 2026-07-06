import { redirect } from 'next/navigation'
import { getUriWithOrg } from '@services/config/config'

export default async function AdminBadgePage({ params }: { params: Promise<{ orgslug: string; badgeuuid: string }> }) {
  const { orgslug, badgeuuid } = await params
  redirect(getUriWithOrg(orgslug, `/admin/badges/badge/${badgeuuid}/learning-path`))
}
