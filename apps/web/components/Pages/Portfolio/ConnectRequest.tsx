'use client'

import React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import useSWR from 'swr'
import toast from 'react-hot-toast'
import { Check, Loader2, UserPlus } from 'lucide-react'
import { Button } from '@components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@components/ui/dialog'
import { Textarea } from '@components/ui/textarea'
import { routePaths } from '@services/config/config'
import { connectApi, connectUrl, type ConnectRequestState } from '@services/connect/connect'

const NOTE_MAX = 500

/** Signed out, the Connect button asks the visitor to sign in (or make an account) and brings them back here. */
export function SignInToConnect() {
  const pathname = usePathname()
  return <Button variant="surface" size="sm" asChild><Link href={routePaths.auth.login({ next: pathname || undefined })}><UserPlus className="h-4 w-4" />Connect</Link></Button>
}

export const requestKey = (portfolioUuid: string) => connectUrl(`/portfolios/${portfolioUuid}/request`)

export function useConnectRequest(portfolioUuid: string | undefined, token: string | undefined, enabled: boolean) {
  return useSWR<ConnectRequestState>(enabled && token && portfolioUuid ? requestKey(portfolioUuid) : null, () => connectApi.requestState(portfolioUuid!, token))
}

/**
 * Ask someone you found by their shared portfolio to connect: a short note that reaches them as a request in Connect.
 * They accept or decline it, and you only ask once.
 */
export function ConnectRequestButton({ portfolioUuid, name, token, state, onSent }: { portfolioUuid: string; name: string; token: string; state: ConnectRequestState; onSent: React.Dispatch<ConnectRequestState> }) {
  const [open, setOpen] = React.useState(false)
  const [note, setNote] = React.useState('')
  const [sending, setSending] = React.useState(false)
  if (state.status === 'asked') return <Button variant="surface" size="sm" disabled><Check className="h-4 w-4" />Requested</Button>
  if (state.status !== 'none' || !state.open) return null

  const send = async () => {
    setSending(true)
    try {
      onSent(await connectApi.askToConnect(portfolioUuid, note.trim(), token))
      setOpen(false)
      toast.success(`Request sent to ${name}`)
    } catch (error: any) {
      toast.error(error?.message || 'That request didn’t send')
    } finally {
      setSending(false)
    }
  }

  return <>
    <Button variant="surface" size="sm" onClick={() => setOpen(true)}><UserPlus className="h-4 w-4" />Connect</Button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Ask {name} to connect</DialogTitle>
          <DialogDescription>Say who you are and why you’re reaching out. {name} can accept or decline, and you can write more once they accept.</DialogDescription>
        </DialogHeader>
        <Textarea value={note} onChange={(event) => setNote(event.target.value.slice(0, NOTE_MAX))} rows={4} placeholder="Hi! I saw your project and…" aria-label="Your note" autoFocus />
        <p className="text-right text-xs text-muted-foreground">{note.length}/{NOTE_MAX}</p>
        <DialogFooter>
          <Button variant="surface" onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="brand" onClick={send} disabled={sending || !note.trim()}>{sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}Send request</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>
}
