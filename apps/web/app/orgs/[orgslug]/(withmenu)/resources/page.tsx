import ResourcesClient from './resources'

export default async function ResourcesPage(props: {
  params: Promise<{ orgslug: string }>
  searchParams: Promise<{ channel?: string }>
}) {
  const { orgslug } = await props.params
  const searchParams = await props.searchParams

  return (
    <ResourcesClient
      orgslug={orgslug}
      initialChannelUuid={searchParams.channel}
    />
  )
}
