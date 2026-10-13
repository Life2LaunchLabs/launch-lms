import { notFound } from 'next/navigation'
import LearningActivityEditor from '@components/Learning/editor/LearningActivityEditor'
import { getServerSession } from '@/lib/auth/server'
import { getOrganizationContextInfo } from '@services/organizations/orgs'
import { planningApi } from '@services/planning/planning'

/** Edits the activity a plan template objective plays. Activities save in place. */
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
  return <LearningActivityEditor ownerName={data.template.name} orgId={Number(data.template.org_id)} activity={data.activity} />
}
