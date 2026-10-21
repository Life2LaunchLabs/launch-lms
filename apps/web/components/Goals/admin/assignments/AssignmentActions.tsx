'use client'

import React from 'react'
import toast from 'react-hot-toast'
import { CalendarDays, Loader2, MoreHorizontal, Pause, Play, Square } from 'lucide-react'
import { Button } from '@components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@components/ui/dropdown-menu'
import { goalAdminApi } from '@services/goals/admin'
import { assignmentLabel, type AssignmentRow } from './shared'

type Props = {
  assignment: AssignmentRow
  orgId: number
  token?: string
  /** Called once a change is saved, to reload whatever lists the assignment. */
  onChanged: () => unknown
  /** A row's menu is a quiet icon; the assignment's own page shows its buttons. */
  compact?: boolean
}

/**
 * Running an assignment, for admins: pause it (learners keep working, nobody new joins), resume
 * it, end it for good (learners keep their plans), or move its start and end dates.
 */
export default function AssignmentActions({ assignment, orgId, token, onChanged, compact = false }: Props) {
  const [busy, setBusy] = React.useState(false)
  const [dating, setDating] = React.useState(false)
  if (assignment.status === 'ended') return null
  const label = `${assignment.template_title} · ${assignmentLabel(assignment)}`
  const run = async (change: () => Promise<unknown>, done: string) => {
    setBusy(true)
    try { await change(); toast.success(done); await onChanged(); return true } catch (error: any) { toast.error(error?.message || 'That didn’t go through'); return false } finally { setBusy(false) }
  }
  const pause = () => run(() => goalAdminApi.pause(orgId, assignment.assignment_uuid, token), 'Paused. Learners keep their plans and can keep working.')
  const resume = () => run(() => goalAdminApi.resume(orgId, assignment.assignment_uuid, token), 'Resumed.')
  const end = () => {
    if (!window.confirm(`End ${label}? Learners keep their plans as they are, and it can’t be resumed.`)) return
    void run(() => goalAdminApi.end(orgId, assignment.assignment_uuid, token), 'Ended. It moves to past assignments.')
  }
  const paused = assignment.status === 'paused'
  const dialog = <DatesDialog open={dating} setOpen={setDating} assignment={assignment} label={label}
    onSave={(dates) => run(() => goalAdminApi.updateAssignment(orgId, assignment.assignment_uuid, dates, token), 'Dates saved. Learners’ plans moved with them.')} />

  if (compact) return <>
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="icon" className="h-8 w-8" disabled={busy} aria-label={`Manage ${label}`} onClick={(event) => event.stopPropagation()}>
          {busy ? <Loader2 size={15} className="animate-spin" /> : <MoreHorizontal size={16} />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(event) => event.stopPropagation()}>
        <DropdownMenuItem onSelect={() => setDating(true)}><CalendarDays size={14} className="mr-2" />Edit dates</DropdownMenuItem>
        {paused ? <DropdownMenuItem onSelect={() => void resume()}><Play size={14} className="mr-2" />Resume</DropdownMenuItem>
          : <DropdownMenuItem onSelect={() => void pause()}><Pause size={14} className="mr-2" />Pause</DropdownMenuItem>}
        <DropdownMenuItem onSelect={end} className="text-red-600"><Square size={14} className="mr-2" />End</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
    {dialog}
  </>
  return <div className="flex flex-wrap gap-2">
    <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => setDating(true)}><CalendarDays size={14} />Edit dates</Button>
    {paused ? <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void resume()}><Play size={14} />Resume</Button>
      : <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void pause()}><Pause size={14} />Pause</Button>}
    <Button type="button" variant="outline" size="sm" disabled={busy} onClick={end} className="text-red-700"><Square size={14} />End</Button>
    {dialog}
  </div>
}

type Dates = { start_date: string | null; due_date: string | null }

function DatesDialog({ open, setOpen, assignment, label, onSave }: { open: boolean; setOpen: (open: boolean) => void; assignment: AssignmentRow; label: string; onSave: (dates: Dates) => Promise<boolean> }) { // eslint-disable-line no-unused-vars
  const [draft, setDraft] = React.useState({ start: assignment.start_date || '', due: assignment.due_date || '' })
  const [saving, setSaving] = React.useState(false)
  React.useEffect(() => { if (open) setDraft({ start: assignment.start_date || '', due: assignment.due_date || '' }) }, [open, assignment.start_date, assignment.due_date])
  const backwards = Boolean(draft.start && draft.due && draft.due < draft.start)
  const save = async () => {
    setSaving(true)
    try { if (await onSave({ start_date: draft.start || null, due_date: draft.due || null })) setOpen(false) } finally { setSaving(false) }
  }
  const input = 'mt-1.5 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm'
  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>Edit dates</DialogTitle>
        <DialogDescription>{label}. Learners’ stage and step dates move with these, except ones changed for one learner.</DialogDescription>
      </DialogHeader>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-semibold">Starts<input type="date" value={draft.start} onChange={(event) => setDraft({ ...draft, start: event.target.value })} className={input} /></label>
        <label className="text-sm font-semibold">Ends<input type="date" value={draft.due} onChange={(event) => setDraft({ ...draft, due: event.target.value })} className={input} /></label>
      </div>
      {backwards ? <p className="text-sm text-red-700">It can’t end before it starts.</p> : null}
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
        <Button type="button" disabled={saving || backwards} onClick={() => void save()}>{saving ? <Loader2 size={14} className="animate-spin" /> : null}Save dates</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
}
