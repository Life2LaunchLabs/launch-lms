import IdentityClient from './identity'

export default async function IdentityPage(props: {
  params: Promise<{ orgslug: string }>
}) {
  const { orgslug } = await props.params
  return <IdentityClient orgslug={orgslug} />
}
