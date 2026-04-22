import { redirect } from 'next/navigation'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { getOwnerOrgSlugServer } from '@services/org/ownerOrgServer'

export default async function AdminOrganizationDetailPage({
  params,
}: {
  params: { orgId: string }
}) {
  redirect(getUriWithOrg(await getOwnerOrgSlugServer(), routePaths.owner.platform.organization(params.orgId)))
}
