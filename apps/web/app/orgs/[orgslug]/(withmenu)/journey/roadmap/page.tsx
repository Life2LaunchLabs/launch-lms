import RoadmapBuildWorkspace from './build-workspace-blocks'

export default async function RoadmapPage(props: {
  params: Promise<{ orgslug: string }>
}) {
  const { orgslug } = await props.params
  return <RoadmapBuildWorkspace orgslug={orgslug} />
}
