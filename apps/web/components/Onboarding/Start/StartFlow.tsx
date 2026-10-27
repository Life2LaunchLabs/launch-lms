'use client'

import React from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { AnimatePresence, motion } from 'motion/react'
import { SiGoogle } from '@icons-pack/react-simple-icons'
import { ArrowLeft, ArrowRight, Award, Building2, Check, Compass, GraduationCap, Heart, Layers3, ListChecks, Loader2, Megaphone, Plus, Sparkles, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import '@/styles/admin-dark.css'
import AdminSurface from '@components/Utils/AdminSurface'
import { Button } from '@components/ui/button'
import { useAuth } from '@components/Contexts/AuthContext'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { useOrg } from '@components/Contexts/OrgContext'
import AgeConfirm, { useAgeConfirm } from '@components/Auth/AgeConfirm'
import { validatePasswordStrength } from '@components/Auth/PasswordStrengthIndicator'
import { signup } from '@services/auth/auth'
import { authenticatedOrgHref } from '@services/auth/handoff'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { inviteBatchUsers } from '@services/organizations/invites'
import { createUserGroup } from '@services/usergroups/usergroups'
import { startApi, startKeys, type SetUpResult } from '@services/onboarding/start'
import Critter from './Critter'
import SitePreview, { type PreviewPage } from './SitePreview'
import TierCompare from './TierCompare'
import TourScene from './TourScene'
import { H1, LEDE, TOUR } from './tour'
import { PALETTE, ROLES, ROLE_IDS, groupSuggestions, type StartRole } from './roles'

type Step = 't0' | 't1' | 't2' | 't3' | 'role' | 'reqs' | 'plans' | 'account' | 'you' | 'tier' | 'learners' | 'staff' | 'groups' | 'done'

export interface StartState {
  step: Step
  role: StartRole | null
  picked: string[]
  name: string
  orgOn: boolean
  org: string
  color: string
  trial: boolean | null
  learners: string[]
  staff: string[]
  groups: string[]
  /** A library framework to track, picked before the plans so they're ranked by what they cover. */
  framework: string | null
  /** The space set_up made, once it has. */
  space: SetUpResult['org'] | null
  /** What has already gone to the server, so going back and forward doesn't send it twice. */
  sent: string[]
}

const STORAGE_KEY = 'l2l_start'
const fresh = (): StartState => ({
  step: 't0', role: null, picked: [], name: '', orgOn: false, org: '', color: '#2F66D6', trial: null,
  learners: [], staff: [], groups: [], framework: null, space: null, sent: [],
})

const ROLE_ICONS: Record<StartRole, React.ReactNode> = {
  parent: <Heart size={18} />, mentor: <Compass size={18} />, teacher: <GraduationCap size={18} />, program: <Megaphone size={18} />, district: <Building2 size={18} />,
}
const EMAIL = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i
const order = (state: StartState): Step[] => ['t0', 't1', 't2', 't3', 'role', 'reqs', 'plans', 'account', 'you', 'tier', ...(state.trial ? ['staff', 'groups'] as Step[] : ['learners'] as Step[]), 'done']
const previewPage: Partial<Record<Step, PreviewPage>> = { reqs: 'requirements', plans: 'plans', account: 'plans', you: 'invite', learners: 'people', staff: 'people', groups: 'groups' }
const usernameFrom = (email: string) => `${email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20) || 'user'}${Math.floor(1000 + Math.random() * 9000)}`

/**
 * Getting started: a short tour, then the role, an optional requirement framework, plans (ranked by how
 * much of it they cover) and account, then making the space theirs and the people in it. The space itself
 * is made once, at the tier step, from everything picked so far, on Free or the Full trial alike.
 */
export default function StartFlow() {
  const org = useOrg() as any
  const session = useLHSession() as any
  const { signIn } = useAuth()
  const signedIn = session?.status === 'authenticated'
  const token: string | undefined = session?.data?.tokens?.access_token
  const user = session?.data?.user
  const [state, setState] = React.useState<StartState>(fresh)
  const [restored, setRestored] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState('')

  React.useEffect(() => {
    try {
      const saved = window.sessionStorage.getItem(STORAGE_KEY)
      if (saved) setState({ ...fresh(), ...JSON.parse(saved) })
    } catch { /* a fresh start */ }
    setRestored(true)
  }, [])
  React.useEffect(() => {
    if (!restored) return
    try { window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state)) } catch { /* nothing to keep */ }
  }, [state, restored])
  React.useEffect(() => {
    const full = [user?.first_name, user?.last_name].filter(Boolean).join(' ')
    if (signedIn && full) setState((current) => current.name ? current : { ...current, name: full })
  }, [signedIn, user?.first_name, user?.last_name])

  const patch = (change: Partial<StartState>) => setState((current) => ({ ...current, ...change }))
  const steps = order(state)
  const go = (step: Step) => { setError(''); patch({ step }) }
  const move = (direction: number) => go(steps[Math.max(0, Math.min(steps.length - 1, steps.indexOf(state.step) + direction))])
  const role = state.role ? ROLES[state.role] : null
  const spaceName = state.space?.name || (state.orgOn ? state.org.trim() || 'Your organization' : state.name.trim() ? `${state.name.trim().split(' ')[0]}’s space` : 'Your space')

  const { data: frameworks = [] } = useSWR(startKeys.frameworks(), async () => { try { return await startApi.frameworks() } catch { return [] } }, { revalidateOnFocus: false })
  const framework = frameworks.find((item) => item.framework_uuid === state.framework) || null
  const { data: plans = [] } = useSWR(state.role ? startKeys.suggested(state.role, framework?.framework_uuid) : null, () => startApi.suggested(state.role as StartRole, framework?.framework_uuid))

  const run = async (work: () => Promise<void>) => {
    setBusy(true)
    setError('')
    try { await work() } catch (failure: any) { setError(failure?.detail?.message || failure?.detail || failure?.message || 'Something went wrong. Try again.') } finally { setBusy(false) }
  }

  const setUp = (trial: boolean) => run(async () => {
    if (!token || !state.role) throw new Error('Sign in first.')
    const result = await startApi.setUp({
      role: state.role, name: state.name.trim(), org_name: state.orgOn ? state.org.trim() : '',
      color: state.orgOn ? state.color : '', plan_uuids: state.picked, framework_uuid: framework?.framework_uuid || null, trial,
    }, token)
    const next: StartState = { ...state, space: result.org, trial }
    setState({ ...next, step: order(next)[order(next).indexOf('tier') + 1] })
  })

  /** Sends what's new on a people step, then moves on. */
  const finishStep = (kind: 'learners' | 'staff' | 'groups') => run(async () => {
    const space = state.space
    if (!space || !token) throw new Error('Your space isn’t ready yet. Go back a step and try again.')
    const items = { learners: state.learners, staff: state.staff, groups: state.groups }[kind].filter((item) => !state.sent.includes(`${kind}:${item}`))
    if (items.length) {
      if (kind === 'learners' || kind === 'staff') {
        const result = await inviteBatchUsers(space.id, { emails: items, role_id: kind === 'staff' ? 2 : 4, source: 'manual' }, token)
        if (!result.success) throw new Error(result.data?.detail?.message || result.data?.detail || 'Could not send the invites.')
      } else {
        for (const name of items) {
          const result = await createUserGroup({ org_id: space.id, name, description: '' }, token)
          if (!result.success) throw new Error(result.data?.detail || `Could not make ${name}.`)
        }
      }
    }
    setState((current) => ({ ...current, sent: [...current.sent, ...items.map((item) => `${kind}:${item}`)] }))
    move(1)
  })

  const open = () => {
    if (!state.space) return
    try { window.sessionStorage.removeItem(STORAGE_KEY) } catch { /* already gone */ }
    window.location.href = authenticatedOrgHref(getUriWithOrg(state.space.slug, routePaths.org.admin.root()), true)
  }

  const visual = (() => {
    const step = state.step
    if (step.startsWith('t') && step.length === 2) return <TourScene scene={Number(step[1])} />
    if (step === 'role' || step === 'done') return <RoleStage role={state.role} done={step === 'done'} spaceName={spaceName} />
    if (step === 'tier') return <TierCompare />
    return <div className="flex h-full items-center justify-center p-2 lg:p-6"><div className="h-full max-h-[560px] w-full">
      <SitePreview state={state} page={previewPage[step] || 'plans'} plans={plans} spaceName={spaceName} framework={framework} />
    </div></div>
  })()

  const tour = state.step.startsWith('t') && state.step.length === 2
  // Phones show the tour and the closing character in line; every other visual would push the
  // step below the fold, so the site preview opens from a pill instead and the rest stay hidden.
  const inline = tour || state.step === 'done'
  const preview = state.step in previewPage

  if (!restored) return null
  return <div className="flex min-h-screen flex-col bg-[#fbfaf7] text-foreground">
    <AdminSurface />
    <header className="flex min-h-[68px] items-center gap-4 px-6 py-3.5">
      <span className="flex items-center gap-2.5 text-[17px] font-extrabold"><img src="/images/start/l2l.webp" alt="" className="h-[30px] w-[30px] rounded-lg" />Life2Launch</span>
      <span className="ml-auto text-[13px] text-muted-foreground">
        {state.step.startsWith('t') && state.step.length === 2 ? <button type="button" className="font-bold text-foreground underline underline-offset-4" onClick={() => go('role')}>Skip intro</button>
          : signedIn ? null : <>Already have a space? <Link className="font-bold text-foreground underline underline-offset-4" href={routePaths.auth.login()}>Sign in</Link></>}
      </span>
    </header>
    <main className="mx-auto grid w-full max-w-[1340px] flex-1 grid-cols-1 content-start gap-6 px-5 pb-24 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:content-center lg:gap-10 lg:pb-6">
      <section className="order-2 flex w-full min-w-0 max-w-[460px] flex-col justify-self-center py-2 lg:order-1 lg:justify-center lg:py-5">
        <Dots steps={steps} current={state.step} />
        <AnimatePresence mode="wait">
          <motion.div key={state.step} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.25 }}>
            {renderLeft()}
            {error ? <p role="alert" className="mt-4 rounded-xl bg-red-50 px-3.5 py-2.5 text-sm font-semibold text-red-700 ring-1 ring-red-100">{error}</p> : null}
          </motion.div>
        </AnimatePresence>
      </section>
      <section className={cn('order-1 min-w-0 lg:order-2 lg:block lg:h-[calc(100vh-110px)] lg:max-h-[760px] lg:self-center', inline ? 'h-[340px] sm:h-[420px]' : 'hidden')}>{visual}</section>
    </main>
    {preview ? <PreviewSheet>{visual}</PreviewSheet> : null}
  </div>

  function renderLeft(): React.ReactNode {
    const step = state.step
    if (step.startsWith('t') && step.length === 2) {
      const index = Number(step[1])
      return <><h1 className={H1}>{TOUR[index].title}</h1><p className={LEDE}>{TOUR[index].lede}</p>
        <Nav back={index > 0 ? () => move(-1) : undefined} next={() => move(1)} label="Next" /></>
    }
    if (step === 'role') return <><Eyebrow>About you</Eyebrow><h1 className={H1}>What’s your role?</h1><p className={LEDE}>We’ll suggest plans that fit how you work.</p>
      <div role="radiogroup" aria-label="Your role" className="mt-6 space-y-2">
        {ROLE_IDS.map((id) => <button key={id} type="button" role="radio" aria-checked={state.role === id} onClick={() => patch({ role: id, picked: state.role === id ? state.picked : [], orgOn: state.role === id ? state.orgOn : !ROLES[id].solo })}
          className={cn('flex w-full items-center gap-3 rounded-2xl border bg-white px-3.5 py-3 text-left transition', state.role === id ? 'border-[var(--rc)] ring-2 ring-[var(--rc)]/25' : 'border-border hover:border-foreground/25')}
          style={{ ['--rc' as string]: ROLES[id].color }}>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white" style={{ background: ROLES[id].color }}>{ROLE_ICONS[id]}</span>
          <span className="min-w-0 flex-1"><b className="block text-[15px]">{ROLES[id].label}</b><span className="text-[13px] text-muted-foreground">{ROLES[id].blurb}</span></span>
          <span className={cn('flex h-5 w-5 items-center justify-center rounded-full border', state.role === id ? 'border-transparent bg-[var(--rc)] text-white' : 'border-border')}>{state.role === id ? <Check size={12} /> : null}</span>
        </button>)}
      </div>
      <Nav back={() => move(-1)} next={() => move(1)} disabled={!state.role} /></>
    if (step === 'reqs') return <><Eyebrow>Optional</Eyebrow><h1 className={H1}>Working toward requirements?</h1>
      <p className={LEDE}>Pick the standards or graduation requirements you report on. We’ll suggest plans that cover them and track who’s met what.</p>
      <div role="radiogroup" aria-label="Requirements to track" className="mt-6 space-y-2">{frameworks.length ? frameworks.map((item) => { const on = state.framework === item.framework_uuid; return <button key={item.framework_uuid} type="button" role="radio" aria-checked={on}
        onClick={() => patch({ framework: on ? null : item.framework_uuid })}
        className={cn('flex w-full items-center gap-3 rounded-2xl border bg-white p-2.5 text-left transition', on ? 'border-sky-600 ring-2 ring-sky-600/20' : 'border-border hover:border-foreground/25')}>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-700"><ListChecks size={18} /></span>
        <span className="min-w-0 flex-1"><b className="block truncate text-sm">{item.name}</b><span className="block truncate text-[12.5px] text-muted-foreground">{item.owner_org_name || 'Life2Launch'} · {item.requirement_count} {item.requirement_count === 1 ? 'requirement' : 'requirements'}</span></span>
        <span className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded-full border', on ? 'border-transparent bg-sky-600 text-white' : 'border-border')}>{on ? <Check size={12} /> : null}</span>
      </button> }) : <p className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground">No shared frameworks yet. You can add your own under Requirements once you’re in.</p>}</div>
      <Nav back={() => move(-1)} next={() => move(1)} label={framework ? 'Continue' : 'Skip for now'} /></>
    if (step === 'plans') return <><Eyebrow>Plans</Eyebrow><h1 className={H1}>Start with a few plans</h1>
      <p className={LEDE}>{framework ? `Picked from Discover, the ones covering the most of ${framework.name} first.` : `Picked from Discover for ${role?.audience}.`} Add as many as you like.</p>
      <div className="mt-6 space-y-2">
        {plans.length ? plans.map((plan) => { const on = state.picked.includes(plan.template_uuid); return <button key={plan.template_uuid} type="button" aria-pressed={on}
          onClick={() => patch({ picked: on ? state.picked.filter((uuid) => uuid !== plan.template_uuid) : [...state.picked, plan.template_uuid] })}
          className={cn('flex w-full items-center gap-3 rounded-2xl border bg-white p-2.5 text-left transition', on ? 'border-[#2F66D6] ring-2 ring-[#2F66D6]/20' : 'border-border hover:border-foreground/25')}>
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-700"><Layers3 size={18} /></span>
          <span className="min-w-0 flex-1"><b className="flex items-center gap-1.5 text-[14px]"><span className="truncate">{plan.title}</span>{plan.badge ? <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-amber-100 px-1.5 text-[10px] font-bold text-amber-800"><Award size={10} />Badge</span> : null}</b>
            <span className="block truncate text-[12.5px] text-muted-foreground">{plan.step_count} steps{plan.creator_org ? ` · ${plan.creator_org.name}` : ''}</span>
            {plan.requirement_count ? <CoverMeter covers={plan.covers || 0} of={plan.requirement_count} /> : null}</span>
          <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-full', on ? 'bg-[#2F66D6] text-white' : 'bg-muted')}>{on ? <Check size={14} /> : <Plus size={14} />}</span>
        </button> }) : <p className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground">No shared plans yet. You can build your own once you’re in.</p>}
        <p className="flex items-center gap-1.5 pt-1 text-[13px] text-muted-foreground"><Compass size={15} />More in <b className="text-foreground">Discover</b> once you’re in.</p>
      </div>
      <Nav back={() => move(-1)} next={() => move(1)} label={state.picked.length ? `Continue with ${state.picked.length}` : 'Skip for now'} /></>
    if (step === 'account') return signedIn
      ? <><Eyebrow>Account</Eyebrow><h1 className={H1}>You’re in</h1><p className={LEDE}>Your picks are saved. Next, make it look like yours.</p>
        <div className="mt-6 flex items-center gap-3 rounded-2xl border border-border bg-white p-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-600 text-white"><Check size={16} /></span>
          <span className="min-w-0"><b className="block text-sm">Signed in</b><span className="block truncate text-[13px] text-muted-foreground">{user?.email}</span></span>
        </div>
        <Nav back={() => move(-1)} next={() => move(1)} /></>
      : <AccountForm org={org} busy={busy} setBusy={setBusy} setError={setError} signIn={signIn} back={() => move(-1)} onGoogle={() => patch({ step: 'account' })} />
    if (step === 'you') return <><Eyebrow>Your space</Eyebrow><h1 className={H1}>Make it yours</h1><p className={LEDE}>This is what people see when you invite them.</p>
      <div className="mt-6 space-y-4">
        <Field label="Your name"><input className={INPUT} autoComplete="name" placeholder="First and last" value={state.name} onChange={(event) => patch({ name: event.target.value })} /></Field>
        <button type="button" role="switch" aria-checked={state.orgOn} onClick={() => patch({ orgOn: !state.orgOn })} className="flex w-full items-center gap-3 rounded-2xl border border-border bg-white p-3 text-left">
          <span className="min-w-0 flex-1"><b className="block text-sm">This is for an organization</b><span className="text-[13px] text-muted-foreground">A school, program or business</span></span>
          <span className={cn('relative h-6 w-10 rounded-full transition', state.orgOn ? 'bg-[#2F66D6]' : 'bg-muted')}><i className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all', state.orgOn ? 'left-[18px]' : 'left-0.5')} /></span>
        </button>
        {state.orgOn ? <div className="space-y-4 rounded-2xl bg-white p-3.5 ring-1 ring-border">
          <Field label="Organization name"><input className={INPUT} placeholder="Riverside Learning Co-op" value={state.org} onChange={(event) => patch({ org: event.target.value })} /></Field>
          <Field label="Color"><div className="flex flex-wrap gap-2">{PALETTE.map(([name, color]) => <button key={color} type="button" aria-label={name} aria-pressed={state.color === color} onClick={() => patch({ color })}
            className={cn('h-8 w-8 rounded-full ring-offset-2 transition', state.color === color ? 'ring-2 ring-foreground' : '')} style={{ background: color }} />)}</div></Field>
          <p className="text-[12.5px] text-muted-foreground">Add your logo from Settings once you’re in.</p>
        </div> : null}
      </div>
      <Nav back={() => move(-1)} next={() => move(1)} disabled={state.orgOn && !state.org.trim()} label={state.name || state.orgOn ? 'Continue' : 'Skip for now'} /></>
    if (step === 'tier') return <><Eyebrow>Optional</Eyebrow><h1 className={H1}>{role?.solo && !state.orgOn ? 'Working with a bigger group?' : 'Running something bigger?'}</h1>
      <p className={LEDE}>Full adds groups, more staff and bulk invites. Try it free for 30 days, or keep going on Free. You can switch anytime.</p>
      <div className="mt-7 grid grid-cols-2 gap-2.5">
        <Button variant="outline" size="lg" className="rounded-full" disabled={busy} onClick={() => void setUp(false)}>{busy && state.trial !== true ? <Loader2 className="animate-spin" /> : null}Continue with Free</Button>
        <Button size="lg" className="rounded-full bg-violet-600 hover:bg-violet-700" disabled={busy} onClick={() => void setUp(true)}><Sparkles />Try Full free</Button>
      </div>
      {state.space ? <p className="mt-3 text-[12.5px] text-muted-foreground">{state.space.name} is ready. Picking again only changes the trial.</p> : null}
      <Nav back={() => move(-1)} /></>
    if (step === 'learners' || step === 'staff') {
      const staff = step === 'staff'
      const list = staff ? state.staff : state.learners
      return <><Eyebrow>{staff ? 'Your team' : 'People'}</Eyebrow><h1 className={H1}>{staff ? 'Add your staff' : `Add your first ${role?.plural || 'learners'}`}</h1>
        <p className={LEDE}>{staff ? 'Counselors, volunteers or co-leaders. They can run assignments and review work, and you can change that per person later.' : 'Optional. Add a couple now and we’ll email them an invite.'}</p>
        <AddList key={step} placeholder={staff ? 'colleague@school.org' : 'name@example.com'} items={list} email onChange={(items) => patch(staff ? { staff: items } : { learners: items })}
          hint={staff ? 'Full includes 12 staff seats. You’re using 1.' : 'Rather share a link? You’ll find a join link on the People page.'} />
        <Nav back={() => move(-1)} next={() => void finishStep(step)} busy={busy} label={list.some((item) => !state.sent.includes(`${step}:${item}`)) ? 'Send invites' : list.length ? 'Continue' : 'Skip for now'} /></>
    }
    if (step === 'groups') {
      const suggestions = groupSuggestions()
      return <><Eyebrow>Your team</Eyebrow><h1 className={H1}>Set up your groups</h1><p className={LEDE}>Cohorts, classes or teams. Hand a plan to a whole group at once. Learners can join later.</p>
        <AddList placeholder="Name a group" items={state.groups} onChange={(groups) => patch({ groups })} chips={suggestions} />
        <Nav back={() => move(-1)} next={() => void finishStep('groups')} busy={busy} label={state.groups.length ? 'Continue' : 'Skip for now'} /></>
    }
    return <><Eyebrow>All set</Eyebrow><h1 className={H1}>You’re all set{state.name.trim() ? `, ${state.name.trim().split(' ')[0]}` : ''}</h1>
      <p className={LEDE}>{spaceName} is ready. Your Home page has what to do next.</p>
      <Nav back={() => move(-1)} next={open} label="Let’s go" /></>
  }
}

const INPUT = 'h-11 w-full rounded-xl border border-border bg-white px-3 text-[15px] outline-none transition placeholder:text-muted-foreground/70 focus:border-foreground/40'

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <div className="mb-2.5 text-[12px] font-bold uppercase tracking-[0.08em] text-muted-foreground">{children}</div>
}

/** How much of the picked framework a plan counts toward. */
function CoverMeter({ covers, of }: { covers: number; of: number }) {
  return <span className="mt-1.5 flex items-center gap-2" data-testid="start-plan-covers">
    <span className="h-1.5 w-20 overflow-hidden rounded-full bg-muted"><i className="block h-full rounded-full bg-sky-600" style={{ width: `${Math.round((covers / of) * 100)}%` }} /></span>
    <span className="text-[11.5px] font-semibold text-muted-foreground">{covers ? `Covers ${covers} of ${of}` : 'Covers none yet'}</span>
  </span>
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1.5 block text-[13px] font-semibold">{label}</span>{children}</label>
}

function Nav({ back, next, label = 'Continue', disabled = false, busy = false }: { back?: () => void; next?: () => void; label?: string; disabled?: boolean; busy?: boolean }) {
  return <div className="mt-8 flex items-center justify-between gap-3">
    {back ? <Button variant="ghost" className="rounded-full" onClick={back} disabled={busy}><ArrowLeft />Back</Button> : <span />}
    {next ? <Button size="lg" className="rounded-full" onClick={next} disabled={disabled || busy}>{busy ? <Loader2 className="animate-spin" /> : null}{label}<ArrowRight /></Button> : null}
  </div>
}

/** One persistent row: the current step is a pill, three on each side show, the rest collapse. */
function Dots({ steps, current }: { steps: Step[]; current: Step }) {
  const at = steps.indexOf(current)
  return <div className="mb-6 flex h-2.5 items-center" aria-label={`Step ${at + 1} of ${steps.length}`}>
    {steps.map((step, index) => { const distance = Math.abs(index - at); return <motion.i key={step} className="block shrink-0 rounded-full"
      animate={{ width: distance > 3 ? 0 : index === at ? 30 : 8, marginRight: distance > 3 ? 0 : 6, opacity: distance > 3 ? 0 : distance === 3 ? 0.6 : 1, scale: distance === 3 ? 0.6 : 1,
        backgroundColor: index === at ? 'hsl(var(--foreground))' : index < at ? 'hsl(var(--foreground) / 0.4)' : 'hsl(var(--foreground) / 0.18)' }} style={{ height: 8 }} transition={{ type: 'spring', stiffness: 300, damping: 30 }} /> })}
  </div>
}

function RoleStage({ role, done, spaceName }: { role: StartRole | null; done: boolean; spaceName: string }) {
  const config = role ? ROLES[role] : null
  return <div className="relative flex h-full flex-col items-center justify-center overflow-hidden rounded-[28px]" style={{ background: config ? `radial-gradient(circle at 50% 45%, ${config.color}33, transparent 65%)` : undefined }}>
    {done ? <div className="pointer-events-none absolute inset-0 flex items-center justify-center">{[0, 1, 2].map((ring) => <motion.i key={ring} className="absolute rounded-full border-2" style={{ borderColor: config?.color || '#2F66D6', width: 220, height: 220 }}
      animate={{ scale: [0.8, 2.2], opacity: [0.5, 0] }} transition={{ duration: 2.4, repeat: Infinity, delay: ring * 0.8 }} />)}</div> : null}
    <AnimatePresence mode="wait">
      {role ? <motion.div key={role} initial={{ scale: 0.4, opacity: 0, y: 30 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.6, opacity: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 18 }}>
        <Critter role={role} cheer={done} className="h-44 w-60 sm:h-64 sm:w-[22rem]" />
      </motion.div> : <motion.div key="unknown" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, scale: 0.5 }} className="flex h-40 w-40 items-center justify-center rounded-full bg-muted text-7xl font-black text-muted-foreground/50">?</motion.div>}
    </AnimatePresence>
    <motion.div key={`${role}-${done}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
      className="relative mt-4 max-w-sm rounded-2xl bg-white px-4 py-3 text-center text-[14px] text-muted-foreground shadow-lg ring-1 ring-black/5">
      {done ? <><b className="block text-[15px] text-foreground">Let’s launch some futures</b>{spaceName} is live.</>
        : config ? <><b className="block text-[15px] text-foreground">{config.say[0]}</b>{config.say[1]}</> : 'Pick the one that fits best.'}
    </motion.div>
  </div>
}

function AddList({ items, onChange, placeholder, email = false, hint, chips = [] }: {
  items: string[]; onChange: React.Dispatch<string[]>; placeholder: string; email?: boolean; hint?: string; chips?: string[]
}) {
  const [draft, setDraft] = React.useState('')
  const [problem, setProblem] = React.useState('')
  const add = () => {
    const values = draft.split(/[,;\s]+/).map((value) => value.trim()).filter(Boolean)
    const entries = email ? values : [draft.trim()].filter(Boolean)
    if (!entries.length) return
    if (email && entries.some((value) => !EMAIL.test(value))) return setProblem('That doesn’t look like an email address.')
    onChange([...items, ...entries.filter((value) => !items.includes(value))])
    setDraft('')
    setProblem('')
  }
  const toggle = (value: string) => onChange(items.includes(value) ? items.filter((item) => item !== value) : [...items, value])
  return <div className="mt-6 space-y-3">
    <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); add() }}>
      <input className={INPUT} inputMode={email ? 'email' : undefined} placeholder={placeholder} value={draft} onChange={(event) => setDraft(event.target.value)} />
      <Button type="submit" variant="outline" className="h-11 rounded-xl">Add</Button>
    </form>
    {problem ? <p className="text-[13px] font-semibold text-red-600">{problem}</p> : null}
    {chips.length ? <div className="flex flex-wrap gap-2">{[...chips, ...items.filter((item) => !chips.includes(item))].map((chip) => { const on = items.includes(chip); return <button key={chip} type="button" onClick={() => toggle(chip)}
      className={cn('inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-[13px] font-semibold', on ? 'border-foreground bg-foreground text-background' : 'border-border bg-white')}>{on ? <Check size={13} /> : <Plus size={13} />}{chip}</button> })}</div>
      : items.length ? <div className="space-y-1.5">{items.map((item) => <div key={item} className="flex items-center gap-2 rounded-xl border border-border bg-white px-3 py-2 text-sm">
        <span className="min-w-0 flex-1 truncate">{item}</span><button type="button" aria-label={`Remove ${item}`} onClick={() => toggle(item)} className="text-muted-foreground hover:text-foreground"><X size={15} /></button></div>)}</div>
        : hint ? <p className="text-[13px] text-muted-foreground">{hint}</p> : null}
  </div>
}

/** Create an account, or sign in to one, without leaving the flow. Google comes back to /start. */
function AccountForm({ org, busy, setBusy, setError, signIn, back, onGoogle }: {
  org: any; busy: boolean; setBusy: React.Dispatch<boolean>; setError: React.Dispatch<string>; signIn: ReturnType<typeof useAuth>['signIn']; back: () => void; onGoogle: () => void
}) {
  const [existing, setExisting] = React.useState(false)
  const [email, setEmail] = React.useState('')
  const [password, setPassword] = React.useState('')
  const age = useAgeConfirm()
  const strong = validatePasswordStrength(password).isValid
  const ready = EMAIL.test(email.trim()) && (existing ? password.length > 0 : strong)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!existing && !age.ok()) return
    setBusy(true)
    setError('')
    try {
      if (!existing) {
        const response = await signup({ username: usernameFrom(email), email: email.trim(), password, org_slug: org?.slug, org_id: org?.id })
        if (response.status !== 200) {
          const body = await response.json().catch(() => null)
          throw new Error(typeof body?.detail === 'string' ? body.detail : body?.detail?.message || 'Could not create the account.')
        }
      }
      const result = await signIn('credentials', { redirect: false, email: email.trim(), password })
      if (result && result.error) throw new Error(existing ? 'That email and password don’t match.' : result.error)
      // Signing in clears every cached request, the org's included, so start the page over signed in; the picks are kept.
      window.location.reload()
    } catch (failure: any) {
      setError(failure?.message || 'Something went wrong. Try again.')
    } finally {
      setBusy(false)
    }
  }
  const google = async () => {
    if (!existing && !age.ok()) return
    onGoogle()
    const result = await signIn('google', { callbackUrl: `${window.location.origin}/start`, orgSlug: org?.slug, orgId: org?.id } as any)
    if (result && 'error' in result && result.error) setError(result.error)
  }

  return <><Eyebrow>Account</Eyebrow><h1 className={H1}>{existing ? 'Sign in to save this' : 'Save your space'}</h1>
    <p className={LEDE}>{existing ? 'We’ll add what you’ve picked to your account.' : 'Create an account so your plans are here when you come back.'}</p>
    <form className="mt-6 space-y-3.5" onSubmit={(event) => void submit(event)}>
      {existing ? null : <AgeConfirm {...age.field} />}
      <Button type="button" variant="outline" size="lg" className="w-full rounded-full" onClick={() => void google()}><SiGoogle size={18} color="#4285F4" />Continue with Google</Button>
      <div className="flex items-center gap-3 text-[13px] font-semibold text-muted-foreground"><i className="h-px flex-1 bg-border" />or<i className="h-px flex-1 bg-border" /></div>
      <Field label="Email"><input className={INPUT} type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(event) => setEmail(event.target.value)} /></Field>
      <Field label="Password"><input className={INPUT} type="password" autoComplete={existing ? 'current-password' : 'new-password'} placeholder={existing ? '' : 'At least 8 characters, with a number and a symbol'} value={password} onChange={(event) => setPassword(event.target.value)} /></Field>
      {!existing && password && !strong ? <p className="text-[12.5px] text-muted-foreground">Use at least 8 characters with upper and lower case, a number and a symbol.</p> : null}
      <Button type="submit" size="lg" className="w-full rounded-full" disabled={!ready || busy}>{busy ? <Loader2 className="animate-spin" /> : null}{existing ? 'Sign in' : 'Create account'}</Button>
      <p className="text-center text-[13px] text-muted-foreground">{existing ? 'New here?' : 'Already have an account?'} <button type="button" className="font-bold text-foreground underline underline-offset-4" onClick={() => { setExisting(!existing); setError('') }}>{existing ? 'Create one instead' : 'Sign in instead'}</button></p>
    </form>
    <Nav back={back} /></>
}

/** Phones: the site preview behind a "See your space" pill, opened as a sheet over the step. */
function PreviewSheet({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false)
  return <div className="lg:hidden">
    <button type="button" onClick={() => setOpen(true)} className="fixed bottom-5 left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 rounded-full bg-white py-2 pl-2 pr-4 text-[14px] font-bold shadow-[0_10px_30px_rgba(15,23,42,0.18)] ring-1 ring-black/5">
      <span className="h-6 w-6 rounded-full bg-[#2F66D6]" />See your space
    </button>
    <AnimatePresence>
      {open ? <motion.div key="sheet" role="dialog" aria-modal="true" aria-label="Your space" className="fixed inset-0 z-40 flex flex-col bg-background/95 p-4 backdrop-blur"
        initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 24 }} transition={{ duration: 0.25 }}>
        <div className="mb-3 flex items-center justify-between"><b className="text-[15px]">Your space so far</b>
          <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="flex h-9 w-9 items-center justify-center rounded-full bg-white shadow ring-1 ring-black/5"><X size={16} /></button></div>
        <div className="min-h-0 flex-1">{children}</div>
      </motion.div> : null}
    </AnimatePresence>
  </div>
}
