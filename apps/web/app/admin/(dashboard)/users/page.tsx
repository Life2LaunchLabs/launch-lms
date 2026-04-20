import { redirect } from 'next/navigation'
import { getDefaultOrg, getUriWithOrg } from '@services/config/config'

export default function AdminUsersPage() {
  redirect(getUriWithOrg(getDefaultOrg(), '/dash/org-management/users'))
}
