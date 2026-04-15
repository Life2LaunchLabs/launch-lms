import ResourceDetailClient from './resource'

export default async function ResourceDetailPage(props: { params: Promise<{ orgslug: string; resourceuuid: string }> }) {
  const { resourceuuid } = await props.params
  return <ResourceDetailClient resourceUuid={`resource_${resourceuuid}`} />
}
