import { redirect } from 'next/navigation'
import { getDefaultOrg, getUriWithOrg } from '@services/config/config'

export default function AdminPage() {
  redirect(getUriWithOrg(getDefaultOrg(), '/dash/org-management'))
}
