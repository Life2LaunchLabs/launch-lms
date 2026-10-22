import { notFound } from 'next/navigation'
import TemplateDetail, { type TemplateSubpage } from '@components/Goals/admin/templates/TemplateDetail'

// Kept here: a value exported from a client module reaches a server component only as a reference.
const TEMPLATE_SUBPAGES: TemplateSubpage[] = ['overview', 'objectives', 'assignments', 'publish', 'settings']

export default async function GoalTemplateSubpage({ params }: { params: Promise<{ orgslug: string; templateuuid: string; subpage: string }> }) {
  const { orgslug, templateuuid, subpage } = await params
  if (!TEMPLATE_SUBPAGES.includes(subpage as TemplateSubpage)) notFound()
  return <TemplateDetail orgslug={orgslug} templateUuid={decodeURIComponent(templateuuid)} subpage={subpage as TemplateSubpage} />
}
