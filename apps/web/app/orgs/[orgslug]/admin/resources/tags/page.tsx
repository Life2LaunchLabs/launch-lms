import ResourcesTagsClient from './tags-client'

export default async function ResourcesTagsPage(props: { params: Promise<{ orgslug: string }> }) {
  const { orgslug } = await props.params
  return <ResourcesTagsClient orgslug={orgslug} />
}
