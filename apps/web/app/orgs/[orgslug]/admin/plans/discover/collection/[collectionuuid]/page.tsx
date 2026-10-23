import DiscoverCollectionPage from '@components/Plans/discover/DiscoverCollectionPage'

export default async function DiscoverCollectionRoute({ params }: { params: Promise<{ orgslug: string; collectionuuid: string }> }) {
  const { orgslug, collectionuuid } = await params
  return <DiscoverCollectionPage orgslug={orgslug} collectionUuid={decodeURIComponent(collectionuuid)} />
}
