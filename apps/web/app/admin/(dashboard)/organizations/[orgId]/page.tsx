import { redirect } from 'next/navigation'
import { getDefaultOrg, getUriWithOrg } from '@services/config/config'

export default function AdminOrganizationDetailPage({
  params,
}: {
  params: { orgId: string }
}) {
  redirect(getUriWithOrg(getDefaultOrg(), `/dash/org-management/${params.orgId}`))
}
