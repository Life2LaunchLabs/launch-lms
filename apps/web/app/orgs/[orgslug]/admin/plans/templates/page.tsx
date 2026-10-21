import { TemplatesPage } from '@components/Goals/admin/GoalsAdminPages'

export default async function GoalTemplatesPage({ params }: { params: Promise<{ orgslug: string }> }) {
  const { orgslug } = await params
  return <TemplatesPage orgslug={orgslug} />
}
