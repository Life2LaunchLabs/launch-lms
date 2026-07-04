import AdminBadgesHome from '@components/Learning/AdminBadgesHome'
import { getServerSession } from '@/lib/auth/server'
import { getOrganizationContextInfo } from '@services/organizations/orgs'
import { getLearningBadgeCollections } from '@services/learning/learning'
import { getOrgCollections } from '@services/courses/collections'

function cleanLegacyCollectionId(value: string) {
  return String(value || '').replace(/^collection_/, '')
}

function migratedCollectionKeys(collection: any) {
  const cleanId = cleanLegacyCollectionId(collection.collection_uuid)
  return new Set([
    collection.collection_uuid,
    `badge_collection_migrated_${cleanId}`,
  ])
}

export default async function AdminBadgesPage({ params }: { params: Promise<{ orgslug: string }> }) {
  const { orgslug } = await params
  const org = await getOrganizationContextInfo(orgslug, { revalidate: 1800, tags: ['organizations'] })
  const session = await getServerSession()
  let collections: any[] = []
  let legacyCollections: any[] = []
  try {
    const response = await getLearningBadgeCollections(org.id, session?.tokens?.access_token, true, { revalidate: 0, tags: ['learning-badges'] })
    collections = response.success ? response.data : response
  } catch {
    collections = []
  }
  try {
    legacyCollections = await getOrgCollections(String(org.id), session?.tokens?.access_token, { revalidate: 0, tags: ['collections'] })
    const convertedCollectionUuids = new Set(collections.map((collection: any) => collection.collection_uuid))
    legacyCollections = legacyCollections.filter((collection: any) => {
      const ownerOrgId = collection.owner_org_id ?? collection.org_id
      if (ownerOrgId && Number(ownerOrgId) !== Number(org.id)) return false
      if (collection.is_shared_from_other_org) return false
      return ![...migratedCollectionKeys(collection)].some((key) => convertedCollectionUuids.has(key))
    })
  } catch {
    legacyCollections = []
  }
  return <AdminBadgesHome orgslug={orgslug} orgId={org.id} collections={collections} legacyCollections={legacyCollections} />
}
