import AccountRoute from '@components/Objects/Account/AccountRoute'

const AccountPage = async (props: { params: Promise<{ orgslug: string }> }) => {
  const params = await props.params
  return <AccountRoute orgslug={params.orgslug} tab="account" />
}

export default AccountPage
