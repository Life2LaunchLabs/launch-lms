import ResourcePage from '@components/Resources/admin/ResourcePage'

export default async function ResourceRoute({ params }: { params: Promise<{ resourceuuid: string }> }) {
  const { resourceuuid } = await params
  return <ResourcePage resourceUuid={decodeURIComponent(resourceuuid)} />
}
