'use client'

import { Button } from '@components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@components/ui/dialog'

import { tr } from '@/lib/tr'
/**
 * Asks before Coach's session ends while it still has suggestions the learner hasn't reviewed.
 * Ending never removes them: they stay on the goal as suggestions.
 */
export default function EndSessionDialog({ open, unreviewed, title = tr('lit.end_session_dialog.end_coach_s_session', 'End Coach’s session?'), endLabel = tr('lit.end_session_dialog.end_session', 'End session'), keepLabel = tr('lit.plan_page.keep_going', 'Keep going'), onEnd, onKeep }: {
  open: boolean
  unreviewed: number
  title?: string
  endLabel?: string
  keepLabel?: string
  onEnd: () => void
  onKeep: () => void
}) {
  const left = unreviewed === 1 ? '1 suggestion you haven’t reviewed' : `${unreviewed} suggestions you haven’t reviewed`
  return <Dialog open={open} onOpenChange={(next) => { if (!next) onKeep() }}>
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{unreviewed ? tr('coach.end_session_dialog.left_will_stay_on_the', '{{left}} will stay on the goal as suggestions.', { left }) : tr('coach.end_session_dialog.you_can_start_a_new', 'You can start a new session with Coach any time.')}</DialogDescription>
      </DialogHeader>
      <DialogFooter className="gap-2">
        <Button type="button" variant="ghost" onClick={onKeep}>{keepLabel}</Button>
        <Button type="button" onClick={onEnd}>{endLabel}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
}
