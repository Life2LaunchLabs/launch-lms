'use client'

import { Button } from '@components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@components/ui/dialog'

/**
 * Asks before Coach's session ends while it still has suggestions the learner hasn't reviewed.
 * Ending never removes them: they stay on the goal as suggestions.
 */
export default function EndSessionDialog({ open, unreviewed, title = 'End Coach’s session?', endLabel = 'End session', keepLabel = 'Keep going', onEnd, onKeep }: {
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
        <DialogDescription>{unreviewed ? `${left} will stay on the goal as suggestions.` : 'You can start a new session with Coach any time.'}</DialogDescription>
      </DialogHeader>
      <DialogFooter className="gap-2">
        <Button type="button" variant="ghost" onClick={onKeep}>{keepLabel}</Button>
        <Button type="button" onClick={onEnd}>{endLabel}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
}
