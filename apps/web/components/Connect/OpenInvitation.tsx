'use client'

import React from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Loader2, MailQuestion } from 'lucide-react'
import { Button } from '@components/ui/button'
import { useAuth } from '@components/Contexts/AuthContext'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { connectApi } from '@services/connect/connect'
import { tr } from '@/lib/tr'

/**
 * Where an invitation email links. Signed out, it asks you to sign in and comes back; signed in
 * with the invited address, it opens the chat the invitation waits in, where you accept or decline
 * it. Signed in with another address, it says so and offers to switch accounts.
 */
export default function OpenInvitation({ orgslug, invitationUuid }: { orgslug: string; invitationUuid: string }) {
  const session = useLHSession() as any
  const { signOut } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const token: string | undefined = session?.data?.tokens?.access_token
  const [failed, setFailed] = React.useState<string | null>(null)
  const here = pathname || getUriWithOrg(orgslug, routePaths.org.invitation(invitationUuid))

  React.useEffect(() => {
    if (session?.status === 'unauthenticated') router.replace(routePaths.auth.login({ next: here }))
  }, [session?.status, here, router])

  React.useEffect(() => {
    if (!token) return
    let cancelled = false
    connectApi.invitation(invitationUuid, token)
      .then((found) => { if (!cancelled) router.replace(getUriWithOrg(orgslug, routePaths.org.chat(found.conversation_uuid))) })
      .catch((error: any) => { if (!cancelled) setFailed(error?.status === 404 ? 'elsewhere' : 'error') })
    return () => { cancelled = true }
  }, [token, invitationUuid, orgslug, router])

  if (!failed) {
    return <div className="flex min-h-[50dvh] items-center justify-center p-8 text-muted-foreground" role="status">
      <Loader2 className="mr-2 animate-spin" size={18} aria-hidden="true" />{tr('connect.open_invitation.opening', 'Opening your invitation…')}
    </div>
  }

  const email = session?.data?.user?.email as string | undefined
  return <div className="mx-auto flex min-h-[50dvh] max-w-sm flex-col items-center justify-center gap-3 p-6 text-center">
    <MailQuestion size={36} className="text-muted-foreground" aria-hidden="true" />
    <h1 className="text-xl font-black tracking-tight">
      {failed === 'elsewhere' ? tr('connect.open_invitation.not_here', 'This invitation isn’t for this account') : tr('connect.open_invitation.didnt_open', 'The invitation didn’t open')}
    </h1>
    <p className="text-sm text-muted-foreground">
      {failed === 'elsewhere'
        ? email
          ? tr('connect.open_invitation.signed_in_as', 'You’re signed in as {{email}}. Sign in with the address the invitation was sent to, or it may have been withdrawn.', { email })
          : tr('connect.open_invitation.sign_in_with_invited', 'Sign in with the address the invitation was sent to, or it may have been withdrawn.')
        : tr('connect.open_invitation.try_again_later', 'Something went wrong. Try again, or find it in your chats.')}
    </p>
    <div className="mt-2 flex flex-col gap-2 sm:flex-row">
      {failed === 'elsewhere'
        ? <Button variant="brand" onClick={() => signOut({ callbackUrl: routePaths.auth.login({ next: here }) })}>{tr('connect.open_invitation.switch_account', 'Sign in with another account')}</Button>
        : <Button variant="brand" onClick={() => window.location.reload()}>{tr('connect.open_invitation.try_again', 'Try again')}</Button>}
      <Button variant="outline" asChild><Link href={getUriWithOrg(orgslug, routePaths.org.connect())}>{tr('connect.open_invitation.open_chats', 'Open your chats')}</Link></Button>
    </div>
  </div>
}
