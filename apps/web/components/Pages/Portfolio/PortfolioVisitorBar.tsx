'use client'

import React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import toast from 'react-hot-toast'
import { Loader2, Lock, MessageCircle, Send, Target, Trash2 } from 'lucide-react'
import { useOrg } from '@components/Contexts/OrgContext'
import { Button } from '@components/ui/button'
import EditSheet from '@components/Goals/edit/EditSheet'
import { PersonAvatar } from '@components/Goals/share/PersonAvatar'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { connectApi } from '@services/connect/connect'
import { portfolioCommentsKey, portfolioPeopleApi, profileKey, type PortfolioAccess, type PortfolioComments, type PortfolioThread, type Profile } from '@services/portfolio/people'
import type { Shell } from './portfolioTypes'

const SHEET_COLOR = '#7cc4ff'

/**
 * A signed-in visitor's view of someone's portfolio, which is their profile: message them,
 * see the goals they share with you, and comment if they made you a Commenter.
 */
export function PortfolioVisitorBar({ orgslug, username, token, shell }: { orgslug: string; username: string; token?: string; shell: Shell }) {
  const router = useRouter()
  const { data: profile } = useSWR<Profile>(token ? profileKey(username) : null, () => portfolioPeopleApi.profile(username, token))
  const [sheet, setSheet] = React.useState<'goals' | 'comments' | null>(null)
  const [opening, setOpening] = React.useState(false)
  const access: PortfolioAccess | undefined = shell.access
  const onPortfolio = access && access.role !== 'public' && access.role !== 'owner'
  if (!token || !profile || access?.role === 'owner') return null

  const message = async () => {
    if (profile.chat_uuid) return router.push(getUriWithOrg(orgslug, routePaths.org.chat(profile.chat_uuid)))
    setOpening(true)
    try {
      const chat = await connectApi.openDirect({ handle: username }, token)
      router.push(getUriWithOrg(orgslug, routePaths.org.chat(chat.conversation_uuid)))
    } catch (error: any) {
      toast.error(error?.message || 'That chat couldn’t open')
    } finally {
      setOpening(false)
    }
  }

  return <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
    {access?.shared_privately ? <span className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-raised px-3 text-xs font-bold text-muted-foreground"><Lock className="h-3.5 w-3.5" />Shared with you</span> : null}
    {profile.can_message ? <Button variant="brand" size="sm" onClick={message} disabled={opening}>{opening ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Message</Button> : null}
    {profile.goals.length ? <Button variant="surface" size="sm" onClick={() => setSheet('goals')}><Target className="h-4 w-4" />Goals · {profile.goals.length}</Button> : null}
    {onPortfolio ? <Button variant="surface" size="sm" onClick={() => setSheet('comments')}><MessageCircle className="h-4 w-4" />Comments</Button> : null}
    <EditSheet open={sheet === 'goals'} onOpenChange={(open) => setSheet(open ? 'goals' : null)} color={SHEET_COLOR} title={`Goals ${profile.person.name} shares with you`}>
      <ul className="flex flex-col gap-2">{profile.goals.map((goal) => <li key={goal.goal_uuid}>
        <Link href={getUriWithOrg(orgslug, routePaths.org.plan(goal.goal_uuid))} className="flex items-center gap-3 rounded-2xl border border-border p-3 hover:bg-raised">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-raised text-lg" aria-hidden="true">{goal.icon || '🎯'}</span>
          <span className="min-w-0 flex-1"><span className="block truncate font-bold">{goal.title}</span><span className="block text-xs capitalize text-muted-foreground">{goal.status}{goal.can_comment ? ' · You can comment' : ''}</span></span>
        </Link>
      </li>)}</ul>
    </EditSheet>
    {onPortfolio ? <CommentsSheet open={sheet === 'comments'} onOpenChange={(open) => setSheet(open ? 'comments' : null)} username={username} token={token} shell={shell} name={profile.person.name} /> : null}
  </div>
}

function CommentsSheet({ open, onOpenChange, username, token, shell, name }: { open: boolean; onOpenChange: (open: boolean) => void; username: string; token?: string; shell: Shell; name: string }) { // eslint-disable-line no-unused-vars
  const org = useOrg() as any
  const orgId: number | undefined = org?.id
  const { data, mutate } = useSWR<PortfolioComments>(open && token && orgId ? portfolioCommentsKey(orgId, username) : null, () => portfolioPeopleApi.comments(orgId!, username, token))
  const [about, setAbout] = React.useState('portfolio:')
  const [draft, setDraft] = React.useState('')
  const [replyTo, setReplyTo] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const items = React.useMemo(() => [
    ...shell.projects.map((project) => ({ key: `project:${project.project_uuid}`, label: project.title })),
    ...shell.timeline.map((entry) => ({ key: `timeline:${entry.timeline_uuid}`, label: entry.title })),
  ], [shell])
  const label = (thread: PortfolioThread) => thread.item_kind === 'portfolio' ? 'Portfolio' : items.find((item) => item.key === `${thread.item_kind}:${thread.item_uuid}`)?.label || 'An item'

  const post = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!draft.trim() || !orgId) return
    const [kind, uuid] = about.split(':')
    setBusy(true)
    try {
      await portfolioPeopleApi.addComment(orgId, username, replyTo ? { body: draft.trim(), parent_uuid: replyTo } : { body: draft.trim(), item_kind: kind, item_uuid: uuid || null }, token)
      setDraft('')
      setReplyTo(null)
      await mutate()
    } catch (error: any) {
      toast.error(error?.message || 'That comment didn’t post')
    } finally {
      setBusy(false)
    }
  }
  const remove = async (commentUuid: string) => {
    if (!orgId) return
    await portfolioPeopleApi.deleteComment(orgId, username, commentUuid, token)
    await mutate()
  }

  return <EditSheet open={open} onOpenChange={onOpenChange} color={SHEET_COLOR} title={`Comments on ${name}’s portfolio`}>
    {data?.threads.length ? <ul className="flex flex-col gap-3">{data.threads.map((thread) => <li key={thread.comment_uuid} className="rounded-2xl border border-border p-3">
      <p className="mb-2 text-[11px] font-black uppercase tracking-wide text-muted-foreground">{label(thread)}</p>
      {[thread, ...thread.replies].map((comment) => <div key={comment.comment_uuid} className="flex gap-2 py-1">
        <PersonAvatar user={comment.author as any} />
        <div className="min-w-0 flex-1"><p className="text-xs font-bold">{comment.author?.name || 'Someone'}</p><p className="whitespace-pre-wrap text-sm">{comment.body}</p></div>
        {comment.can_delete ? <button type="button" onClick={() => remove(comment.comment_uuid)} aria-label="Delete comment" className="self-start text-muted-foreground hover:text-foreground"><Trash2 className="h-3.5 w-3.5" /></button> : null}
      </div>)}
      {data.can_comment ? <button type="button" onClick={() => setReplyTo(thread.comment_uuid)} className="mt-1 text-xs font-bold text-muted-foreground hover:text-foreground">Reply</button> : null}
    </li>)}</ul> : <p className="text-sm text-muted-foreground">No comments yet.</p>}
    {data?.can_comment ? <form onSubmit={post} className="flex flex-col gap-2">
      {replyTo ? <p className="text-xs text-muted-foreground">Replying in a thread. <button type="button" className="font-bold underline" onClick={() => setReplyTo(null)}>Cancel</button></p>
        : <select value={about} onChange={(event) => setAbout(event.target.value)} aria-label="What the comment is about" className="h-9 rounded-xl border border-border bg-background px-2 text-sm">
          <option value="portfolio:">The whole portfolio</option>
          {items.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
        </select>}
      <div className="flex gap-2">
        <textarea value={draft} onChange={(event) => setDraft(event.target.value)} rows={2} maxLength={5000} placeholder="Add a comment" aria-label="Comment"
          className="min-w-0 flex-1 rounded-xl border border-border bg-background p-2.5 text-sm outline-none focus:ring-2 focus:ring-[var(--org-primary-color)]" />
        <Button type="submit" disabled={busy || !draft.trim()}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Post'}</Button>
      </div>
    </form> : data ? <p className="text-xs text-muted-foreground">You can read comments here. {name} can make you a Commenter if you’d like to add your own.</p> : null}
  </EditSheet>
}
