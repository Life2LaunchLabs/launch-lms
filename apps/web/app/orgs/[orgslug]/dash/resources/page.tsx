import ResourcesDashClient from './client'

export default async function ResourcesDashPage(props: { params: Promise<{ orgslug: string }> }) {
  const { orgslug } = await props.params
  return <ResourcesDashClient orgslug={orgslug} />
}
