import ConnectView from '@components/Connect/ConnectView'

export default async function ConnectPage({ params }: { params: Promise<{ orgslug: string }> }) {
  const { orgslug } = await params
  return <ConnectView orgslug={orgslug} />
}
