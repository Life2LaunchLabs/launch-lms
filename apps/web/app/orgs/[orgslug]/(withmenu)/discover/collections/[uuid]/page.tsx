import { notFound } from 'next/navigation'
import { getServerSession } from '@/lib/auth/server'
import { getOrganizationContextInfo } from '@services/organizations/orgs'
import { planJoiningApi } from '@services/goals/planJoining'
import CollectionPage from '@components/Discover/CollectionPage'

export default async function DiscoverCollectionRoute(props: { params: Promise<{ orgslug: string; uuid: string }> }) {
  const { orgslug, uuid } = await props.params
  const [session, org] = await Promise.all([getServerSession(), getOrganizationContextInfo(orgslug, { revalidate: 1800, tags: ['organizations'] }).catch(() => null)])
  const feed = await planJoiningApi.discover(session?.tokens?.access_token ?? undefined, undefined, org?.id, { revalidate: 0 }).catch(() => null)
  const collection = feed?.collections.find((item) => item.collection_uuid === uuid)
  if (!collection) notFound()
  return <CollectionPage orgslug={orgslug} initialCollection={collection} />
}
