import RoadmapDetailsClient from './roadmap-details'

export default async function RoadmapDetailsPage(props: {
  params: Promise<{ orgslug: string }>
  searchParams: Promise<{ path?: string }>
}) {
  const { orgslug } = await props.params
  const { path } = await props.searchParams
  return <RoadmapDetailsClient orgslug={orgslug} initialPathUuid={path} />
}
