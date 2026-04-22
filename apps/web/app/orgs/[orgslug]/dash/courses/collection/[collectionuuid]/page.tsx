import { redirect } from 'next/navigation'
import { getUriWithOrg, routePaths } from '@services/config/config'

export default async function CollectionPage({
  params,
}: {
  params: Promise<{ orgslug: string; collectionuuid: string }>
}) {
  const { orgslug, collectionuuid } = await params
  redirect(getUriWithOrg(orgslug, routePaths.org.dash.collectionSettings(collectionuuid, 'general')))
}
