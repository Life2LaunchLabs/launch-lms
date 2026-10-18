'use client'

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@components/ui/dialog'
import { Textarea } from '@components/ui/textarea'
import { getConversationShare, shareConversation, unshareConversation, type ConversationShare } from '@services/hub/sharing'

/** The learner's choice to share one conversation with the people who coach Coach, and to take it back. */
export default function ShareWithCoachTeam({ open, onOpenChange, orgId, conversationUuid, accessToken }: {
  open: boolean
  // eslint-disable-next-line no-unused-vars
  onOpenChange: (_open: boolean) => void
  orgId?: number
  conversationUuid: string | null
  accessToken?: string
}) {
  const [share, setShare] = useState<ConversationShare | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open || !orgId || !conversationUuid || !accessToken) return
    setShare(null)
    setError('')
    getConversationShare(orgId, conversationUuid, accessToken).then((current) => { setShare(current); setNote(current.note) }).catch((reason) => setError(reason?.message || 'Could not check this conversation.'))
  }, [open, orgId, conversationUuid, accessToken])

  async function act(action: () => Promise<ConversationShare>) {
    setBusy(true)
    setError('')
    try {
      setShare(await action())
    } catch (reason: any) {
      setError(reason?.message || 'That did not work. Try again.')
    } finally {
      setBusy(false)
    }
  }

  const ready = Boolean(orgId && conversationUuid && accessToken)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Share with the coaching team</DialogTitle>
          <DialogDescription>
            The people who shape how Coach coaches can read this conversation and what Coach knew about you (your portfolio and goals), without your name. They use it to make Coach better. You can stop sharing any time.
          </DialogDescription>
        </DialogHeader>
        {!share && !error ? <p role="status" className="text-sm text-muted-foreground">Checking…</p> : null}
        {share?.shared ? (
          <p className="rounded-lg bg-muted/60 p-3 text-sm">You shared this conversation{share.note ? `: “${share.note}”` : '.'} Sharing again sends it as it is now.</p>
        ) : null}
        {share ? (
          <label className="block text-sm">
            <span className="font-medium">Anything they should know? (optional)</span>
            <Textarea className="mt-2" rows={2} maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} placeholder="What Coach got right, or where it missed" />
          </label>
        ) : null}
        {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
        <DialogFooter className="gap-2">
          {share?.shared ? <Button type="button" variant="outline" disabled={busy || !ready} onClick={() => void act(() => unshareConversation(orgId!, conversationUuid!, accessToken!))}>Stop sharing</Button> : null}
          <Button type="button" disabled={busy || !share || !ready} onClick={() => void act(() => shareConversation(orgId!, conversationUuid!, note, accessToken!))}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{share?.shared ? 'Share again' : 'Share'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
