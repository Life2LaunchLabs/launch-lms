import AdminBadgesHome from '@components/Learning/AdminBadgesHome'
import { getServerSession } from '@/lib/auth/server'
import { getOrganizationContextInfo } from '@services/organizations/orgs'
import { getLearningBadgeCollections } from '@services/learning/learning'

export default async function AdminBadgesPage({ params }: { params: Promise<{ orgslug: string }> }) {
  const { orgslug } = await params
  const org = await getOrganizationContextInfo(orgslug, { revalidate: 1800, tags: ['organizations'] })
  const session = await getServerSession()
  let collections: any[] = []
  try {
    const response = await getLearningBadgeCollections(org.id, session?.tokens?.access_token, true, { revalidate: 0, tags: ['learning-badges'] })
    collections = response.success ? response.data : response
  } catch {
    collections = []
  }
  return <AdminBadgesHome orgslug={orgslug} orgId={org.id} collections={collections} />
}
