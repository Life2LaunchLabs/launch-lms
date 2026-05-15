import RoadmapBuildWorkspace from '../build-workspace'

export default async function RoadmapOptionPage(props: {
  params: Promise<{ orgslug: string; roadmapUuid: string }>
}) {
  const { orgslug, roadmapUuid } = await props.params
  return <RoadmapBuildWorkspace orgslug={orgslug} roadmapUuid={roadmapUuid} />
}
