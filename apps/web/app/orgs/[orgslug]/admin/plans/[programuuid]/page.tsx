import TemplateDetail from '@components/Goals/admin/templates/TemplateDetail'

// `programuuid` carries a goal template uuid (templates kept their program uuids).
export default async function GoalTemplatePage({ params }: { params: Promise<{ orgslug: string; programuuid: string }> }) {
  const { orgslug, programuuid } = await params
  return <TemplateDetail orgslug={orgslug} templateUuid={decodeURIComponent(programuuid)} subpage="overview" />
}
