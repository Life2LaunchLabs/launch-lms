import PlanDetail from '@components/Goals/admin/plan/PlanDetail'

// `templateuuid` carries a goal template uuid.
export default async function GoalTemplatePage({ params }: { params: Promise<{ orgslug: string; templateuuid: string }> }) {
  const { orgslug, templateuuid } = await params
  return <PlanDetail orgslug={orgslug} templateUuid={decodeURIComponent(templateuuid)} />
}
