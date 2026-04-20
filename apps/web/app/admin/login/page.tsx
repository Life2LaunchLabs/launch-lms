import { redirect } from 'next/navigation'
import { getDefaultOrg, getUriWithOrg } from '@services/config/config'

export default function AdminLoginPage() {
  redirect(getUriWithOrg(getDefaultOrg(), '/login'))
}
