import { notFound } from 'next/navigation'
import TemplateDetail, { TEMPLATE_SUBPAGES, type TemplateSubpage } from '@components/Goals/admin/templates/TemplateDetail'

export default async function GoalTemplateSubpage({ params }: { params: Promise<{ orgslug: string; programuuid: string; subpage: string }> }) {
  const { orgslug, programuuid, subpage } = await params
  if (!TEMPLATE_SUBPAGES.includes(subpage as TemplateSubpage)) notFound()
  return <TemplateDetail orgslug={orgslug} templateUuid={decodeURIComponent(programuuid)} subpage={subpage as TemplateSubpage} />
}
