import { redirect } from 'next/navigation'

const AccountPage = async (props: { params: Promise<{ orgslug: string }> }) => {
  const params = await props.params
  redirect(`/${params.orgslug}/account/security`)
}

export default AccountPage
