import { notFound } from 'next/navigation'
import AdminBadgeCollection from '@components/Learning/AdminBadgeCollection'
import { getServerSession } from '@/lib/auth/server'
import { getOrganizationContextInfo } from '@services/organizations/orgs'
import { getLearningBadgeCollections } from '@services/learning/learning'

export default async function AdminBadgeCollectionPage({ params }: { params: Promise<{ orgslug: string; collectionuuid: string; subpage: string }> }) {
  const { orgslug, collectionuuid, subpage } = await params
  const org = await getOrganizationContextInfo(orgslug, { revalidate: 1800, tags: ['organizations'] })
  const session = await getServerSession()
  const response = await getLearningBadgeCollections(org.id, session?.tokens?.access_token, true, { revalidate: 0, tags: ['learning-badges'] })
  const collections = response.success ? response.data : response
  const collection = collections.find((item: any) => item.collection_uuid === collectionuuid)
  if (!collection) notFound()
  return <AdminBadgeCollection orgslug={orgslug} orgId={org.id} collection={collection} subpage={subpage} />
}
