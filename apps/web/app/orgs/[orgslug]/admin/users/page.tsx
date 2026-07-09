import UsersAdminPage from '@components/Admin/Users/UsersAdminPage'

export default async function UsersPage({
  params,
}: {
  params: Promise<{ orgslug: string }>
}) {
  const { orgslug } = await params
  return <UsersAdminPage orgslug={orgslug} section="users" />
}
