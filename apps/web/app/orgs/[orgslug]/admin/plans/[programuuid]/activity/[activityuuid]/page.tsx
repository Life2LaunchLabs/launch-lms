import { notFound } from 'next/navigation'
import LearningActivityEditor from '@components/Learning/LearningActivityEditor'
import { getServerSession } from '@/lib/auth/server'
import { getOrganizationContextInfo } from '@services/organizations/orgs'
import { planningApi } from '@services/planning/planning'

/** Edits the activity a plan template objective plays. Template activities save in place. */
export default async function TemplateActivityEditorPage({ params }: { params: Promise<{ orgslug: string; programuuid: string; activityuuid: string }> }) {
  const { orgslug, programuuid, activityuuid } = await params
  const session = await getServerSession()
  const token = session?.tokens?.access_token
  if (!token) notFound()
  let data: any
  try {
    const org = await getOrganizationContextInfo(orgslug, { revalidate: 1800, tags: ['organizations'] })
    data = await planningApi.templateActivity(Number(org.id), programuuid, activityuuid.startsWith('learning_activity_') ? activityuuid : `learning_activity_${activityuuid}`, token)
  } catch {
    notFound()
  }
  // The editor reads its owner's name, org and whether it is editable; a template activity is always editable.
  const owner = { badge: { badge_uuid: null, name: data.template.name, org_id: data.template.org_id, selected_version: { state: 'draft' } } }
  return <LearningActivityEditor orgslug={orgslug} badgePath={owner} activity={data.activity} />
}
