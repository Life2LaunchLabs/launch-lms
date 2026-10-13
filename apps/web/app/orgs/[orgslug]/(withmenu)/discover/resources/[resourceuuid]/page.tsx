import ResourceDetailPage from '@components/Discover/ResourceDetailPage'

export default async function DiscoverResourcePage({ params }: { params: Promise<{ orgslug: string; resourceuuid: string }> }) {
  const { orgslug, resourceuuid } = await params
  return <ResourceDetailPage orgslug={orgslug} resourceUuid={decodeURIComponent(resourceuuid)} />
}
