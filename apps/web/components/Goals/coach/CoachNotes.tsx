'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import useSWR, { mutate } from 'swr'
import toast from 'react-hot-toast'
import { ArrowRight, Sparkles } from 'lucide-react'
import { Button } from '@components/ui/button'
import { useHub } from '@components/Hub/HubContext'
import useGoalCoachSession from '@components/Goals/edit/useGoalCoachSession'
import { getUriWithOrg } from '@services/config/config'
import { actOnCoachNote, checkInLine, coachNotesUrl, type CoachNote, type CoachNoteAction, type GoalCoachNotes } from '@services/goals/coachNotes'
import { isGoalsKey } from '@services/goals/goals'
import { swrFetcher } from '@services/utils/ts/requests'

/** Coach's open notes on one goal and its check-in schedule; only the goal's owner has any. */
export function useGoalCoachNotes(goalUuid?: string, token?: string) {
  return useSWR<GoalCoachNotes>(goalUuid && token ? coachNotesUrl(goalUuid) : null, (url: string) => swrFetcher(url, token), { revalidateOnFocus: true, shouldRetryOnError: false })
}

/**
 * One line under a goal's header: what Coach noticed, or when it checks in next.
 * Opening it shows the notes as cards in the Coach chat, where their actions run.
 */
export function GoalCoachBar({ goalUuid, token }: { goalUuid: string; token?: string }) {
  const hub = useHub()
  const { data } = useGoalCoachNotes(goalUuid, token)
  if (!data) return null
  const notes = data.notes || []
  const line = notes.length ? notes[0].title : checkInLine(data)
  return <button type="button" onClick={() => hub?.open()} disabled={!hub} aria-label={notes.length ? `Coach has ${notes.length === 1 ? 'a note' : `${notes.length} notes`}: ${line}` : line}
    className="mt-3 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs text-muted-foreground transition hover:bg-muted/60 hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring">
    <Sparkles size={14} aria-hidden="true" className={notes.length ? 'text-foreground' : undefined} />
    <span className={notes.length ? 'min-w-0 flex-1 truncate font-semibold text-foreground' : 'min-w-0 flex-1 truncate'}>{line}</span>
    {notes.length ? <span className="flex shrink-0 items-center gap-1 font-semibold">{notes.length === 1 ? '1 note' : `${notes.length} notes`}<ArrowRight size={13} aria-hidden="true" /></span> : null}
  </button>
}

function NoteCard({ note, busy, onAct }: { note: CoachNote; busy: boolean; onAct: (action: CoachNoteAction) => void }) { // eslint-disable-line no-unused-vars
  const [main, ...rest] = note.actions
  return <article aria-label={`Coach’s note: ${note.title}`} className="space-y-2 rounded-2xl border border-border/70 bg-card/40 px-4 py-3">
    <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"><Sparkles size={12} aria-hidden="true" />{note.goal_title}</p>
    <h3 className="text-sm font-semibold">{note.title}</h3>
    {note.body ? <p className="text-sm text-muted-foreground">{note.body}</p> : null}
    <div className="flex flex-wrap gap-2 pt-1">
      {main ? <Button type="button" size="sm" className="h-8 text-xs" disabled={busy} onClick={() => onAct(main)}>{main.label}</Button> : null}
      {rest.map((action) => <Button key={action.id} type="button" size="sm" variant="ghost" className="h-8 text-xs" disabled={busy} onClick={() => onAct(action)}>{action.label}</Button>)}
    </div>
  </article>
}

/**
 * Coach's notes on the goal in view, as cards in the chat. Each action runs in place:
 * ask sends its prompt here, session starts Coach's session on the goal, step opens it.
 */
export function CoachNoteCards({ goalUuid, orgslug, token, disabled = false, onAsk }: {
  goalUuid: string; orgslug: string; token?: string; disabled?: boolean
  onAsk: (prompt: string) => void // eslint-disable-line no-unused-vars
}) {
  const router = useRouter()
  const hub = useHub()
  const { data, mutate: refresh } = useGoalCoachNotes(goalUuid, token)
  const notes = data?.notes || []
  const coach = useGoalCoachSession({ goal_uuid: goalUuid, title: notes[0]?.goal_title || '' }, token)
  const [busy, setBusy] = React.useState(false)
  if (!notes.length) return null

  const run = async (note: CoachNote, action: CoachNoteAction) => {
    setBusy(true)
    try {
      await actOnCoachNote(note.goal_uuid, note.note_uuid, action.id, token)
      await refresh()
      void mutate((key: unknown) => isGoalsKey(key))
      if (action.kind === 'ask' && action.prompt) onAsk(action.prompt)
      else if (action.kind === 'session') await coach.start(action.prompt)
      else if (action.kind === 'step' && action.step_uuid) {
        router.push(getUriWithOrg(orgslug, `/plans/${encodeURIComponent(note.goal_uuid)}?step=${encodeURIComponent(action.step_uuid)}`))
        if (window.matchMedia('(max-width: 767px)').matches) hub?.tuck()
      }
    } catch (error: any) {
      toast.error(error?.message || 'That note couldn’t be updated.')
    } finally {
      setBusy(false)
    }
  }

  return <section aria-label="Coach’s notes" className="space-y-3">
    {notes.map((note) => <NoteCard key={note.note_uuid} note={note} busy={busy || disabled} onAct={(action) => void run(note, action)} />)}
  </section>
}
