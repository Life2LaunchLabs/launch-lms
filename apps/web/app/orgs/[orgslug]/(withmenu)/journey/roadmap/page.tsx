import RoadmapBuildWorkspace from './build-workspace'

export default async function RoadmapPage(props: {
  params: Promise<{ orgslug: string }>
}) {
  const { orgslug } = await props.params
  return <RoadmapBuildWorkspace orgslug={orgslug} />
}
