import OpenInvitation from '@components/Connect/OpenInvitation'

/** Where an invitation email links: finds the chat the invitation waits in and opens it. */
export default async function InvitationPage({ params }: { params: Promise<{ orgslug: string; invitationuuid: string }> }) {
  const { orgslug, invitationuuid } = await params
  return <OpenInvitation orgslug={orgslug} invitationUuid={decodeURIComponent(invitationuuid)} />
}
