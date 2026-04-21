import ResourcesClient from './resources'

export default async function ResourcesPage(props: { params: Promise<{ orgslug: string }> }) {
  const { orgslug } = await props.params
  return <ResourcesClient orgslug={orgslug} />
}
