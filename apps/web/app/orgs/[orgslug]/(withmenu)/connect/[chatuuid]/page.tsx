import ConnectView from '@components/Connect/ConnectView'

/** One chat, open beside the list on wide screens and on its own on phones. */
export default async function ChatPage({ params }: { params: Promise<{ orgslug: string; chatuuid: string }> }) {
  const { orgslug, chatuuid } = await params
  return <ConnectView orgslug={orgslug} chatUuid={decodeURIComponent(chatuuid)} />
}
