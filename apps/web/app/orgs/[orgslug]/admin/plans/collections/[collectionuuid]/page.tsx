import CollectionPage from '@components/Plans/collections/CollectionPage'

export default async function PlanCollectionPage({ params }: { params: Promise<{ orgslug: string; collectionuuid: string }> }) {
  const { orgslug, collectionuuid } = await params
  return <CollectionPage orgslug={orgslug} collectionUuid={decodeURIComponent(collectionuuid)} />
}
