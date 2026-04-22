import { redirect } from 'next/navigation'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { getOwnerOrgSlugServer } from '@services/org/ownerOrgServer'

export default async function AdminOrganizationsPage() {
  redirect(getUriWithOrg(await getOwnerOrgSlugServer(), routePaths.owner.platform.organizations()))
}
