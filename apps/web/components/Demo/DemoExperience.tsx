'use client'
import Image from 'next/image'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeftRight, BookOpen, ChevronDown, Clock, LogOut, Megaphone, MessageCircle, RotateCcw, Upload, UserRound } from 'lucide-react'
import { useSession } from '@components/Contexts/AuthContext'
import { CANDIDATE_OPEN_EVENT } from '@components/Candidate/CandidateExperience'
import { Button } from '@components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@components/ui/dialog'
import { Popover, PopoverContent, PopoverTrigger } from '@components/ui/popover'
import { getUriWithOrg } from '@services/config/config'
import { announceDemoSetupChange, demoAccountName, demoAvatarUrl, demoRequest, DemoRequestError, setDemoBarActive, type DemoAnnouncement, type DemoJourney, type DemoStatus } from '@services/demo/demo'
import DemoFeedback from './DemoFeedback'
import DemoGuide, { type GuideTopic } from './DemoGuide'
import DemoToolbar, { DemoTag } from './DemoToolbar'

const JOURNEY_KEY = 'launchlms-demo-journey'
const SEEN_KEY = 'launchlms-demo-announcements-seen'
type Confirmation = 'reset' | 'switch' | 'end' | 'publish'
// {name} is replaced with the demo user's first name.
const CONFIRM: Record<Confirmation, { title: string; body: string; action: string }> = {
  reset: { title: 'Start over as {name}?', body: 'Your changes are discarded, including in other tabs, and you get a fresh copy.', action: 'Start over' },
  switch: { title: 'Try a different demo user?', body: 'Your changes are discarded, including in other tabs.', action: 'Choose someone else' },
  end: { title: 'End the demo?', body: 'Your changes are discarded, including in other tabs. You can start a new demo any time.', action: 'End demo' },
  publish: { title: 'Publish the demo?', body: 'New visitors start from every demo user as they are right now. People already exploring keep their current copy.', action: 'Publish' },
}

function Avatar({ url }: { url: string | null }) {
  return <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/70 dark:bg-white/10">{url ? <Image src={url} width={28} height={28} unoptimized alt="" className="h-full w-full object-cover" /> : <UserRound aria-hidden className="h-4 w-4" />}</span>
}

const barButton = 'h-9 gap-1.5 px-2 text-[12.5px] font-semibold text-inherit hover:bg-current/10 hover:text-inherit data-[state=open]:bg-current/10'

export default function DemoExperience() {
  const session = useSession()
  const [state, setState] = useState<DemoStatus | null>(null)
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null)
  const [warning, setWarning] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [guideOpen, setGuideOpen] = useState(false)
  const [topic, setTopic] = useState<GuideTopic>('about')
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [journey, setJourney] = useState<string | null>(null)
  const [announcements, setAnnouncements] = useState<DemoAnnouncement[]>([])
  const [announcementsOpen, setAnnouncementsOpen] = useState(false)
  const [seen, setSeen] = useState<string[]>([])
  const confirmationFocus = useRef<HTMLElement | null>(null)
  const warnedExpiry = useRef('')
  const visitor = state?.mode === 'visitor'
  const setup = state?.mode === 'admin'
  const showBar = Boolean(visitor || setup)

  const refresh = useCallback(async () => {
    try { setState(await demoRequest<DemoStatus>('status')) }
    catch (failure) {
      if (failure instanceof DemoRequestError && failure.status === 401 && window.location.pathname !== '/demo') {
        setState((previous) => { if (previous?.mode === 'visitor') window.location.assign('/demo?ended=1'); return previous })
      }
    }
  }, [])
  useEffect(() => {
    if (session.status === 'loading') return
    void refresh()
    const interval = window.setInterval(() => void refresh(), 30000)
    window.addEventListener('demo-setup-changed', refresh)
    return () => { window.clearInterval(interval); window.removeEventListener('demo-setup-changed', refresh) }
  }, [session.status, refresh])
  useEffect(() => {
    try { setJourney(sessionStorage.getItem(JOURNEY_KEY)) } catch { /* storage unavailable */ }
    try { setSeen(JSON.parse(localStorage.getItem(SEEN_KEY) || '[]')) } catch { /* storage unavailable */ }
  }, [])
  // The same tester announcements as the unstable bar; seen state stays in this browser.
  useEffect(() => {
    if (!visitor) return
    demoRequest<{ items: DemoAnnouncement[] }>('announcements').then((result) => setAnnouncements(result.items)).catch(() => setAnnouncements([]))
  }, [visitor])
  // First arrival from the picker opens the guide.
  useEffect(() => {
    if (!visitor) return
    const url = new URL(window.location.href)
    if (url.searchParams.get('demo_guide') !== '1') return
    url.searchParams.delete('demo_guide')
    window.history.replaceState(window.history.state, '', url.toString())
    setTopic('about'); setGuideOpen(true)
  }, [visitor])
  useEffect(() => {
    document.documentElement.style.setProperty('--demo-bar-height', showBar ? '3rem' : '0px')
    setDemoBarActive(showBar)
    return () => { document.documentElement.style.removeProperty('--demo-bar-height'); setDemoBarActive(false) }
  }, [showBar])
  // Feedback links elsewhere in the product open the demo's feedback panel.
  useEffect(() => {
    if (!visitor) return
    const open = (event: Event) => { event.stopImmediatePropagation(); setFeedbackOpen(true) }
    window.addEventListener(CANDIDATE_OPEN_EVENT, open, { capture: true })
    return () => window.removeEventListener(CANDIDATE_OPEN_EVENT, open, { capture: true })
  }, [visitor])
  useEffect(() => {
    if (!visitor || !state?.expires_at) return
    const expiresAt = state.expires_at
    function checkExpiry() {
      const remaining = Date.parse(expiresAt) - Date.now()
      if (remaining <= 300000 && warnedExpiry.current !== expiresAt) { warnedExpiry.current = expiresAt; setWarning(true) }
      else if (remaining > 300000) setWarning(false)
      if (remaining <= 0) window.location.assign('/demo?ended=1')
    }
    checkExpiry()
    const interval = window.setInterval(checkExpiry, 10000)
    return () => window.clearInterval(interval)
  }, [visitor, state?.expires_at])

  const unseen = announcements.filter((item) => !seen.includes(item.id)).length
  function markSeen() {
    const next = Array.from(new Set([...seen, ...announcements.map((item) => item.id)])).slice(-100)
    setSeen(next)
    try { localStorage.setItem(SEEN_KEY, JSON.stringify(next)) } catch { /* storage unavailable */ }
  }

  function chooseJourney(item: DemoJourney | null) {
    setJourney(item?.title || null)
    try { if (item) sessionStorage.setItem(JOURNEY_KEY, item.title); else sessionStorage.removeItem(JOURNEY_KEY) } catch { /* storage unavailable */ }
  }

  const member = setup ? state?.members?.find((item) => item.user_id === state.setup_user_id) : undefined
  const person = visitor ? state?.pilot : member
  const name = person ? demoAccountName(person) : 'Demo user'
  const firstName = person?.first_name || name
  const studioUrl = (path = '') => getUriWithOrg(state?.main_org_slug || '', `/admin/platform/demo${path}`)

  async function act(action: Confirmation | 'extend' | 'exit') {
    setBusy(true); setError(''); setNotice('')
    try {
      if (action === 'publish') {
        await demoRequest('checkpoints', 'POST', { revision: state?.settings?.revision })
        setNotice('Published. New visitors start from here.'); setConfirmation(null); announceDemoSetupChange(); await refresh()
      } else if (action === 'extend') {
        const result = await demoRequest<{ expires_at: string }>('extend', 'POST')
        setState((previous) => previous ? { ...previous, expires_at: result.expires_at } : previous)
        setWarning(false); setMenuOpen(false)
      } else if (action === 'exit') {
        await demoRequest('admin/exit', 'POST')
        window.location.assign(studioUrl(member ? `/${member.user_id}` : ''))
      } else if (action === 'reset') {
        await demoRequest('reset', 'POST'); window.location.assign('/demo?preparing=1')
      } else {
        await demoRequest('end', 'POST'); window.location.assign(action === 'end' ? '/demo?ended=1' : '/demo')
      }
    } catch (failure) { setError((failure as Error).message) }
    finally { setBusy(false) }
  }
  function confirm(kind: Confirmation, target: EventTarget) { confirmationFocus.current = target as HTMLElement; setMenuOpen(false); setConfirmation(kind) }

  if (!state || !showBar) return null
  const minutesLeft = state.expires_at ? Math.max(0, Math.round((Date.parse(state.expires_at) - Date.now()) / 60000)) : null
  const avatar = visitor && person ? demoAvatarUrl(state.checkpoint_id, person) : null
  const extension = state.settings?.extension_minutes || 30

  return <>
    {setup ? <DemoToolbar variant="setup">
      <div className="flex min-w-0 items-center gap-1.5 sm:gap-2"><DemoTag tone="live">Live</DemoTag>{state.unstable ? <DemoTag tone="unstable">Unstable</DemoTag> : null}<span className="truncate text-sm font-semibold">Setting up {name}</span><span className="hidden truncate text-xs opacity-75 lg:inline">Edits save to the demo. Visitors get them after you publish.</span></div>
      <div className="flex shrink-0 items-center gap-0.5">
        {member?.changed ? <span className="mr-1 hidden rounded-full bg-orange-500/20 px-2 py-0.5 text-[11px] font-semibold text-orange-100 md:inline">Set up since last publish</span> : null}
        <Button variant="ghost" size="sm" className={barButton} onClick={() => { setTopic('about'); setGuideOpen(true) }}><BookOpen className="h-4 w-4" /><span className="hidden sm:inline">Guide</span></Button>
        <Button variant="ghost" size="sm" className={barButton} disabled={busy} onClick={(event) => confirm('publish', event.currentTarget)}><Upload className="h-4 w-4" /><span className="hidden sm:inline">Publish</span></Button>
        <Button variant="ghost" size="sm" className={barButton} disabled={busy} onClick={() => void act('exit')}><LogOut className="h-4 w-4" /><span className="hidden sm:inline">Back to Studio</span></Button>
      </div>
    </DemoToolbar> : <DemoToolbar>
      <div className="flex min-w-0 items-center gap-1.5">
        {state.unstable ? <DemoTag tone="unstable">Unstable</DemoTag> : null}<DemoTag tone="demo">Demo</DemoTag>
        <Popover open={menuOpen} onOpenChange={setMenuOpen}>
          <PopoverTrigger asChild><button type="button" className="ml-1 flex min-w-0 items-center gap-2 rounded-full bg-current/[0.07] py-0.5 pl-0.5 pr-2.5 text-sm font-semibold hover:bg-current/[0.12]"><Avatar url={avatar} /><span className="truncate">{name}</span><ChevronDown className="h-3.5 w-3.5 shrink-0" /></button></PopoverTrigger>
          <PopoverContent align="start" className="w-72 rounded-2xl p-1.5">
            <div className="flex items-center gap-2.5 px-2.5 py-2"><Avatar url={avatar} /><div className="min-w-0"><p className="truncate text-sm font-semibold">{name}</p>{person?.role_line ? <p className="truncate text-xs text-muted-foreground">{person.role_line}</p> : null}</div></div>
            <div className="my-1 border-t" />
            <MenuItem icon={<ArrowLeftRight className="h-4 w-4" />} onClick={(event) => confirm('switch', event.currentTarget)}>Try a different demo user</MenuItem>
            <MenuItem icon={<RotateCcw className="h-4 w-4" />} onClick={(event) => confirm('reset', event.currentTarget)}>Start over as {firstName}</MenuItem>
            <MenuItem icon={<Clock className="h-4 w-4" />} onClick={() => void act('extend')}>{minutesLeft !== null ? `${minutesLeft} min left · ` : ''}Add {extension} min</MenuItem>
            <div className="my-1 border-t" />
            <MenuItem icon={<LogOut className="h-4 w-4" />} onClick={(event) => confirm('end', event.currentTarget)}>End demo</MenuItem>
          </PopoverContent>
        </Popover>
      </div>
      <div className="flex shrink-0 items-center gap-0.5">
        <Button variant="ghost" size="sm" className={barButton} aria-expanded={guideOpen} onClick={() => { setTopic('about'); setGuideOpen(true) }}><BookOpen className="h-4 w-4" /><span className="hidden sm:inline">Guide</span></Button>
        <Popover open={feedbackOpen} onOpenChange={setFeedbackOpen}>
          <PopoverTrigger asChild><Button variant="ghost" size="sm" className={barButton}><MessageCircle className="h-4 w-4" /><span className="hidden sm:inline">Feedback</span></Button></PopoverTrigger>
          <PopoverContent align="end" className="w-[min(24rem,calc(100dvw-1.5rem))] rounded-2xl p-4"><DemoFeedback personName={name} journey={journey} tag={state.tag} configured={state.feedback_configured !== false} /></PopoverContent>
        </Popover>
        {announcements.length ? <Popover open={announcementsOpen} onOpenChange={(open) => { setAnnouncementsOpen(open); if (open) markSeen() }}>
          <PopoverTrigger asChild><Button variant="ghost" size="sm" className={barButton} aria-label={unseen ? `Announcements, ${unseen} unread` : 'Announcements'}><Megaphone className="h-4 w-4" /><span className="hidden md:inline">Announcements</span>{unseen ? <span className="min-w-4 rounded-full bg-red-600 px-1 text-[10px] font-bold leading-4 text-white">{unseen}</span> : null}</Button></PopoverTrigger>
          <PopoverContent align="end" className="max-h-[70dvh] w-[min(24rem,calc(100dvw-1.5rem))] space-y-3 overflow-y-auto rounded-2xl p-4">{announcements.map((item) => <article key={item.id} className="rounded-xl border p-3"><p className="font-semibold">{item.title}</p><p className="mt-1 whitespace-pre-wrap text-sm leading-6">{item.message}</p>{item.published_at ? <p className="mt-1 text-xs text-muted-foreground">{new Date(item.published_at).toLocaleDateString()}</p> : null}</article>)}</PopoverContent>
        </Popover> : null}
      </div>
    </DemoToolbar>}
    {(error || notice) && <div role={error ? 'alert' : 'status'} className={`border-b bg-background px-5 py-2 text-sm ${error ? 'text-destructive' : 'text-muted-foreground'}`}>{error || notice}</div>}
    <DemoGuide open={guideOpen} onOpenChange={setGuideOpen} topic={topic} onTopic={setTopic} personName={name} firstName={firstName} roleLine={person?.role_line} description={person?.description} preview={setup} onJourney={chooseJourney} />
    <Dialog open={Boolean(confirmation)} onOpenChange={(open) => { if (!busy && !open) setConfirmation(null) }}>
      <DialogContent onCloseAutoFocus={(event) => { event.preventDefault(); confirmationFocus.current?.focus() }} className="max-w-[calc(100dvw-2rem)] sm:max-w-lg">
        {confirmation ? <><DialogHeader><DialogTitle>{CONFIRM[confirmation].title.replace('{name}', firstName)}</DialogTitle><DialogDescription>{CONFIRM[confirmation].body}</DialogDescription></DialogHeader>
        <DialogFooter className="mt-5 gap-2"><Button variant="outline" disabled={busy} onClick={() => setConfirmation(null)}>Cancel</Button><Button disabled={busy} onClick={() => void act(confirmation)}>{busy ? 'Please wait…' : CONFIRM[confirmation].action}</Button></DialogFooter></> : null}
      </DialogContent>
    </Dialog>
    <Dialog open={warning} onOpenChange={setWarning}><DialogContent className="max-w-[calc(100dvw-2rem)] sm:max-w-lg"><DialogHeader><DialogTitle>Want more time to explore?</DialogTitle><DialogDescription>Your demo ends in five minutes. Add time to keep your work, or end now.</DialogDescription></DialogHeader><DialogFooter className="mt-5 gap-2"><Button variant="outline" disabled={busy} onClick={() => void act('end')}>End demo</Button><Button disabled={busy} onClick={() => void act('extend')}>{busy ? 'Adding…' : `Add ${extension} min`}</Button></DialogFooter></DialogContent></Dialog>
  </>
}

function MenuItem({ icon, children, onClick }: { icon: React.ReactNode; children: React.ReactNode; onClick: React.MouseEventHandler<HTMLButtonElement> }) {
  return <button type="button" onClick={onClick} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-muted">{icon}<span className="min-w-0 flex-1">{children}</span></button>
}

