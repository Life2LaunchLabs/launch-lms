import { redirect } from 'next/navigation'

export default async function LegacyOrgManagementDetailPage({
  params,
}: {
  params: Promise<{ orgId: string }>
}) {
  const { orgId } = await params
  redirect(`/admin/platform/orgs/${orgId}`)
}
