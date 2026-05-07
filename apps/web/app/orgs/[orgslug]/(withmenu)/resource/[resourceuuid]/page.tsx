import ResourceDetailClient from './resource'

export default async function ResourceDetailPage(props: { params: Promise<{ orgslug: string; resourceuuid: string }> }) {
  const { orgslug, resourceuuid } = await props.params
  return <ResourceDetailClient orgslug={orgslug} resourceUuid={`resource_${resourceuuid}`} />
}
