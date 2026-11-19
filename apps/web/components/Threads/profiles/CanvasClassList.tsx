'use client'

import React from 'react'
import toast from 'react-hot-toast'
import { Loader2, RefreshCw } from 'lucide-react'
import { usePeopleContext } from '@components/Admin/People/usePeople'
import { pullCanvasClassList, type CanvasClassList as ClassList } from '@services/canvas/canvas'
import { Card } from './ProfileFrame'

const SHOWN = 8

function when(iso: string | null): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`
}

/**
 * A Canvas course group's class list (DEV-193): students Canvas lists who haven't joined yet are invited, and
 * join this group when they open Life2Launch from Canvas or accept. Staff who manage learners can pull it now.
 */
export function CanvasClassList({ groupId, canvas, onChanged }: { groupId: number; canvas: ClassList; onChanged: () => Promise<unknown> }) {
  const { orgId, token } = usePeopleContext()
  const [busy, setBusy] = React.useState(false)
  const [more, setMore] = React.useState(false)
  const invited = canvas.invited
  const shown = more ? invited : invited.slice(0, SHOWN)

  const pull = async () => {
    if (!token || busy) return
    setBusy(true)
    try {
      const result = await pullCanvasClassList(orgId, groupId, token)
      const changes = [
        result.invited ? `${plural(result.invited, 'student', 'students')} invited` : '',
        result.joined ? `${result.joined} joined the group` : '',
        result.withdrawn ? `${plural(result.withdrawn, 'invitation', 'invitations')} withdrawn` : '',
      ].filter(Boolean)
      toast.success(changes.length ? `Updated from Canvas: ${changes.join(', ')}` : 'Up to date with Canvas')
      await onChanged()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Canvas didn’t answer. Try again in a moment.')
      await onChanged()
    } finally {
      setBusy(false)
    }
  }

  const lede = !canvas.offered
    ? 'The class list comes in the next time a teacher opens Life2Launch from this course in Canvas.'
    : invited.length
      ? `${plural(invited.length, 'student', 'students')} on the class list ${invited.length === 1 ? 'hasn’t' : 'haven’t'} joined yet. They join this group when they open Life2Launch from Canvas or accept their invitation.`
      : canvas.pulled_at
        ? 'Everyone on the Canvas class list is in this group.'
        : 'The class list comes in shortly after a teacher opens Life2Launch from this course.'

  return <Card title="Canvas class list" aside={canvas.can_pull && canvas.offered
    ? <button type="button" onClick={() => void pull()} disabled={busy}
      className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-border px-3.5 text-sm font-semibold hover:bg-muted disabled:opacity-50">
      {busy ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <RefreshCw size={14} aria-hidden="true" />}Update from Canvas
    </button> : null}>
    <p className="-mt-1 text-sm text-muted-foreground">{lede}</p>
    {canvas.pulled_at ? <p className="mt-1 text-xs text-muted-foreground">Last updated from Canvas {when(canvas.pulled_at)}</p> : null}
    {canvas.error ? <p role="status" className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">{canvas.error}</p> : null}
    {shown.length ? <ul aria-label="Invited from Canvas" className="mt-3 divide-y divide-border">
      {shown.map((item) => <li key={item.invitation_uuid} className="flex items-center gap-3 py-2.5">
        <span aria-hidden="true" className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-dashed border-border text-xs font-bold uppercase text-muted-foreground">
          {(item.name || item.email).trim().charAt(0)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{item.name || item.email}</span>
          {item.name ? <span className="block truncate text-xs text-muted-foreground">{item.email}</span> : null}
        </span>
        <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-muted-foreground">Invited</span>
      </li>)}
      {invited.length > shown.length ? <li><button type="button" onClick={() => setMore(true)} className="w-full py-2 text-left text-xs font-semibold text-muted-foreground hover:text-foreground">Show {invited.length - shown.length} more</button></li> : null}
    </ul> : null}
  </Card>
}
