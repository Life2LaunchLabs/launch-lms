import IssuingAdminShell from '@components/Learning/IssuingAdminShell'
import { getOrganizationContextInfo } from '@services/organizations/orgs'

export default async function AdminBadgeMarketplacePage({ params }: { params: Promise<{ orgslug: string }> }) {
  const { orgslug } = await params
  const org = await getOrganizationContextInfo(orgslug, { revalidate: 1800, tags: ['organizations'] })
  return <IssuingAdminShell orgId={org.id} />
}
