import TemplateDetail from '@components/Goals/admin/templates/TemplateDetail'

// `templateuuid` carries a goal template uuid.
export default async function GoalTemplatePage({ params }: { params: Promise<{ orgslug: string; templateuuid: string }> }) {
  const { orgslug, templateuuid } = await params
  return <TemplateDetail orgslug={orgslug} templateUuid={decodeURIComponent(templateuuid)} subpage="overview" />
}
