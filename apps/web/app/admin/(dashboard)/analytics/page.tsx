import { redirect } from 'next/navigation'
import { getDefaultOrg, getUriWithOrg } from '@services/config/config'

export default function AdminAnalyticsPage() {
  redirect(getUriWithOrg(getDefaultOrg(), '/dash/org-management/analytics'))
}
