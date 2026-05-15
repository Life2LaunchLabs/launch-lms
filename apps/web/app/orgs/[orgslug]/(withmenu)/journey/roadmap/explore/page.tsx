import RoadmapExploreClient from './roadmap-explore'

export default async function RoadmapExplorePage(props: {
  params: Promise<{ orgslug: string }>
  searchParams: Promise<{ insertInto?: string; targetBlock?: string }>
}) {
  const { orgslug } = await props.params
  const { insertInto, targetBlock } = await props.searchParams
  return <RoadmapExploreClient orgslug={orgslug} insertInto={insertInto} targetBlock={targetBlock} />
}
