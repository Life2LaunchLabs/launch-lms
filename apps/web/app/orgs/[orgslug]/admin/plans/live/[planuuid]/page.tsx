import AdminLivePlanDetail from '@components/Admin/Programs/AdminLivePlanDetail'

export default async function AdminLivePlanPage({ params }: { params: Promise<{ orgslug: string; planuuid: string }> }) {
  const { orgslug, planuuid } = await params
  return <AdminLivePlanDetail orgslug={orgslug} planUuid={decodeURIComponent(planuuid)} />
}
