'use client'

import React from 'react'
import Link from 'next/link'
import useSWR, { mutate } from 'swr'
import toast from 'react-hot-toast'
import { Check, CheckCircle2, EyeOff, Flag, Link2, Lock, Star, Trash2 } from 'lucide-react'
import { Switch } from '@components/ui/switch'
import { timeAgo } from '@components/Goals/admin/live/ui'
import { plural } from '@components/Plans/plan/planVersions'
import { getUserAvatarMediaDirectory } from '@services/media/media'
import { COMMENT_RULE_LABELS, commentKeys, commentsApi, hasLink, needsLook, type CommentRule, type ModerationAction, type ResourceCommentItem } from '@services/resources/comments'
import { isResourcesKey, type ChannelDetail, type ResourceDetail } from '@services/resources/workspace'
import { cn } from '@/lib/utils'
import { Loading } from './listing'
import { TypeTile, resourceHref, useResourcesContext } from './pieces'

const xsButton = 'inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-[12.5px] font-semibold [&_svg]:size-3.5'
const tagClass = 'rounded-full px-2 py-px text-[11.5px] font-bold'
const authorName = (author: ResourceCommentItem['author']) => author ? [author.first_name, author.last_name].filter(Boolean).join(' ') || author.username : 'Someone'

function Stars({ value, className }: { value: number; className?: string }) {
  return <span className={cn('inline-flex gap-px', className)} aria-label={`${value} out of 5`}>
    {[1, 2, 3, 4, 5].map((n) => <Star key={n} size={14} aria-hidden="true" className={n <= Math.round(value) ? 'fill-amber-400 text-amber-400' : 'text-border'} />)}
  </span>
}

function Avatar({ author }: { author: ResourceCommentItem['author'] }) {
  const name = authorName(author)
  if (author?.avatar_image) return <img src={getUserAvatarMediaDirectory(author.user_uuid, author.avatar_image)} alt="" className="h-9 w-9 rounded-full object-cover" />
  return <span aria-hidden="true" className="grid h-9 w-9 place-items-center rounded-full bg-muted text-[13px] font-bold">{name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()}</span>
}

/** One comment: who wrote it and where they're from, its words, and what this viewer can do with it. */
function CommentItem({ comment, moderator, showResource }: { comment: ResourceCommentItem; moderator: boolean; showResource?: boolean }) {
  const { orgslug, token, userId } = useResourcesContext()
  const [busy, setBusy] = React.useState(false)
  const mine = comment.author_id === userId
  const run = async (work: () => Promise<unknown>, done?: string) => {
    setBusy(true)
    try {
      await work()
      await mutate(isResourcesKey)
      if (done) toast.success(done)
    } catch (failure: any) { toast.error(failure?.message || 'Could not change the comment.') } finally { setBusy(false) }
  }
  const moderate = (action: ModerationAction, done?: string) => run(() => commentsApi.moderate(comment.comment_uuid, action, token), done)
  const remove = () => { if (window.confirm('Delete this comment? This can’t be undone.')) void run(() => commentsApi.remove(comment.comment_uuid, token), 'Comment deleted') }
  const deleteButton = <button type="button" disabled={busy} onClick={remove} aria-label="Delete comment" className={cn(xsButton, 'px-2 text-muted-foreground hover:bg-muted')}><Trash2 /></button>
  const ops = moderator
    ? comment.status === 'held' ? <>
      <button type="button" disabled={busy} onClick={() => void moderate('approve', 'Approved. Everyone can see it now.')} className={cn(xsButton, 'bg-foreground text-background hover:bg-foreground/90')}><Check />Approve</button>{deleteButton}
    </> : comment.status === 'hidden' ? <>
      <button type="button" disabled={busy} onClick={() => void moderate('show')} className={cn(xsButton, 'border border-border hover:bg-muted')}>Show</button>{deleteButton}
    </> : <>
      {comment.report_count ? <button type="button" disabled={busy} onClick={() => void moderate('keep', 'Kept, and the reports were cleared.')} className={cn(xsButton, 'border border-border hover:bg-muted')}>Keep</button> : null}
      <button type="button" disabled={busy} onClick={() => void moderate('hide', 'Hidden. Only your staff see it now.')} className={cn(xsButton, 'border border-border hover:bg-muted')}><EyeOff />Hide</button>{deleteButton}
    </>
    : mine ? deleteButton
      : comment.status === 'live' ? <button type="button" disabled={busy} aria-label="Report comment" title="Report"
        onClick={() => void run(() => commentsApi.report(comment.comment_uuid, token), 'Reported. Their staff will take a look.')} className={cn(xsButton, 'px-2 text-muted-foreground hover:bg-muted')}><Flag /></button> : null
  return <li className="group grid grid-cols-[36px_minmax(0,1fr)_auto] gap-3 border-b border-border py-3.5 last:border-b-0">
    <Avatar author={comment.author} />
    <div className="min-w-0">
      {showResource && comment.resource ? <Link href={resourceHref(orgslug, comment.resource.resource_uuid)} className="mb-1 inline-flex max-w-full items-center gap-1.5 text-[12.5px] font-semibold text-muted-foreground hover:text-foreground hover:underline">
        <TypeTile type={comment.resource.resource_type} className="h-[18px] w-[18px] rounded-[5px] [&_svg]:size-2.5" /><span className="truncate">{comment.resource.title}</span>
      </Link> : null}
      <div className="flex flex-wrap items-center gap-2 text-[13px]">
        <b className="text-sm">{authorName(comment.author)}</b>
        {comment.author_is_staff ? <span className={cn(tagClass, 'bg-[#e6f3f1] text-[#0B8077]')}>Staff</span> : null}
        {comment.author_org ? <span className={cn(tagClass, 'bg-muted text-muted-foreground')}>{comment.author_org.name}</span> : null}
        {comment.status === 'held' ? <span className={cn(tagClass, 'bg-amber-100 text-amber-900')}>Held for review</span> : null}
        {comment.status === 'hidden' ? <span className={cn(tagClass, 'inline-flex items-center gap-1 bg-muted text-muted-foreground')}><EyeOff size={11} aria-hidden="true" />Hidden</span> : null}
        <span className="text-muted-foreground">{timeAgo(comment.creation_date)}</span>
        {comment.rating ? <Stars value={comment.rating} /> : null}
      </div>
      <p className={cn('mt-1 whitespace-pre-line text-[14.5px] leading-normal [overflow-wrap:anywhere]', comment.status !== 'live' && 'opacity-60')}>{comment.content}</p>
      {comment.status === 'held' ? <p className="mt-1.5 flex items-center gap-1.5 text-[12.5px] font-semibold text-amber-700"><Link2 size={14} aria-hidden="true" />
        {moderator ? 'Has a link, so it waits for you before anyone else sees it' : 'Has a link, so it waits for their staff before anyone else sees it'}</p> : null}
      {moderator && comment.status === 'live' && comment.report_count ? <p className="mt-1.5 flex items-center gap-1.5 text-[12.5px] font-semibold text-amber-700"><Flag size={14} aria-hidden="true" />Reported by {comment.report_count === 1 ? '1 person' : `${comment.report_count} people`}</p> : null}
    </div>
    <div className={cn('flex items-start gap-1', comment.status === 'live' && '[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-focus-within:opacity-100 [@media(hover:hover)]:group-hover:opacity-100')}>{ops}</div>
  </li>
}

/** A resource's comments: the average rating, a box to write one, and the list. */
export function ResourceComments({ resource }: { resource: ResourceDetail }) {
  const { token, ready, userId } = useResourcesContext()
  const { data: comments } = useSWR(ready ? commentKeys.resource(resource.resource_uuid) : null, () => commentsApi.list(resource.resource_uuid, token))
  const [draft, setDraft] = React.useState('')
  const [stars, setStars] = React.useState(0)
  const [posting, setPosting] = React.useState(false)
  const moderator = resource.can_edit
  const live = (comments || []).filter((comment) => comment.status === 'live')
  const rated = live.filter((comment) => comment.rating)
  const average = rated.length ? rated.reduce((sum, comment) => sum + (comment.rating || 0), 0) / rated.length : 0
  const hasRated = (comments || []).some((comment) => comment.author_id === userId && comment.rating)
  const closed = resource.comment_rule === 'off' && !moderator
  const post = async () => {
    setPosting(true)
    try {
      const created = await commentsApi.create(resource.resource_uuid, { content: draft.trim(), rating: stars || null }, token)
      setDraft('')
      setStars(0)
      await mutate(isResourcesKey)
      if (created.status === 'held') toast('It has a link, so their staff will look at it before anyone else sees it.')
    } catch (failure: any) { toast.error(failure?.message || 'Could not post your comment.') } finally { setPosting(false) }
  }
  return <section aria-labelledby="resource-comments-title" className="mt-9">
    <div className="mb-3 flex flex-wrap items-center gap-3 border-b border-border pb-2.5">
      <h2 id="resource-comments-title" className="text-[20px] font-bold tracking-tight">Comments</h2>
      {rated.length ? <span className="flex items-center gap-1.5 text-[13.5px] text-muted-foreground"><Stars value={average} />{average.toFixed(1)} from {plural(rated.length, 'rating')}</span> : null}
    </div>
    {closed ? <p className="flex items-center gap-2 rounded-2xl bg-muted/60 px-4 py-3 text-sm text-muted-foreground"><Lock size={15} aria-hidden="true" />Comments are turned off for this resource.</p>
      : <div className="rounded-2xl border-[1.5px] border-border bg-card px-3 py-2.5 focus-within:border-foreground/40">
        <textarea value={draft} onChange={(event) => setDraft(event.target.value)} aria-label="Write a comment" placeholder="Say how you use it, or what learners should know…"
          className="min-h-[46px] w-full resize-none border-0 bg-transparent text-[14.5px] leading-normal outline-none [field-sizing:content]" />
        <div className="mt-1.5 flex flex-wrap items-center gap-2.5">
          {!hasRated ? <span className="inline-flex" role="group" aria-label="Rating (optional)">{[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" aria-label={plural(n, 'star')} aria-pressed={n <= stars}
            onClick={() => setStars(n === stars ? 0 : n)} className="p-0.5"><Star size={19} aria-hidden="true" className={n <= stars ? 'fill-amber-400 text-amber-400' : 'text-border'} /></button>)}</span> : null}
          <small className="text-xs text-muted-foreground">
            {resource.in_library ? 'Public: anyone who finds this in the Library sees it' : `Seen by everyone at ${resource.owner_org_name} who can see this`}
            {!moderator && resource.hold_links && hasLink(draft) ? '. It has a link, so it waits for their staff first.' : ''}
          </small>
          <span className="flex-1" />
          <button type="button" disabled={posting || !draft.trim()} onClick={() => void post()} className="inline-flex h-8 items-center rounded-full bg-foreground px-3.5 text-[13px] font-semibold text-background hover:bg-foreground/90 disabled:opacity-40">Post</button>
        </div>
      </div>}
    {!comments ? <Loading /> : comments.length ? <ul className="mt-2">{comments.map((comment) => <CommentItem key={comment.comment_uuid} comment={comment} moderator={moderator} />)}</ul>
      : <p className="py-8 text-center text-sm text-muted-foreground">No comments yet.{closed ? '' : ' Be the first.'}</p>}
  </section>
}

/** A channel's Comments tab: who can comment, holding links, then what needs a look and what's recent. */
export function ChannelComments({ channel, onUpdate }: { channel: ChannelDetail; onUpdate: React.Dispatch<{ comment_rule?: CommentRule; hold_links?: boolean }> }) {
  const { token, ready } = useResourcesContext()
  const { data } = useSWR(ready ? commentKeys.channel(channel.channel_uuid) : null, () => commentsApi.channel(channel.channel_uuid, token))
  const look = (data?.needs_look || []).filter(needsLook)
  return <div className="space-y-6">
    <div className="rounded-[20px] border border-border bg-card px-5">
      <div className="flex flex-wrap items-center gap-3.5 border-b border-border py-3.5">
        <div className="min-w-[220px] flex-1"><b className="block text-sm">Who can comment</b>
          <span className="text-[13px] text-muted-foreground">Comments are public to everyone who can see the resource{channel.listed ? ', including other organizations, since it’s in the Library' : ''}.</span></div>
        <div className="inline-flex rounded-full bg-muted p-1" role="radiogroup" aria-label="Who can comment">
          {(Object.keys(COMMENT_RULE_LABELS) as CommentRule[]).map((rule) => <button key={rule} type="button" role="radio" aria-checked={channel.comment_rule === rule} onClick={() => onUpdate({ comment_rule: rule })}
            className={cn('h-8 rounded-full px-3 text-[13px] font-semibold', channel.comment_rule === rule ? 'bg-card shadow-sm' : 'text-muted-foreground hover:text-foreground')}>{COMMENT_RULE_LABELS[rule]}</button>)}
        </div>
      </div>
      <label className="flex flex-wrap items-center gap-3.5 py-3.5">
        <span className="min-w-[220px] flex-1"><b className="block text-sm">Hold comments with links</b>
          <span className="text-[13px] text-muted-foreground">A comment with a web link waits for you before anyone else sees it.</span></span>
        <Switch checked={channel.hold_links} onCheckedChange={(hold_links) => onUpdate({ hold_links })} aria-label="Hold comments with links" />
      </label>
    </div>
    {!data ? <Loading /> : <>
      <section aria-labelledby="needs-look-title">
        <h3 id="needs-look-title" className="mb-2 flex items-center gap-2 text-[13px] font-bold uppercase tracking-[.06em] text-muted-foreground">Needs a look{look.length ? <span className="rounded-full bg-amber-100 px-2 text-amber-900">{look.length}</span> : null}</h3>
        {look.length ? <ul className="rounded-[20px] border border-border bg-card px-5">{look.map((comment) => <CommentItem key={comment.comment_uuid} comment={comment} moderator showResource />)}</ul>
          : <p className="flex items-center gap-2 rounded-2xl bg-[#e6f3f1] px-4 py-3 text-sm text-[#0B5F58]"><CheckCircle2 size={16} aria-hidden="true" /><span><b>All clear.</b> Nothing is held or reported in this channel.</span></p>}
      </section>
      <section aria-labelledby="recent-comments-title">
        <h3 id="recent-comments-title" className="mb-2 text-[13px] font-bold uppercase tracking-[.06em] text-muted-foreground">Recent</h3>
        {data.recent.length ? <ul className="rounded-[20px] border border-border bg-card px-5">{data.recent.map((comment) => <CommentItem key={comment.comment_uuid} comment={comment} moderator showResource />)}</ul>
          : <p className="rounded-2xl border-[1.5px] border-dashed border-border px-5 py-8 text-center text-sm text-muted-foreground">No comments yet.</p>}
      </section>
    </>}
  </div>
}

/** In the channel sidebar: how many comments wait on staff, and a way to them. */
export function NeedsLookCard({ count, onOpen }: { count: number; onOpen: () => void }) {
  return <section aria-label="Comments that need a look" className="rounded-[20px] border border-amber-200 bg-amber-50 p-5">
    <h2 className="flex items-center gap-2.5 text-[15px] font-bold"><span className="grid h-8 w-8 place-items-center rounded-lg bg-amber-100 text-amber-800"><Flag size={16} aria-hidden="true" /></span>
      {count} {count === 1 ? 'comment needs' : 'comments need'} a look</h2>
    <p className="mt-2 text-[13.5px] leading-normal text-amber-950/80">Held for review or reported by someone. Nobody else sees held comments until you approve them.</p>
    <button type="button" onClick={onOpen} className="mt-3 inline-flex h-8 items-center rounded-full border border-amber-300 bg-card px-3 text-[13px] font-semibold hover:bg-amber-100">Review comments</button>
  </section>
}
