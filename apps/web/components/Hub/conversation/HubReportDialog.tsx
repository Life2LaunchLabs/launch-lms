'use client'

import { useState } from 'react'
import toast from 'react-hot-toast'
import { Loader2 } from 'lucide-react'
import { Button } from '@components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@components/ui/dialog'
import { reportHubMessage, type HubReportReason } from '@services/hub/reports'

import { tr } from '@/lib/tr'
const REASONS: { key: HubReportReason; label: string }[] = [
  { key: 'harmful', get label() { return tr('coach.hub_report_dialog.harmful_or_upsetting', 'Harmful or upsetting') } },
  { key: 'wrong', get label() { return tr('coach.hub_report_dialog.wrong_or_made_up', 'Wrong or made up') } },
  { key: 'unhelpful', get label() { return tr('coach.hub_report_dialog.not_helpful', 'Not helpful') } },
  { key: 'other', get label() { return tr('coach.hub_report_dialog.something_else', 'Something else') } },
]

type Props = {
  open: boolean
  // eslint-disable-next-line no-unused-vars
  onOpenChange: (open: boolean) => void
  messageId: string
  orgId: number
  accessToken: string
}

/** The learner tells the coaching team a Coach reply went wrong. */
export default function HubReportDialog({ open, onOpenChange, messageId, orgId, accessToken }: Props) {
  const [reason, setReason] = useState<HubReportReason | null>(null)
  const [note, setNote] = useState('')
  const [sending, setSending] = useState(false)

  const send = async () => {
    if (!reason) return
    setSending(true)
    try {
      await reportHubMessage(orgId, messageId, reason, note, accessToken)
      toast.success(tr('coach.hub_report_dialog.thanks_the_coaching_team_will', 'Thanks. The coaching team will look at it.'))
      onOpenChange(false)
      setReason(null)
      setNote('')
    } catch {
      toast.error(tr('coach.hub_report_dialog.your_report_could_not_be', 'Your report could not be sent. Try again.'))
    } finally {
      setSending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="space-y-4 sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{tr('coach.hub_report_dialog.report_this_reply', 'Report this reply')}</DialogTitle>
          <DialogDescription>{tr('coach.hub_report_dialog.the_coaching_team_will_see', 'The coaching team will see this conversation up to this reply and what Coach knew about you, without your name. It helps them make Coach better.')}</DialogDescription>
        </DialogHeader>
        <fieldset className="space-y-2">
          <legend className="mb-2 text-sm font-medium">{tr('coach.hub_report_dialog.what_went_wrong', 'What went wrong?')}</legend>
          {REASONS.map((item) => (
            <label key={item.key} className="flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm has-[:checked]:border-foreground">
              <input type="radio" name="report-reason" value={item.key} checked={reason === item.key} onChange={() => setReason(item.key)} />
              {item.label}
            </label>
          ))}
        </fieldset>
        <label className="block text-sm font-medium">
          {tr('coach.hub_report_dialog.anything_else', 'Anything else?')}{' '}<span className="font-normal text-muted-foreground">{tr('coach.hub_report_dialog.optional', '(optional)')}</span>
          <textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={1000} rows={3} className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-normal" />
        </label>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{tr('coach.hub_memory_items.cancel', 'Cancel')}</Button>
          <Button type="button" onClick={() => void send()} disabled={!reason || sending}>{sending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{tr('coach.hub_report_dialog.send_report', 'Send report')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
