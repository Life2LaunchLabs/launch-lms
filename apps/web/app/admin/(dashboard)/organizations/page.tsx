import { redirect } from 'next/navigation'
import { getDefaultOrg, getUriWithOrg } from '@services/config/config'

export default function AdminOrganizationsPage() {
  redirect(getUriWithOrg(getDefaultOrg(), '/dash/org-management'))
}
