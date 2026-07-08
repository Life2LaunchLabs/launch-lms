import IssuingAdminShell from '@components/Learning/IssuingAdminShell'
import { getServerSession } from '@/lib/auth/server'
import { getOrganizationContextInfo } from '@services/organizations/orgs'
import { getLearningBadgeCollections } from '@services/learning/learning'

const validTabs = new Set(['collections', 'marketplace', 'issuing', 'grading'])

export default async function AdminBadgesPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgslug: string }>
  searchParams: Promise<{ tab?: string }>
}) {
  const { orgslug } = await params
  const { tab } = await searchParams
  const org = await getOrganizationContextInfo(orgslug, { revalidate: 1800, tags: ['organizations'] })
  const session = await getServerSession()
  let collections: any[] = []
  try {
    const response = await getLearningBadgeCollections(org.id, session?.tokens?.access_token, true, { revalidate: 0, tags: ['learning-badges'] })
    collections = response.success ? response.data : response
  } catch {
    collections = []
  }
  const initialTab = validTabs.has(tab || '') ? tab as 'collections' | 'marketplace' | 'issuing' | 'grading' : 'collections'
  return <IssuingAdminShell orgslug={orgslug} orgId={org.id} collections={collections} initialTab={initialTab} />
}
