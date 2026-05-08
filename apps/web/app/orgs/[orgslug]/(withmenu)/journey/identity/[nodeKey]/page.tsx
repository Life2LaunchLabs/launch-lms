import IdentityNodeClient from './node'

export default async function IdentityNodePage(props: {
  params: Promise<{ orgslug: string; nodeKey: string }>
}) {
  const { orgslug, nodeKey } = await props.params
  return <IdentityNodeClient orgslug={orgslug} nodeKey={decodeURIComponent(nodeKey)} />
}
