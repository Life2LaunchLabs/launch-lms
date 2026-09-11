import { redirect } from 'next/navigation'

export default async function LegacyFeedbackPage({ params }: { params: Promise<{ orgslug: string }> }) {
  const { orgslug } = await params
  redirect(`/orgs/${orgslug}/admin/platform/feedback`)
}
