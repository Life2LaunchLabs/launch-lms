import { notFound } from 'next/navigation'
import LearningActivityEditor from '@components/Learning/editor/LearningActivityEditor'
import { getServerSession } from '@/lib/auth/server'
import { getOrganizationContextInfo } from '@services/organizations/orgs'
import { templatesApi } from '@services/goals/templates'

/** Edits the activity a goal template's activity step plays. Edits change the draft; learners get them on publish. */
export default async function TemplateActivityEditorPage({ params }: { params: Promise<{ orgslug: string; templateuuid: string; activityuuid: string }> }) {
  const { orgslug, templateuuid, activityuuid } = await params
  const session = await getServerSession()
  const token = session?.tokens?.access_token
  if (!token) notFound()
  let data: Awaited<ReturnType<typeof templatesApi.activity>>
  try {
    const org = await getOrganizationContextInfo(orgslug, { revalidate: 1800, tags: ['organizations'] })
    data = await templatesApi.activity(Number(org.id), decodeURIComponent(templateuuid), activityuuid.startsWith('learning_activity_') ? activityuuid : `learning_activity_${activityuuid}`, token)
  } catch {
    notFound()
  }
  return <LearningActivityEditor ownerName={data.template.title} orgId={Number(data.template.org_id)} activity={data.activity} />
}
