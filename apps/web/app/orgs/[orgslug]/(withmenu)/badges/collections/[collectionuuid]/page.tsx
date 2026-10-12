import { notFound } from 'next/navigation'
import { getServerSession } from '@/lib/auth/server'
import CollectionPage from '@components/Badges/detail/CollectionPage'
import { badgeDiscoverApi } from '@services/learning/badgeDiscover'

export default async function BadgeCollectionRoute(props: { params: Promise<{ orgslug: string; collectionuuid: string }> }) {
  const { orgslug, collectionuuid } = await props.params
  const session = await getServerSession()
  const collection = await badgeDiscoverApi.collection(collectionuuid, session?.tokens?.access_token ?? undefined, { revalidate: 0, tags: ['learning-badges'] }).catch(() => null)
  if (!collection) notFound()
  return <CollectionPage orgslug={orgslug} initialCollection={collection} />
}
