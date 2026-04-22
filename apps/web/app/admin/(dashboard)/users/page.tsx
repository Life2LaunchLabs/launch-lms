import { redirect } from 'next/navigation'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { getOwnerOrgSlugServer } from '@services/org/ownerOrgServer'

export default async function AdminUsersPage() {
  redirect(getUriWithOrg(await getOwnerOrgSlugServer(), routePaths.owner.platform.users()))
}
