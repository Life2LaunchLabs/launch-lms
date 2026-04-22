import { redirect } from 'next/navigation'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { getOwnerOrgSlugServer } from '@services/org/ownerOrgServer'

export default async function AdminPage() {
  redirect(getUriWithOrg(await getOwnerOrgSlugServer(), routePaths.owner.platform.organizations()))
}
