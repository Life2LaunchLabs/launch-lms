import { redirect } from 'next/navigation'
import { getUriWithOrg } from '@services/config/config'

export default async function AdminBadgeCollectionRedirect({
  params,
}: {
  params: Promise<{ orgslug: string; collectionuuid: string }>
}) {
  const { orgslug, collectionuuid } = await params
  redirect(getUriWithOrg(orgslug, `/admin/badges/collection/${collectionuuid}/badges`))
}
