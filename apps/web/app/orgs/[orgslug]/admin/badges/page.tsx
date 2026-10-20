import { redirect } from 'next/navigation'
import { BadgesPage } from '@components/Goals/admin/GoalsAdminPages'
import { getServerSession } from '@/lib/auth/server'
import { getOrganizationContextInfo } from '@services/organizations/orgs'
import { getLearningBadgeCollections } from '@services/learning/learning'
import { routePaths } from '@services/routing/paths'

export default async function AdminBadgesPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgslug: string }>
  searchParams: Promise<{ tab?: string }>
}) {
  const { orgslug } = await params
  const { tab } = await searchParams
  // The badge marketplace was a tab here; it is Plans › Marketplace now.
  if (tab === 'marketplace') redirect(routePaths.org.admin.badgeMarketplace())
  const org = await getOrganizationContextInfo(orgslug, { revalidate: 1800, tags: ['organizations'] })
  const session = await getServerSession()
  let collections: any[] = []
  try {
    const response = await getLearningBadgeCollections(org.id, session?.tokens?.access_token, true, { revalidate: 0, tags: ['learning-badges'] })
    collections = response.success ? response.data : response
  } catch {
    collections = []
  }
  return <BadgesPage orgslug={orgslug} orgId={org.id} collections={collections} />
}
