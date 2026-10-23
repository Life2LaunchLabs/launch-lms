import { notFound } from 'next/navigation'
import PlanDetail, { type PlanPanel } from '@components/Goals/admin/plan/PlanDetail'

// The plan used to have tabs; their links now open the one plan page, with settings or publishing open.
const PANELS: Record<string, PlanPanel> = { overview: null, objectives: null, assignments: null, settings: 'settings', publish: 'visibility', versions: 'versions' }

export default async function GoalTemplateSubpage({ params }: { params: Promise<{ orgslug: string; templateuuid: string; subpage: string }> }) {
  const { orgslug, templateuuid, subpage } = await params
  if (!(subpage in PANELS)) notFound()
  return <PlanDetail orgslug={orgslug} templateUuid={decodeURIComponent(templateuuid)} panel={PANELS[subpage]} />
}
