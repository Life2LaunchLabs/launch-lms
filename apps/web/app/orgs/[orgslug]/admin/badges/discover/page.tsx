import DiscoverSettingsPanel from '@components/Badges/discover/DiscoverSettingsPanel'
import { getOrganizationContextInfo } from '@services/organizations/orgs'

export default async function DiscoverSettingsPage({ params }: { params: Promise<{ orgslug: string }> }) {
  const { orgslug } = await params
  const org = await getOrganizationContextInfo(orgslug, { revalidate: 0 })
  return <DiscoverSettingsPanel orgId={org.id} orgslug={orgslug} />
}
