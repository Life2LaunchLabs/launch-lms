'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { CaretDown, CaretRight, CheckCircle, ImageSquare, Megaphone, PaperPlaneTilt, Question, Sparkle, X } from '@phosphor-icons/react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@components/ui/dialog'
import { Textarea } from '@components/ui/textarea'
import { Button } from '@components/ui/button'
import { Badge } from '@components/ui/badge'
import { Alert, AlertDescription } from '@components/ui/alert'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@components/ui/tooltip'
import {
  CandidateAnnouncement, CandidateFeedback, CandidateFeedbackIntent, CandidateReleaseFeed, candidateAttachmentUrl,
  commentOnCandidateFeedback, getCandidateAnnouncements, getCandidateFeedback,
  getCandidateReleases, markCandidateAnnouncementsViewed, markCandidateFeedbackViewed,
  markCandidateReleasesViewed, resolveCandidateFeedback, submitCandidateFeedback,
} from '@services/candidate/candidate'

export type CandidatePanel = 'feedback' | 'releases' | 'announcements'

const ROUTE_HISTORY_KEY = 'launchlms-candidate-route-history'

const FEEDBACK_INTENTS: Array<{ value: CandidateFeedbackIntent; label: string; placeholder: string }> = [
  { value: 'stuck', label: "I'm stuck", placeholder: 'What were you trying to do, and where did you get stuck?' },
  { value: 'broken', label: 'Something is broken', placeholder: 'What happened, and what did you expect instead?' },
  { value: 'confusing', label: 'Something is confusing', placeholder: 'What felt unclear or hard to understand?' },
  { value: 'missing', label: 'Something is missing', placeholder: 'What did you expect to find or be able to do?' },
  { value: 'love', label: 'I love this', placeholder: 'What worked especially well for you?' },
]

const intentLabel = (intent?: CandidateFeedbackIntent | null) =>
  FEEDBACK_INTENTS.find((option) => option.value === intent)?.label || 'Something else'

export function recordCandidateRoute(path: string) {
  try {
    const current = JSON.parse(sessionStorage.getItem(ROUTE_HISTORY_KEY) || '[]') as string[]
    sessionStorage.setItem(ROUTE_HISTORY_KEY, JSON.stringify([...current.filter((item) => item !== path), path].slice(-5)))
  } catch { /* storage can be unavailable */ }
}

function reproductionContext() {
  let routes = [window.location.pathname]
  try { routes = JSON.parse(sessionStorage.getItem(ROUTE_HISTORY_KEY) || '[]') } catch { /* use current route */ }
  return {
    routes,
    viewport: { width: window.innerWidth, height: window.innerHeight },
    screen: { width: window.screen.width, height: window.screen.height },
    pixel_ratio: window.devicePixelRatio,
    user_agent: navigator.userAgent,
    platform: navigator.platform,
    color_scheme: window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
    touch: navigator.maxTouchPoints > 0,
  }
}

interface CandidatePanelContentProps {
  panel: CandidatePanel
  theme?: 'light' | 'dark'
  orgId?: number
  accessToken?: string
  feedbackConfigured?: boolean
  onReleasesViewed?: () => void
}

export function CandidatePanelContent({ panel, theme = 'light', orgId, accessToken, feedbackConfigured = true, onReleasesViewed }: CandidatePanelContentProps) {
  const [message, setMessage] = useState('')
  const [composerOpen, setComposerOpen] = useState(false)
  const [intent, setIntent] = useState<CandidateFeedbackIntent | null>(null)
  const [images, setImages] = useState<Array<{ file: File; preview: string }>>([])
  const [history, setHistory] = useState<CandidateFeedback[]>([])
  const [expandedItem, setExpandedItem] = useState<string | null>(null)
  const [releases, setReleases] = useState<CandidateReleaseFeed | null>(null)
  const [announcements, setAnnouncements] = useState<CandidateAnnouncement[]>([])
  const [commenting, setCommenting] = useState<string | null>(null)
  const [comment, setComment] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)
  const isDark = theme === 'dark'

  const load = useCallback(async () => {
    if (!accessToken) return
    setLoading(true); setError('')
    try {
      const requests: Promise<unknown>[] = []
      if (panel === 'feedback' && orgId && feedbackConfigured) requests.push(getCandidateFeedback(orgId, accessToken).then(async (items) => {
        setHistory(items)
        await markCandidateFeedbackViewed(orgId, accessToken)
        window.dispatchEvent(new CustomEvent('candidate-stream-viewed', { detail: 'feedback' }))
      }))
      if (panel === 'releases') requests.push(getCandidateReleases(accessToken).then(setReleases))
      if (panel === 'announcements') requests.push(getCandidateAnnouncements(accessToken).then(async (feed) => {
        setAnnouncements(feed.items)
        if (feed.unread.length) await markCandidateAnnouncementsViewed(feed.unread.map((item) => item.id), accessToken)
        window.dispatchEvent(new CustomEvent('candidate-stream-viewed', { detail: 'announcements' }))
      }))
      const results = await Promise.allSettled(requests)
      const failure = results.find((result) => result.status === 'rejected') as PromiseRejectedResult | undefined
      if (failure) throw failure.reason
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not load this panel') }
    finally { setLoading(false) }
  }, [accessToken, feedbackConfigured, orgId, panel])
  useEffect(() => { void load() }, [load])

  useEffect(() => {
    if (panel !== 'releases' || !releases?.has_unread || !accessToken) return
    void markCandidateReleasesViewed(accessToken).then(() => {
      setReleases((current) => current ? { ...current, has_unread: false } : current)
      onReleasesViewed?.()
      window.dispatchEvent(new CustomEvent('candidate-stream-viewed', { detail: 'releases' }))
    }).catch(() => undefined)
  }, [accessToken, onReleasesViewed, panel, releases?.has_unread])

  const addImages = (files: File[]) => {
    const accepted = files.filter((file) => file.type.startsWith('image/')).slice(0, Math.max(0, 3 - images.length))
    setImages((current) => [...current, ...accepted.map((file) => ({ file, preview: URL.createObjectURL(file) }))].slice(0, 3))
  }
  const removeImage = (image: { file: File; preview: string }) => {
    URL.revokeObjectURL(image.preview)
    setImages((current) => current.filter((entry) => entry !== image))
  }
  const closeComposer = () => {
    images.forEach((image) => URL.revokeObjectURL(image.preview))
    setImages([]); setMessage(''); setIntent(null); setComposerOpen(false)
  }
  const submit = async () => {
    if (!message.trim() || !orgId || !accessToken) return
    setLoading(true); setError('')
    try {
      const created = await submitCandidateFeedback(orgId, message, images.map((image) => image.file), reproductionContext(), accessToken, intent)
      setHistory((current) => [created, ...current]); setExpandedItem(created.key)
      closeComposer()
      await markCandidateFeedbackViewed(orgId, accessToken)
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not send feedback') }
    finally { setLoading(false) }
  }
  const resolve = async (item: CandidateFeedback, outcome: 'looks_good' | 'still_happening') => {
    if (!orgId || !accessToken) return
    setLoading(true); setError('')
    try {
      const updated = await resolveCandidateFeedback(orgId, item.key, outcome, accessToken)
      if (outcome === 'looks_good') {
        setHistory((current) => current.filter((entry) => entry.key !== item.key)); setExpandedItem(null)
      } else {
        setHistory((current) => current.map((entry) => entry.key === item.key ? updated : entry)); setExpandedItem(item.key)
      }
      await markCandidateFeedbackViewed(orgId, accessToken)
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not update this feedback') }
    finally { setLoading(false) }
  }
  const sendComment = async (item: CandidateFeedback) => {
    if (!orgId || !accessToken || !comment.trim()) return
    setLoading(true); setError('')
    try {
      const updated = await commentOnCandidateFeedback(orgId, item.key, comment, accessToken)
      setHistory((current) => current.map((entry) => entry.key === item.key ? updated : entry))
      setComment(''); setCommenting(null)
      await markCandidateFeedbackViewed(orgId, accessToken)
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not add your comment') }
    finally { setLoading(false) }
  }
  const downloadAttachment = async (item: CandidateFeedback, attachmentId: string, filename: string) => {
    if (!orgId || !accessToken) return
    const response = await fetch(candidateAttachmentUrl(orgId, item.key, attachmentId), { headers: { Authorization: `Bearer ${accessToken}` } })
    if (!response.ok) return setError('Could not open that screenshot')
    const url = URL.createObjectURL(await response.blob())
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return <div className={isDark ? 'text-white' : 'text-foreground'}>
    {error ? <Alert variant="destructive" className="mb-3"><AlertDescription>{error}</AlertDescription></Alert> : null}
    {panel === 'feedback' ? !feedbackConfigured ? <Alert><AlertDescription>Feedback is temporarily unavailable because this preview is not connected to Jira.</AlertDescription></Alert> : <>
      <div className={isDark ? 'rounded-xl border border-white/10 bg-white/[0.04] p-3' : 'rounded-xl border border-border bg-card p-3'} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); addImages(Array.from(event.dataTransfer.files)) }} onPaste={(event) => addImages(Array.from(event.clipboardData.files))}>
        {!composerOpen ? <>
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="text-sm font-semibold">What would you like to tell us?</p>
            <TooltipProvider><Tooltip><TooltipTrigger asChild><button type="button" aria-label="How feedback works" className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><Question size={18} /></button></TooltipTrigger><TooltipContent side="left" className="max-w-72"><p>Your note and anonymous page/device details go to our team. You will see replies shared with testers, while internal notes stay private.</p></TooltipContent></Tooltip></TooltipProvider>
          </div>
          <div className="space-y-2">{FEEDBACK_INTENTS.map((option) => <button key={option.value} type="button" onClick={() => { setIntent(option.value); setComposerOpen(true) }} className={isDark ? 'flex w-full items-center justify-between rounded-lg border border-white/10 bg-black/10 px-3 py-2.5 text-left text-sm hover:bg-white/[0.06]' : 'flex w-full items-center justify-between rounded-lg border border-border px-3 py-2.5 text-left text-sm hover:bg-muted'}><span>{option.label}</span><CaretRight className="text-muted-foreground" /></button>)}</div>
          <button type="button" onClick={() => { setIntent(null); setComposerOpen(true) }} className={isDark ? 'mt-3 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-3 text-left text-sm text-white/50' : 'mt-3 w-full rounded-lg border border-input bg-background px-3 py-3 text-left text-sm text-muted-foreground'}>Something else…</button>
        </> : <>
          <div className="mb-3 flex items-center justify-between gap-3"><p className="text-sm font-semibold">{intentLabel(intent)}</p><button type="button" aria-label="Cancel feedback" onClick={closeComposer} className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><X size={18} /></button></div>
          <Textarea autoFocus value={message} onChange={(event) => setMessage(event.target.value)} placeholder={FEEDBACK_INTENTS.find((option) => option.value === intent)?.placeholder || 'What did you notice?'} aria-label="Feedback message" className={isDark ? 'min-h-28 resize-none border-white/10 bg-black/20 text-white placeholder:text-white/30' : 'min-h-28 resize-none'} />
          {images.length ? <div className="mt-3 flex gap-2">{images.map((image) => <div key={image.preview} className="relative"><img src={image.preview} alt={image.file.name} className="h-16 w-16 rounded-lg object-cover" /><button type="button" aria-label={`Remove ${image.file.name}`} onClick={() => removeImage(image)} className="absolute -right-1 -top-1 rounded-full bg-black p-1 text-white"><X size={11} /></button></div>)}</div> : null}
          <div className="mt-3 flex items-center justify-between gap-3"><div><input ref={fileInput} className="hidden" type="file" accept="image/jpeg,image/png,image/gif,image/webp" multiple onChange={(event) => addImages(Array.from(event.target.files || []))} /><Button type="button" variant="ghost" size="sm" onClick={() => fileInput.current?.click()} disabled={images.length >= 3}><ImageSquare /> Add screenshots <span className="text-muted-foreground">{images.length}/3</span></Button></div><Button type="button" size="sm" onClick={() => void submit()} disabled={!message.trim() || loading}><PaperPlaneTilt weight="fill" /> {loading ? 'Sending…' : 'Send'}</Button></div>
          <p className="mt-2 text-xs text-muted-foreground">Your original note cannot be edited after it is sent. Anonymous route and device details are attached for reproduction.</p>
        </>}
      </div>
      <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground"><span className="h-px flex-1 bg-current opacity-20" />Your submissions<span className="h-px flex-1 bg-current opacity-20" /></div>
      <div className="space-y-3">{!history.length && !loading ? <p className="py-8 text-center text-sm text-muted-foreground">Nothing here yet. A quick sentence is plenty.</p> : null}{[...history].sort((a, b) => Number(b.status_category === 'done') - Number(a.status_category === 'done')).map((item) => {
        const expanded = expandedItem === item.key
        const latestTeamReply = [...item.entries].reverse().find((entry) => entry.audience === 'shared')
        return <article key={item.key} className={item.status_category === 'done' ? (isDark ? 'rounded-xl border border-emerald-400/30 bg-emerald-400/[0.05]' : 'rounded-xl border border-emerald-200 bg-emerald-50/50') : (isDark ? 'rounded-xl border border-white/10' : 'rounded-xl border border-border')}>
          <button type="button" aria-expanded={expanded} onClick={() => { setExpandedItem(expanded ? null : item.key); setCommenting(null); setComment('') }} className="flex w-full items-start gap-3 p-3 text-left">
            {expanded ? <CaretDown className="mt-1 shrink-0 text-muted-foreground" /> : <CaretRight className="mt-1 shrink-0 text-muted-foreground" />}
            <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="text-xs font-semibold">{intentLabel(item.intent)}</span><Badge variant="outline" className={isDark ? 'border-white/15 text-white/70' : ''}>{item.status}</Badge>{item.status_category === 'done' ? <span className="flex items-center gap-1 text-xs font-medium text-emerald-600"><CheckCircle />Needs your check</span> : null}</div><p className="mt-1 truncate text-sm text-muted-foreground">{latestTeamReply ? `Team: ${latestTeamReply.message}` : item.message}</p></div>
            <span className="shrink-0 text-xs text-muted-foreground">{item.created_at ? new Date(item.created_at).toLocaleDateString() : item.key}</span>
          </button>
          {expanded ? <div className={isDark ? 'border-t border-white/10 px-4 pb-4 pt-3' : 'border-t border-border px-4 pb-4 pt-3'}>
            <div className="flex flex-wrap items-center gap-2"><Badge variant="outline">{item.priority}</Badge><span className="text-xs text-muted-foreground">{item.key}</span></div>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-6">{item.message}</p>
            {item.attachments.length ? <div className="mt-3 flex flex-wrap gap-2">{item.attachments.map((attachment) => <Button key={attachment.id} variant="outline" size="sm" onClick={() => void downloadAttachment(item, attachment.id, attachment.filename)}><ImageSquare />{attachment.filename}</Button>)}</div> : null}
            {item.entries.length ? <div className="mt-4 space-y-2 border-l-2 border-amber-400/40 pl-3">{item.entries.map((entry) => <div key={entry.id}><p className="text-sm">{entry.message}</p><p className="mt-1 text-xs text-muted-foreground">{entry.audience === 'tester' ? 'You' : entry.author}</p></div>)}</div> : null}
            {item.status_category === 'done' ? <div className={isDark ? 'mt-4 rounded-lg bg-emerald-400/10 p-3' : 'mt-4 rounded-lg bg-emerald-50 p-3'}><p className="text-sm font-semibold">The team marked this complete.</p>{latestTeamReply ? <p className="mt-1 text-sm text-muted-foreground">{latestTeamReply.message}</p> : <p className="mt-1 text-sm text-muted-foreground">Could you give it a quick check?</p>}<div className="mt-3 flex flex-wrap gap-2"><Button size="sm" onClick={() => void resolve(item, 'looks_good')} disabled={loading}><CheckCircle weight="fill" />Looks good</Button><Button variant="outline" size="sm" onClick={() => void resolve(item, 'still_happening')} disabled={loading}>Still happening</Button></div></div> : null}
            {commenting === item.key ? <div className="mt-4"><Textarea aria-label="Add a follow-up comment" value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Add anything else that might help…" /><div className="mt-2 flex justify-end gap-2"><Button variant="ghost" size="sm" onClick={() => { setCommenting(null); setComment('') }}>Cancel</Button><Button size="sm" disabled={!comment.trim() || loading} onClick={() => void sendComment(item)}>Add comment</Button></div></div> : <Button className="mt-3" variant="ghost" size="sm" onClick={() => setCommenting(item.key)}>Add a comment</Button>}
          </div> : null}
        </article>
      })}</div>
    </> : null}
    {panel === 'releases' ? <>
      {releases?.unseen.length ? <section><Badge className="mb-3 bg-amber-500 text-black hover:bg-amber-500">New since you last tested</Badge><ReleaseList releases={releases.unseen} dark={isDark} /><div className="my-5 flex items-center gap-3 text-xs text-muted-foreground"><span className="h-px flex-1 bg-border" />Earlier updates<span className="h-px flex-1 bg-border" /></div></section> : null}
      <ReleaseList releases={releases?.previous || []} dark={isDark} />
      {!loading && !releases?.unseen.length && !releases?.previous.length ? <p className="py-12 text-center text-sm text-muted-foreground">No merge notes are available for this build yet.</p> : null}
    </> : null}
    {panel === 'announcements' ? <div className="space-y-3">{announcements.map((item) => <article key={item.id} className={isDark ? 'rounded-xl border border-white/10 p-4' : 'rounded-xl border border-border p-4'}><div className="flex items-center gap-2"><Megaphone className="text-amber-500" /><h3 className="font-semibold">{item.title}</h3></div><p className="mt-2 whitespace-pre-wrap text-sm leading-6">{item.message}</p><p className="mt-2 text-xs text-muted-foreground">{new Date(item.published_at).toLocaleDateString()}</p></article>)}{!loading && !announcements.length ? <p className="py-12 text-center text-sm text-muted-foreground">No tester announcements right now.</p> : null}</div> : null}
  </div>
}

interface FeedbackModalProps {
  open: boolean
  onOpenChange: React.ComponentProps<typeof Dialog>['onOpenChange']
  theme?: 'light' | 'dark'
  orgId?: number
  accessToken?: string
}

export function FeedbackModal({ open, onOpenChange, theme = 'light', orgId, accessToken }: FeedbackModalProps) {
  const isDark = theme === 'dark'
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className={isDark ? 'max-h-[92dvh] sm:max-w-2xl border-white/10 bg-[#0f0f10] text-white' : 'max-h-[92dvh] sm:max-w-2xl'}><DialogHeader><DialogTitle>Feedback</DialogTitle><DialogDescription>Tell us what needs attention. A quick sentence is plenty.</DialogDescription></DialogHeader><div className="max-h-[68dvh] overflow-y-auto pr-1"><CandidatePanelContent panel="feedback" theme={theme} orgId={orgId} accessToken={accessToken} /></div></DialogContent></Dialog>
}

function ReleaseList({ releases, dark }: { releases: CandidateReleaseFeed['unseen']; dark: boolean }) {
  return <div className="space-y-3">{releases.map((release) => <article key={release.revision} className={dark ? 'rounded-xl border border-white/10 p-4' : 'rounded-xl border border-border p-4'}><div className="flex items-center justify-between gap-3"><h3 className="text-sm font-semibold">{release.title}</h3><span className="text-xs text-muted-foreground">{release.published_at ? new Date(release.published_at).toLocaleDateString() : ''}</span></div><ul className="mt-3 space-y-2">{release.notes.map((note, index) => <li key={`${release.revision}-${index}`} className="flex gap-2 text-sm leading-6"><Sparkle className="mt-1 shrink-0 text-amber-500" />{note.url ? <a href={note.url} target="_blank" rel="noreferrer" className="hover:underline">{note.text}</a> : note.text}</li>)}</ul></article>)}</div>
}
