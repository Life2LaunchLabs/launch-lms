import { redirect } from 'next/navigation'

export default async function ResourceChannelPage(props: { params: Promise<{ orgslug: string; channeluuid: string }> }) {
  const { orgslug, channeluuid } = await props.params
  redirect(`/${orgslug}/dash/resources/${channeluuid}/general`)
}
