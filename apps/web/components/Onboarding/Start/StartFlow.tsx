'use client'

import React from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { AnimatePresence, motion } from 'motion/react'
import { SiGoogle } from '@icons-pack/react-simple-icons'
import { useGoogleSignIn } from '@services/auth/google'
import { ArrowLeft, ArrowRight, Award, Building2, Check, Compass, GraduationCap, HardHat, Heart, Layers3, ListChecks, Loader2, Megaphone, Plus, Sparkles, X } from 'lucide-react'
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
import PlanningForMyself from './PlanningForMyself'
import SitePreview, { type PreviewPage } from './SitePreview'
import TierCompare from './TierCompare'
import TourScene from './TourScene'
import { H1, LEDE, TOUR } from './tour'
import { PALETTE, ROLES, ROLE_IDS, groupSuggestions, type StartRole } from './roles'

import { tr } from '@/lib/tr'
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
  parent: <Heart size={18} />, mentor: <Compass size={18} />, teacher: <GraduationCap size={18} />, program: <Megaphone size={18} />, training: <HardHat size={18} />, district: <Building2 size={18} />,
}
const EMAIL = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i
// During the beta every new space is on Full, so there's no plans pick or tier step: the space is made
// when they leave "Make it yours", then staff and groups. The 'plans' and 'tier' steps stay for after it.
const order = (): Step[] => ['t0', 't1', 't2', 't3', 'role', 'reqs', 'account', 'you', 'staff', 'groups', 'done']
const previewPage: Partial<Record<Step, PreviewPage>> = { reqs: 'requirements', plans: 'plans', account: 'plans', you: 'invite', learners: 'people', staff: 'people', groups: 'groups' }
// The username is the public portfolio link (/user/<username>), so it never comes from the email:
// many learners are minors, and an email often holds a full name or a school ID.
const newUsername = () => `learner${Array.from(crypto.getRandomValues(new Uint32Array(2))).map((n) => n.toString(36)).join('').slice(0, 10)}`

/**
 * Getting started: a short tour, then the role, an optional requirement framework and account, then making
 * the space theirs and the people in it. The space itself is made once, when they leave "Make it yours",
 * from everything picked so far (on Full during the beta).
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
      if (saved) {
        const restoredState: StartState = { ...fresh(), ...JSON.parse(saved) }
        // A step from an older version of this flow starts them at the role again.
        setState(order().includes(restoredState.step) ? restoredState : { ...restoredState, step: 'role' })
      }
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
  const steps = order()
  const go = (step: Step) => { setError(''); patch({ step }) }
  const move = (direction: number) => go(steps[Math.max(0, Math.min(steps.length - 1, steps.indexOf(state.step) + direction))])
  const role = state.role ? ROLES[state.role] : null
  const spaceName = state.space?.name || (state.orgOn ? state.org.trim() || tr('lit.start_flow.your_organization', 'Your organization') : state.name.trim() ? `${state.name.trim().split(' ')[0]}’s space` : tr('lit.start_flow.your_space', 'Your space'))

  const { data: frameworks = [] } = useSWR(startKeys.frameworks(), async () => { try { return await startApi.frameworks() } catch { return [] } }, { revalidateOnFocus: false })
  const framework = frameworks.find((item) => item.framework_uuid === state.framework) || null
  const { data: plans = [] } = useSWR(state.role ? startKeys.suggested(state.role, framework?.framework_uuid) : null, () => startApi.suggested(state.role as StartRole, framework?.framework_uuid))

  const run = async (work: () => Promise<void>) => {
    setBusy(true)
    setError('')
    try { await work() } catch (failure: any) { setError(failure?.detail?.message || failure?.detail || failure?.message || `${tr('lit.start_flow.something_went_wrong_try_again', 'Something went wrong. Try again.')}${failure?.status ? ` (${failure.status})` : ''}`) } finally { setBusy(false) }
  }

  const setUp = (trial: boolean) => run(async () => {
    if (!token || !state.role) throw new Error(tr('lit.start_flow.sign_in_first', 'Sign in first.'))
    const result = await startApi.setUp({
      role: state.role, name: state.name.trim(), org_name: state.orgOn ? state.org.trim() : '',
      color: state.orgOn ? state.color : '', plan_uuids: state.picked, framework_uuid: framework?.framework_uuid || null, trial,
    }, token)
    const next: StartState = { ...state, space: result.org, trial }
    setState({ ...next, step: order()[order().indexOf('you') + 1] })
  })

  /** Sends what's new on a people step, then moves on. */
  const finishStep = (kind: 'learners' | 'staff' | 'groups') => run(async () => {
    const space = state.space
    if (!space || !token) throw new Error(tr('lit.start_flow.your_space_isn_t_ready', 'Your space isn’t ready yet. Go back a step and try again.'))
    const items = { learners: state.learners, staff: state.staff, groups: state.groups }[kind].filter((item) => !state.sent.includes(`${kind}:${item}`))
    if (items.length) {
      if (kind === 'learners' || kind === 'staff') {
        const result = await inviteBatchUsers(space.id, { emails: items, role_id: kind === 'staff' ? 2 : 4, source: 'manual' }, token)
        if (!result.success) throw new Error(result.data?.detail?.message || result.data?.detail || tr('lit.start_flow.could_not_send_the_invites', 'Could not send the invites.'))
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
      <span className="flex items-center gap-2.5 text-[17px] font-extrabold"><img src="/images/start/l2l.webp" alt="" className="h-[30px] w-[30px] rounded-lg" />{tr('onboarding.start_flow.life2launch', 'Life2Launch')}</span>
      <span className="ml-auto text-[13px] text-muted-foreground">
        {state.step.startsWith('t') && state.step.length === 2 ? <button type="button" className="font-bold text-foreground underline underline-offset-4" onClick={() => go('role')}>{tr('onboarding.joined_flow.skip_intro', 'Skip intro')}</button>
          : signedIn ? null : <>{tr('onboarding.start_flow.already_have_a_space', 'Already have a space?')}{' '}<Link className="font-bold text-foreground underline underline-offset-4" href={routePaths.auth.login()}>{tr('onboarding.start_flow.sign_in', 'Sign in')}</Link></>}
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
        <Nav back={index > 0 ? () => move(-1) : undefined} next={() => move(1)} label={tr('onboarding.joined_flow.next', 'Next')} /></>
    }
    if (step === 'role') return <><Eyebrow>{tr('onboarding.start_flow.about_you', 'About you')}</Eyebrow><h1 className={H1}>{tr('onboarding.start_flow.what_s_your_role', 'What’s your role?')}</h1><p className={LEDE}>{tr('onboarding.start_flow.we_ll_set_up_your', 'We’ll set up your space to fit how you work.')}</p>
      <div role="radiogroup" aria-label={tr('onboarding.start_flow.your_role', 'Your role')} className="mt-6 space-y-2">
        {ROLE_IDS.map((id) => <button key={id} type="button" role="radio" aria-checked={state.role === id} onClick={() => patch({ role: id, picked: state.role === id ? state.picked : [], orgOn: state.role === id ? state.orgOn : !ROLES[id].solo })}
          className={cn('flex w-full items-center gap-3 rounded-2xl border bg-white px-3.5 py-3 text-left transition', state.role === id ? 'border-[var(--rc)] ring-2 ring-[var(--rc)]/25' : 'border-border hover:border-foreground/25')}
          style={{ ['--rc' as string]: ROLES[id].color }}>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white" style={{ background: ROLES[id].color }}>{ROLE_ICONS[id]}</span>
          <span className="min-w-0 flex-1"><b className="block text-[15px]">{ROLES[id].label}</b><span className="text-[13px] text-muted-foreground">{ROLES[id].blurb}</span></span>
          <span className={cn('flex h-5 w-5 items-center justify-center rounded-full border', state.role === id ? 'border-transparent bg-[var(--rc)] text-white' : 'border-border')}>{state.role === id ? <Check size={12} /> : null}</span>
        </button>)}
      </div>
      <Nav back={() => move(-1)} next={() => move(1)} disabled={!state.role} />
      <PlanningForMyself /></>
    if (step === 'reqs') return <><Eyebrow>{tr('onboarding.start_flow.optional', 'Optional')}</Eyebrow><h1 className={H1}>{tr('onboarding.start_flow.working_toward_requirements', 'Working toward requirements?')}</h1>
      <p className={LEDE}>{tr('onboarding.start_flow.pick_the_standards_or_graduation', 'Pick the standards or graduation requirements you report on. We’ll track who’s met what.')}</p>
      <div role="radiogroup" aria-label={tr('onboarding.start_flow.requirements_to_track', 'Requirements to track')} className="mt-6 space-y-2">{frameworks.length ? frameworks.map((item) => { const on = state.framework === item.framework_uuid; return <button key={item.framework_uuid} type="button" role="radio" aria-checked={on}
        onClick={() => patch({ framework: on ? null : item.framework_uuid })}
        className={cn('flex w-full items-center gap-3 rounded-2xl border bg-white p-2.5 text-left transition', on ? 'border-sky-600 ring-2 ring-sky-600/20' : 'border-border hover:border-foreground/25')}>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-700"><ListChecks size={18} /></span>
        <span className="min-w-0 flex-1"><b className="block truncate text-sm">{item.name}</b><span className="block truncate text-[12.5px] text-muted-foreground">{item.owner_org_name || tr('onboarding.start_flow.life2launch', 'Life2Launch')} · {item.requirement_count} {item.requirement_count === 1 ? 'requirement' : 'requirements'}</span></span>
        <span className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded-full border', on ? 'border-transparent bg-sky-600 text-white' : 'border-border')}>{on ? <Check size={12} /> : null}</span>
      </button> }) : <p className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground">{tr('onboarding.start_flow.no_shared_frameworks_yet_you', 'No shared frameworks yet. You can add your own under Requirements once you’re in.')}</p>}</div>
      <Nav back={() => move(-1)} next={() => move(1)} label={framework ? tr('onboarding.joined_flow.continue', 'Continue') : tr('onboarding.start_flow.skip_for_now', 'Skip for now')} /></>
    if (step === 'plans') return <><Eyebrow>{tr('onboarding.site_preview.plans', 'Plans')}</Eyebrow><h1 className={H1}>{tr('onboarding.start_flow.start_with_a_few_plans', 'Start with a few plans')}</h1>
      <p className={LEDE}>{framework ? tr('onboarding.start_flow.picked_from_discover_the_ones', 'Picked from Discover, the ones covering the most of {{name}} first.', { name: framework.name }) : tr('onboarding.start_flow.picked_from_discover_for_audience', 'Picked from Discover for {{audience}}.', { audience: role?.audience })}{' '}{tr('onboarding.start_flow.add_as_many_as_you', 'Add as many as you like.')}</p>
      <div className="mt-6 space-y-2">
        {plans.length ? plans.map((plan) => { const on = state.picked.includes(plan.template_uuid); return <button key={plan.template_uuid} type="button" aria-pressed={on}
          onClick={() => patch({ picked: on ? state.picked.filter((uuid) => uuid !== plan.template_uuid) : [...state.picked, plan.template_uuid] })}
          className={cn('flex w-full items-center gap-3 rounded-2xl border bg-white p-2.5 text-left transition', on ? 'border-[#2F66D6] ring-2 ring-[#2F66D6]/20' : 'border-border hover:border-foreground/25')}>
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-700"><Layers3 size={18} /></span>
          <span className="min-w-0 flex-1"><b className="flex items-center gap-1.5 text-[14px]"><span className="truncate">{plan.title}</span>{plan.badge ? <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-amber-100 px-1.5 text-[10px] font-bold text-amber-800"><Award size={10} />{tr('onboarding.start_flow.badge', 'Badge')}</span> : null}</b>
            <span className="block truncate text-[12.5px] text-muted-foreground">{tr('onboarding.site_preview.step_count_steps', '{{step_count}} steps', { step_count: plan.step_count })}{plan.creator_org ? ` · ${plan.creator_org.name}` : ''}</span>
            {plan.requirement_count ? <CoverMeter covers={plan.covers || 0} of={plan.requirement_count} /> : null}</span>
          <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-full', on ? 'bg-[#2F66D6] text-white' : 'bg-muted')}>{on ? <Check size={14} /> : <Plus size={14} />}</span>
        </button> }) : <p className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground">{tr('onboarding.start_flow.no_shared_plans_yet_you', 'No shared plans yet. You can build your own once you’re in.')}</p>}
        <p className="flex items-center gap-1.5 pt-1 text-[13px] text-muted-foreground"><Compass size={15} />{tr('onboarding.start_flow.more_in', 'More in')}{' '}<b className="text-foreground">{tr('onboarding.start_flow.discover', 'Discover')}</b>{' '}{tr('onboarding.start_flow.once_you_re_in', 'once you’re in.')}</p>
      </div>
      <Nav back={() => move(-1)} next={() => move(1)} label={state.picked.length ? tr('onboarding.start_flow.continue_with_length', 'Continue with {{length}}', { length: state.picked.length }) : tr('onboarding.start_flow.skip_for_now', 'Skip for now')} /></>
    if (step === 'account') return signedIn
      ? <><Eyebrow>{tr('onboarding.start_flow.account', 'Account')}</Eyebrow><h1 className={H1}>{tr('onboarding.joined_flow.you_re_in', 'You’re in')}</h1><p className={LEDE}>{tr('onboarding.start_flow.your_picks_are_saved_next', 'Your picks are saved. Next, make it look like yours.')}</p>
        <div className="mt-6 flex items-center gap-3 rounded-2xl border border-border bg-white p-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-600 text-white"><Check size={16} /></span>
          <span className="min-w-0"><b className="block text-sm">{tr('onboarding.start_flow.signed_in', 'Signed in')}</b><span className="block truncate text-[13px] text-muted-foreground">{user?.email}</span></span>
        </div>
        <Nav back={() => move(-1)} next={() => move(1)} /></>
      : <AccountForm org={org} busy={busy} setBusy={setBusy} setError={setError} signIn={signIn} back={() => move(-1)} onGoogle={() => patch({ step: 'account' })} />
    if (step === 'you') return <><Eyebrow>{tr('onboarding.start_flow.your_space', 'Your space')}</Eyebrow><h1 className={H1}>{tr('onboarding.start_flow.make_it_yours', 'Make it yours')}</h1><p className={LEDE}>{tr('onboarding.start_flow.this_is_what_people_see', 'This is what people see when you invite them.')}</p>
      <div className="mt-6 space-y-4">
        <Field label={tr('onboarding.start_flow.your_name', 'Your name')}><input className={INPUT} autoComplete="name" placeholder={tr('onboarding.start_flow.first_and_last', 'First and last')} value={state.name} onChange={(event) => patch({ name: event.target.value })} /></Field>
        <button type="button" role="switch" aria-checked={state.orgOn} onClick={() => patch({ orgOn: !state.orgOn })} className="flex w-full items-center gap-3 rounded-2xl border border-border bg-white p-3 text-left">
          <span className="min-w-0 flex-1"><b className="block text-sm">{tr('onboarding.start_flow.this_is_for_an_organization', 'This is for an organization')}</b><span className="text-[13px] text-muted-foreground">{tr('onboarding.start_flow.a_school_program_or_business', 'A school, program or business')}</span></span>
          <span className={cn('relative h-6 w-10 rounded-full transition', state.orgOn ? 'bg-[#2F66D6]' : 'bg-muted')}><i className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all', state.orgOn ? 'left-[18px]' : 'left-0.5')} /></span>
        </button>
        {state.orgOn ? <div className="space-y-4 rounded-2xl bg-white p-3.5 ring-1 ring-border">
          <Field label={tr('onboarding.start_flow.organization_name', 'Organization name')}><input className={INPUT} placeholder={tr('onboarding.start_flow.riverside_learning_co_op', 'Riverside Learning Co-op')} value={state.org} onChange={(event) => patch({ org: event.target.value })} /></Field>
          <Field label={tr('onboarding.start_flow.color', 'Color')}><div className="flex flex-wrap gap-2">{PALETTE.map(([name, color]) => <button key={color} type="button" aria-label={name} aria-pressed={state.color === color} onClick={() => patch({ color })}
            className={cn('h-8 w-8 rounded-full ring-offset-2 transition', state.color === color ? 'ring-2 ring-foreground' : '')} style={{ background: color }} />)}</div></Field>
          <p className="text-[12.5px] text-muted-foreground">{tr('onboarding.start_flow.add_your_logo_from_settings', 'Add your logo from Settings once you’re in.')}</p>
        </div> : null}
      </div>
      <Nav back={() => move(-1)} next={() => void setUp(false)} busy={busy} disabled={state.orgOn && !state.org.trim()} label={state.name || state.orgOn ? tr('onboarding.joined_flow.continue', 'Continue') : tr('onboarding.start_flow.skip_for_now', 'Skip for now')} /></>
    if (step === 'tier') return <><Eyebrow>{tr('onboarding.start_flow.optional', 'Optional')}</Eyebrow><h1 className={H1}>{role?.solo && !state.orgOn ? tr('onboarding.start_flow.working_with_a_bigger_group', 'Working with a bigger group?') : tr('onboarding.start_flow.running_something_bigger', 'Running something bigger?')}</h1>
      <p className={LEDE}>{tr('onboarding.start_flow.full_adds_groups_more_staff', 'Full adds groups, more staff and bulk invites. Try it free for 30 days, or keep going on Free. You can switch anytime.')}</p>
      <div className="mt-7 grid grid-cols-2 gap-2.5">
        <Button variant="outline" size="lg" className="rounded-full" disabled={busy} onClick={() => void setUp(false)}>{busy && state.trial !== true ? <Loader2 className="animate-spin" /> : null}{tr('onboarding.start_flow.continue_with_free', 'Continue with Free')}</Button>
        <Button size="lg" className="rounded-full bg-violet-600 hover:bg-violet-700" disabled={busy} onClick={() => void setUp(true)}><Sparkles />{tr('onboarding.start_flow.try_full_free', 'Try Full free')}</Button>
      </div>
      {state.space ? <p className="mt-3 text-[12.5px] text-muted-foreground">{tr('onboarding.start_flow.name_is_ready_picking_again', '{{name}} is ready. Picking again only changes the trial.', { name: state.space.name })}</p> : null}
      <Nav back={() => move(-1)} /></>
    if (step === 'learners' || step === 'staff') {
      const staff = step === 'staff'
      const list = staff ? state.staff : state.learners
      return <><Eyebrow>{staff ? tr('onboarding.start_flow.your_team', 'Your team') : tr('onboarding.site_preview.people', 'People')}</Eyebrow><h1 className={H1}>{staff ? tr('onboarding.start_flow.add_your_staff', 'Add your staff') : tr('onboarding.start_flow.add_your_first_value', 'Add your first {{value}}', { value: role?.plural || tr('onboarding.start_flow.v_learners', 'learners') })}</h1>
        <p className={LEDE}>{staff ? tr('onboarding.start_flow.counselors_volunteers_or_co_leaders', 'Counselors, volunteers or co-leaders. They can run assignments and review work, and you can change that per person later.') : tr('onboarding.start_flow.optional_add_a_couple_now', 'Optional. Add a couple now and we’ll email them an invite.')}</p>
        <AddList key={step} placeholder={staff ? tr('onboarding.start_flow.colleague_school_org', 'colleague@school.org') : tr('onboarding.start_flow.name_example_com', 'name@example.com')} items={list} email onChange={(items) => patch(staff ? { staff: items } : { learners: items })}
          hint={staff ? tr('onboarding.start_flow.full_includes_12_staff_seats', 'Full includes 12 staff seats. You’re using 1.') : tr('onboarding.start_flow.rather_share_a_link_you', 'Rather share a link? You’ll find a join link on the People page.')} />
        <Nav back={() => move(-1)} next={() => void finishStep(step)} busy={busy} label={list.some((item) => !state.sent.includes(`${step}:${item}`)) ? tr('onboarding.start_flow.send_invites', 'Send invites') : list.length ? tr('onboarding.joined_flow.continue', 'Continue') : tr('onboarding.start_flow.skip_for_now', 'Skip for now')} /></>
    }
    if (step === 'groups') {
      const suggestions = groupSuggestions(new Date(), state.role)
      return <><Eyebrow>{tr('onboarding.start_flow.your_team', 'Your team')}</Eyebrow><h1 className={H1}>{tr('onboarding.start_flow.set_up_your_groups', 'Set up your groups')}</h1><p className={LEDE}>{tr('onboarding.start_flow.cohorts_classes_or_teams_hand', 'Cohorts, classes or teams. Hand a plan to a whole group at once. Learners can join later.')}</p>
        <AddList placeholder={tr('onboarding.start_flow.name_a_group', 'Name a group')} items={state.groups} onChange={(groups) => patch({ groups })} chips={suggestions} />
        <Nav back={() => move(-1)} next={() => void finishStep('groups')} busy={busy} label={state.groups.length ? tr('onboarding.joined_flow.continue', 'Continue') : tr('onboarding.start_flow.skip_for_now', 'Skip for now')} /></>
    }
    return <><Eyebrow>{tr('onboarding.start_flow.all_set', 'All set')}</Eyebrow><h1 className={H1}>{tr('onboarding.start_flow.you_re_all_set', 'You’re all set')}{state.name.trim() ? `, ${state.name.trim().split(' ')[0]}` : ''}</h1>
      <p className={LEDE}>{tr('onboarding.start_flow.spacename_is_ready_your_home', '{{spaceName}} is ready. Your Home page has what to do next.', { spaceName })}</p>
      <Nav back={() => move(-1)} next={open} label={tr('onboarding.start_flow.let_s_go', 'Let’s go')} /></>
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
    <span className="text-[11.5px] font-semibold text-muted-foreground">{covers ? tr('onboarding.start_flow.covers_covers_of_of', 'Covers {{covers}} of {{of}}', { covers, of }) : tr('onboarding.start_flow.covers_none_yet', 'Covers none yet')}</span>
  </span>
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1.5 block text-[13px] font-semibold">{label}</span>{children}</label>
}

function Nav({ back, next, label = tr('lit.start_flow.continue', 'Continue'), disabled = false, busy = false }: { back?: () => void; next?: () => void; label?: string; disabled?: boolean; busy?: boolean }) {
  return <div className="mt-8 flex items-center justify-between gap-3">
    {back ? <Button variant="ghost" className="rounded-full" onClick={back} disabled={busy}><ArrowLeft />{tr('onboarding.joined_flow.back', 'Back')}</Button> : <span />}
    {next ? <Button size="lg" className="rounded-full" onClick={next} disabled={disabled || busy}>{busy ? <Loader2 className="animate-spin" /> : null}{label}<ArrowRight /></Button> : null}
  </div>
}

/** One persistent row: the current step is a pill, three on each side show, the rest collapse. */
function Dots({ steps, current }: { steps: Step[]; current: Step }) {
  const at = steps.indexOf(current)
  return <div className="mb-6 flex h-2.5 items-center" aria-label={tr('onboarding.start_flow.step_value_of_length', 'Step {{value}} of {{length}}', { value: at + 1, length: steps.length })}>
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
      {done ? <><b className="block text-[15px] text-foreground">{tr('onboarding.start_flow.let_s_launch_some_futures', 'Let’s launch some futures')}</b>{tr('onboarding.start_flow.spacename_is_live', '{{spaceName}} is live.', { spaceName })}</>
        : config ? <><b className="block text-[15px] text-foreground">{config.say[0]}</b>{config.say[1]}</> : tr('onboarding.start_flow.pick_the_one_that_fits', 'Pick the one that fits best.')}
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
    if (email && entries.some((value) => !EMAIL.test(value))) return setProblem(tr('lit.start_flow.that_doesn_t_look_like', 'That doesn’t look like an email address.'))
    onChange([...items, ...entries.filter((value) => !items.includes(value))])
    setDraft('')
    setProblem('')
  }
  const toggle = (value: string) => onChange(items.includes(value) ? items.filter((item) => item !== value) : [...items, value])
  return <div className="mt-6 space-y-3">
    <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); add() }}>
      <input className={INPUT} inputMode={email ? 'email' : undefined} placeholder={placeholder} value={draft} onChange={(event) => setDraft(event.target.value)} />
      <Button type="submit" variant="outline" className="h-11 rounded-xl">{tr('onboarding.start_flow.add', 'Add')}</Button>
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
        const response = await signup({ username: newUsername(), email: email.trim(), password, org_slug: org?.slug, org_id: org?.id })
        if (response.status !== 200) {
          const body = await response.json().catch(() => null)
          throw new Error(typeof body?.detail === 'string' ? body.detail : body?.detail?.message || tr('lit.start_flow.could_not_create_the_account', 'Could not create the account.'))
        }
      }
      const result = await signIn('credentials', { redirect: false, email: email.trim(), password })
      if (result && result.error) throw new Error(existing ? tr('lit.start_flow.that_email_and_password_don', 'That email and password don’t match.') : result.error)
      // Signing in clears every cached request, the org's included, so start the page over signed in; the picks are kept.
      window.location.reload()
    } catch (failure: any) {
      setError(failure?.message || tr('lit.start_flow.something_went_wrong_try_again', 'Something went wrong. Try again.'))
    } finally {
      setBusy(false)
    }
  }
  const googleOn = useGoogleSignIn()
  const google = async () => {
    if (!existing && !age.ok()) return
    onGoogle()
    const result = await signIn('google', { callbackUrl: `${window.location.origin}/start`, orgSlug: org?.slug, orgId: org?.id } as any)
    if (result && 'error' in result && result.error) setError(result.error)
  }

  return <><Eyebrow>{tr('onboarding.start_flow.account', 'Account')}</Eyebrow><h1 className={H1}>{existing ? tr('onboarding.start_flow.sign_in_to_save_this', 'Sign in to save this') : tr('onboarding.start_flow.save_your_space', 'Save your space')}</h1>
    <p className={LEDE}>{existing ? tr('onboarding.start_flow.we_ll_add_what_you', 'We’ll add what you’ve picked to your account.') : tr('onboarding.start_flow.create_an_account_so_your', 'Create an account so your plans are here when you come back.')}</p>
    <form className="mt-6 space-y-3.5" onSubmit={(event) => void submit(event)}>
      {existing ? null : <AgeConfirm {...age.field} />}
      {googleOn ? <><Button type="button" variant="outline" size="lg" className="w-full rounded-full" onClick={() => void google()}><SiGoogle size={18} color="#4285F4" />{tr('onboarding.start_flow.continue_with_google', 'Continue with Google')}</Button>
      <div className="flex items-center gap-3 text-[13px] font-semibold text-muted-foreground"><i className="h-px flex-1 bg-border" />{tr('onboarding.start_flow.or', 'or')}<i className="h-px flex-1 bg-border" /></div></> : null}
      <Field label={tr('onboarding.start_flow.email', 'Email')}><input className={INPUT} type="email" autoComplete="email" placeholder={tr('onboarding.start_flow.you_example_com', 'you@example.com')} value={email} onChange={(event) => setEmail(event.target.value)} /></Field>
      <Field label={tr('onboarding.start_flow.password', 'Password')}><input className={INPUT} type="password" autoComplete={existing ? 'current-password' : 'new-password'} placeholder={existing ? '' : tr('onboarding.start_flow.at_least_8_characters_with', 'At least 8 characters, with a number and a symbol')} value={password} onChange={(event) => setPassword(event.target.value)} /></Field>
      {!existing && password && !strong ? <p className="text-[12.5px] text-muted-foreground">{tr('onboarding.start_flow.use_at_least_8_characters', 'Use at least 8 characters with upper and lower case, a number and a symbol.')}</p> : null}
      <Button type="submit" size="lg" className="w-full rounded-full" disabled={!ready || busy}>{busy ? <Loader2 className="animate-spin" /> : null}{existing ? tr('onboarding.start_flow.sign_in', 'Sign in') : tr('onboarding.start_flow.create_account', 'Create account')}</Button>
      <p className="text-center text-[13px] text-muted-foreground">{existing ? tr('onboarding.start_flow.new_here', 'New here?') : tr('onboarding.start_flow.already_have_an_account', 'Already have an account?')} <button type="button" className="font-bold text-foreground underline underline-offset-4" onClick={() => { setExisting(!existing); setError('') }}>{existing ? tr('onboarding.start_flow.create_one_instead', 'Create one instead') : tr('onboarding.start_flow.sign_in_instead', 'Sign in instead')}</button></p>
    </form>
    <Nav back={back} /></>
}

/** Phones: the site preview behind a "See your space" pill, opened as a sheet over the step. */
function PreviewSheet({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false)
  return <div className="lg:hidden">
    <button type="button" onClick={() => setOpen(true)} className="fixed bottom-5 left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 rounded-full bg-white py-2 pl-2 pr-4 text-[14px] font-bold shadow-[0_10px_30px_rgba(15,23,42,0.18)] ring-1 ring-black/5">
      <span className="h-6 w-6 rounded-full bg-[#2F66D6]" />{tr('onboarding.start_flow.see_your_space', 'See your space')}
    </button>
    <AnimatePresence>
      {open ? <motion.div key="sheet" role="dialog" aria-modal="true" aria-label={tr('onboarding.start_flow.your_space', 'Your space')} className="fixed inset-0 z-40 flex flex-col bg-background/95 p-4 backdrop-blur"
        initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 24 }} transition={{ duration: 0.25 }}>
        <div className="mb-3 flex items-center justify-between"><b className="text-[15px]">{tr('onboarding.start_flow.your_space_so_far', 'Your space so far')}</b>
          <button type="button" onClick={() => setOpen(false)} aria-label={tr('onboarding.start_flow.close', 'Close')} className="flex h-9 w-9 items-center justify-center rounded-full bg-white shadow ring-1 ring-black/5"><X size={16} /></button></div>
        <div className="min-h-0 flex-1">{children}</div>
      </motion.div> : null}
    </AnimatePresence>
  </div>
}
