import AdminHome from '@components/Admin/Home/AdminHome'

export default async function AdminHomePage({ params }: { params: Promise<{ orgslug: string }> }) {
  const { orgslug } = await params
  return <AdminHome orgslug={orgslug} />
}
