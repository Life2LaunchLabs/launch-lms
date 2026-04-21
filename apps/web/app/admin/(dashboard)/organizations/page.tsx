import { redirect } from 'next/navigation'
import { getUriWithOrg } from '@services/config/config'
import { getOwnerOrgSlugServer } from '@services/org/ownerOrgServer'

export default async function AdminOrganizationsPage() {
  redirect(getUriWithOrg(await getOwnerOrgSlugServer(), '/dash/org-management'))
}
