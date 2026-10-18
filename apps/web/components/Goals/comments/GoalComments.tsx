'use client'

import React from 'react'
import useSWR from 'swr'
import toast from 'react-hot-toast'
import { Check, Loader2, MessageCircle, RotateCcw, Send, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@components/ui/button'
import EditSheet from '@components/Goals/edit/EditSheet'
import { PersonAvatar } from '@components/Goals/share/PersonAvatar'
import { goalCommentsApi, goalCommentsKey, type GoalComment, type GoalComments as GoalCommentsData, type GoalCommentThread, type MentionCandidate, type MentionOutcome } from '@services/goals/comments'
import { can, goalSteps, type Goal, type Step } from '@services/goals/types'
import { swrFetcher } from '@services/utils/ts/requests'

type Comments = {
  goal: Goal
  threads: GoalCommentThread[]
  /** Open the comments, on one step or (null) the whole goal. */
  // eslint-disable-next-line no-unused-vars
  open: (stepUuid: string | null) => void
}

const CommentsContext = React.createContext<Comments | null>(null)

/** The open goal's comments, and the sheet they're read and written in. */
export function GoalCommentsProvider({ goal, token, color, children }: { goal: Goal | null; token?: string; color: string; children: React.ReactNode }) {
  const canView = Boolean(goal && can(goal, 'view_plan'))
  const { data, mutate } = useSWR<GoalCommentsData>(goal && token && canView ? goalCommentsKey(goal.goal_uuid) : null, (url: string) => swrFetcher(url, token))
  const [target, setTarget] = React.useState<{ step: string | null; focus?: string } | null>(null)
  const goalUuid = goal?.goal_uuid
  React.useEffect(() => setTarget(null), [goalUuid])
  // A link to one comment (from a mention or reply message) opens it: /plans/{goal}?comment={comment}.
  React.useEffect(() => {
    if (!goalUuid || !data || data.goal_uuid !== goalUuid) return
    const params = new URLSearchParams(window.location.search)
    const wanted = params.get('comment')
    if (!wanted) return
    const thread = data.threads.find((item) => item.comment_uuid === wanted || item.replies.some((reply) => reply.comment_uuid === wanted))
    if (thread) setTarget({ step: thread.step_uuid, focus: thread.comment_uuid })
    params.delete('comment')
    window.history.replaceState({}, '', `${window.location.pathname}${params.size ? `?${params.toString()}` : ''}`)
  }, [goalUuid, data])

  const value = React.useMemo<Comments | null>(() => goal && data && data.goal_uuid === goal.goal_uuid
    ? { goal, threads: data.threads, open: (step) => setTarget({ step }) }
    : null, [goal, data])
  return <CommentsContext.Provider value={value}>
    {children}
    {goal && data && target ? <CommentsSheet goal={goal} data={data} token={token} color={color} stepUuid={target.step} focus={target.focus}
      onStep={(step) => setTarget({ step })} onClose={() => setTarget(null)} refresh={() => mutate()} /> : null}
  </CommentsContext.Provider>
}

export const useGoalComments = () => React.useContext(CommentsContext)

const openCount = (threads: GoalCommentThread[]) => threads.filter((thread) => !thread.resolved).length

/** The goal's comments on its header card: the count of open threads, opening all of them. */
export function GoalCommentsChip({ className }: { className: string }) {
  const comments = useGoalComments()
  if (!comments) return null
  const count = openCount(comments.threads)
  return <button type="button" onClick={() => comments.open(null)} className={className} aria-label={count ? `${count} open comment${count === 1 ? '' : 's'}` : 'Comments'}>
    <MessageCircle size={15} aria-hidden="true" />{count ? <span>{count}</span> : null}
  </button>
}

/** A step's comments: its count of open threads, or a quiet button to start one. */
export function StepCommentsButton({ step, quiet = false }: { step: Step; quiet?: boolean }) {
  const comments = useGoalComments()
  if (!comments) return null
  const count = openCount(comments.threads.filter((thread) => thread.step_uuid === step.step_uuid))
  if (!count && (quiet || !can(comments.goal, 'comment'))) return null
  return <button type="button" onClick={() => comments.open(step.step_uuid)} aria-label={count ? `${count} comment${count === 1 ? '' : 's'} on ${step.title}` : `Comment on ${step.title}`}
    className={cn('flex h-8 shrink-0 items-center gap-1 rounded-lg px-2 text-xs font-bold transition hover:bg-muted', count ? 'text-[var(--plan-accent)]' : 'text-muted-foreground')}>
    <MessageCircle size={14} aria-hidden="true" />{count ? <span>{count}</span> : null}
  </button>
}

function when(value: string) {
  const date = new Date(value)
  const minutes = Math.round((Date.now() - date.getTime()) / 60000)
  if (minutes < 1) return 'now'
  if (minutes < 60) return `${minutes}m`
  if (minutes < 60 * 24) return `${Math.round(minutes / 60)}h`
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

/** A comment's text, with its @mentions picked out. */
function Body({ comment }: { comment: GoalComment }) {
  const handles = new Set(comment.mentions.map((person) => person.username.toLowerCase()))
  const parts = comment.body.split(/(@[A-Za-z0-9_][A-Za-z0-9_.-]*)/g)
  return <p className="whitespace-pre-wrap break-words text-sm leading-6">{parts.map((part, index) => part.startsWith('@') && handles.has(part.slice(1).replace(/[.-]+$/, '').toLowerCase())
    ? <span key={index} className="font-bold text-[var(--plan-accent)]">{part}</span>
    : <React.Fragment key={index}>{part}</React.Fragment>)}</p>
}

function mentionNote(outcomes: MentionOutcome[]) {
  for (const outcome of outcomes) {
    const name = outcome.user?.name || 'They'
    if (outcome.status === 'invited') toast.success(`${name} was invited to comment on this goal.`)
    else if (outcome.status === 'requested') toast.success(`Asked to add ${name}. They’ll see it once it’s approved.`)
    else if (outcome.status === 'no_access') toast(`${name} can’t see this goal, so they weren’t told.`)
  }
}

function CommentsSheet({ goal, data, token, color, stepUuid, focus, onStep, onClose, refresh }: {
  goal: Goal; data: GoalCommentsData; token?: string; color: string; stepUuid: string | null; focus?: string
  // eslint-disable-next-line no-unused-vars
  onStep: (stepUuid: string | null) => void
  onClose: () => void
  refresh: () => Promise<unknown>
}) {
  const steps = goalSteps(goal)
  const step = stepUuid ? steps.find((item) => item.step_uuid === stepUuid) : null
  const threads = stepUuid ? data.threads.filter((thread) => thread.step_uuid === stepUuid) : data.threads
  const [showResolved, setShowResolved] = React.useState(false)
  const open = threads.filter((thread) => !thread.resolved)
  const resolved = threads.filter((thread) => thread.resolved)
  const focused = React.useRef<HTMLDivElement | null>(null)
  React.useEffect(() => { focused.current?.scrollIntoView({ block: 'center' }) }, [focus])
  const stepTitle = (uuid: string | null) => uuid ? steps.find((item) => item.step_uuid === uuid)?.title : null

  return <EditSheet open onOpenChange={(next) => { if (!next) onClose() }} color={color} title={step ? `Comments on ${step.title}` : 'Comments'}
    description={data.can_comment ? 'Type @ to bring someone in. If they can’t see this goal yet, they’re invited to comment.' : 'You can read comments on this goal.'}>
    {step ? <button type="button" onClick={() => onStep(null)} className="-mt-2 self-start text-xs font-bold text-muted-foreground hover:text-foreground">See all comments on the goal</button> : null}
    {data.can_comment ? <Composer goal={goal} token={token} placeholder={step ? `Comment on ${step.title}…` : 'Comment on this goal…'} onPosted={refresh} stepUuid={stepUuid} /> : null}
    <div className="flex flex-col gap-3">
      {open.map((thread) => <div key={thread.comment_uuid} ref={thread.comment_uuid === focus ? focused : undefined}>
        <Thread goal={goal} thread={thread} token={token} canComment={data.can_comment} stepTitle={stepUuid ? null : stepTitle(thread.step_uuid)} onChanged={refresh} highlighted={thread.comment_uuid === focus} />
      </div>)}
      {!open.length ? <p className="rounded-2xl border-2 border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">{resolved.length ? 'Everything here is resolved.' : 'No comments yet.'}</p> : null}
      {resolved.length ? <button type="button" onClick={() => setShowResolved(!showResolved)} className="self-start text-xs font-bold text-muted-foreground hover:text-foreground">{showResolved ? 'Hide' : 'Show'} {resolved.length} resolved</button> : null}
      {showResolved ? resolved.map((thread) => <Thread key={thread.comment_uuid} goal={goal} thread={thread} token={token} canComment={data.can_comment} stepTitle={stepUuid ? null : stepTitle(thread.step_uuid)} onChanged={refresh} />) : null}
    </div>
  </EditSheet>
}

function Thread({ goal, thread, token, canComment, stepTitle, onChanged, highlighted = false }: {
  goal: Goal; thread: GoalCommentThread; token?: string; canComment: boolean; stepTitle?: string | null; onChanged: () => Promise<unknown>; highlighted?: boolean
}) {
  const [replying, setReplying] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const act = async (action: () => Promise<unknown>) => {
    setBusy(true)
    try { await action(); await onChanged() } catch (error: any) { toast.error(error?.message || 'That didn’t work. Try again.') } finally { setBusy(false) }
  }
  const remove = (comment: GoalComment) => {
    if (!window.confirm(comment.comment_uuid === thread.comment_uuid && thread.replies.length ? 'Delete this comment and its replies?' : 'Delete this comment?')) return
    void act(() => goalCommentsApi.remove(goal.goal_uuid, comment.comment_uuid, token))
  }
  const line = (comment: GoalComment, first: boolean) => <div key={comment.comment_uuid} className="flex gap-2.5">
    <PersonAvatar user={comment.author} />
    <div className="min-w-0 flex-1">
      <div className="flex items-baseline gap-2">
        <span className="truncate text-sm font-extrabold">{comment.author?.name || 'Someone'}</span>
        <span className="shrink-0 text-xs text-muted-foreground">{when(comment.creation_date)}</span>
        <span className="flex-1" />
        {first && canComment ? <button type="button" disabled={busy} onClick={() => void act(() => goalCommentsApi.resolve(goal.goal_uuid, thread.comment_uuid, !thread.resolved, token))}
          aria-label={thread.resolved ? 'Reopen this thread' : 'Resolve this thread'} title={thread.resolved ? 'Reopen' : 'Resolve'}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground">{thread.resolved ? <RotateCcw size={14} /> : <Check size={15} />}</button> : null}
        {comment.can_delete ? <button type="button" disabled={busy} onClick={() => remove(comment)} aria-label="Delete comment"
          className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-red-50 hover:text-red-700"><Trash2 size={13} /></button> : null}
      </div>
      <Body comment={comment} />
    </div>
  </div>
  return <article className={cn('flex flex-col gap-3 rounded-2xl border-2 bg-card p-3.5', highlighted ? 'border-[var(--plan-face)]' : 'border-border', thread.resolved && 'opacity-70')}>
    {stepTitle ? <span className="text-xs font-bold text-muted-foreground">On {stepTitle}</span> : null}
    {thread.resolved ? <span className="text-xs font-bold text-muted-foreground">Resolved{thread.resolved_by ? ` by ${thread.resolved_by.name}` : ''}</span> : null}
    {line(thread, true)}
    {thread.replies.length ? <div className="ml-4 flex flex-col gap-3 border-l-2 border-border pl-3">{thread.replies.map((reply) => line(reply, false))}</div> : null}
    {canComment ? replying
      ? <Composer goal={goal} token={token} parentUuid={thread.comment_uuid} placeholder="Reply…" autoFocus onPosted={async () => { setReplying(false); await onChanged() }} />
      : <button type="button" onClick={() => setReplying(true)} className="self-start text-xs font-bold text-muted-foreground hover:text-foreground">Reply</button> : null}
  </article>
}

/** Where a comment is written: @ suggests the goal's people, or whoever has exactly that handle. */
function Composer({ goal, token, stepUuid = null, parentUuid = null, placeholder, autoFocus = false, onPosted }: {
  goal: Goal; token?: string; stepUuid?: string | null; parentUuid?: string | null; placeholder: string; autoFocus?: boolean; onPosted: () => Promise<unknown>
}) {
  const [body, setBody] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [query, setQuery] = React.useState<string | null>(null)
  const [candidates, setCandidates] = React.useState<MentionCandidate[]>([])
  const field = React.useRef<HTMLTextAreaElement | null>(null)

  React.useEffect(() => {
    if (query === null) { setCandidates([]); return }
    let live = true
    const timer = window.setTimeout(() => {
      goalCommentsApi.mentionCandidates(goal.goal_uuid, query, token).then((rows) => { if (live) setCandidates(rows) }).catch(() => { if (live) setCandidates([]) })
    }, 150)
    return () => { live = false; window.clearTimeout(timer) }
  }, [query, goal.goal_uuid, token])

  const track = (value: string, caret: number) => {
    const match = /(?:^|\s)@([A-Za-z0-9_.-]*)$/.exec(value.slice(0, caret))
    setQuery(match ? match[1] : null)
  }
  const pick = (person: MentionCandidate) => {
    const node = field.current
    const caret = node?.selectionStart ?? body.length
    const before = body.slice(0, caret).replace(/@([A-Za-z0-9_.-]*)$/, `@${person.username} `)
    const next = before + body.slice(caret)
    setBody(next)
    setQuery(null)
    window.requestAnimationFrame(() => { node?.focus(); node?.setSelectionRange(before.length, before.length) })
  }
  const post = async () => {
    const text = body.trim()
    if (!text || busy) return
    setBusy(true)
    try {
      const result = await goalCommentsApi.add(goal.goal_uuid, { body: text, step_uuid: parentUuid ? null : stepUuid, parent_uuid: parentUuid }, token)
      setBody('')
      setQuery(null)
      mentionNote(result.mentions)
      await onPosted()
    } catch (error: any) { toast.error(error?.message || 'Your comment didn’t post. Try again.') } finally { setBusy(false) }
  }

  return <div className="relative">
    {query !== null && candidates.length ? <ul role="listbox" aria-label="People to mention" className="absolute bottom-full left-0 right-0 z-10 mb-1 overflow-hidden rounded-xl border-2 border-border bg-popover shadow-lg">
      {candidates.map((person) => <li key={person.id}>
        <button type="button" role="option" aria-selected="false" onMouseDown={(event) => { event.preventDefault(); pick(person) }}
          className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-muted">
          <PersonAvatar user={person} size="xs" />
          <span className="min-w-0 flex-1 truncate text-sm font-bold">{person.name} <span className="font-normal text-muted-foreground">@{person.username}</span></span>
          {!person.has_access ? <span className="shrink-0 text-[11px] font-bold text-muted-foreground">Will be invited</span> : null}
        </button>
      </li>)}
    </ul> : null}
    <div className="flex items-end gap-2 rounded-2xl border-2 border-border bg-background p-1.5 focus-within:border-[var(--plan-face)]">
      <label className="min-w-0 flex-1"><span className="sr-only">{placeholder}</span>
        <textarea ref={field} value={body} autoFocus={autoFocus} rows={1} placeholder={placeholder} maxLength={5000}
          onChange={(event) => { setBody(event.target.value); track(event.target.value, event.target.selectionStart) }}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && query !== null) { event.preventDefault(); event.stopPropagation(); setQuery(null) }
            if (event.key === 'Enter' && !event.shiftKey && query === null) { event.preventDefault(); void post() }
          }}
          className="max-h-40 min-h-9 w-full resize-none bg-transparent px-2 py-1.5 text-sm outline-none [field-sizing:content]" />
      </label>
      <Button type="button" size="sm" variant="brand" disabled={busy || !body.trim()} onClick={() => void post()} aria-label="Post comment">
        {busy ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
      </Button>
    </div>
  </div>
}
