import ConnectView from '@components/Connect/ConnectView'

/** Invitations and notices from organizations, open beside the list like a chat. */
export default async function ConnectUpdatesPage({ params }: { params: Promise<{ orgslug: string }> }) {
  const { orgslug } = await params
  return <ConnectView orgslug={orgslug} pane="updates" />
}
