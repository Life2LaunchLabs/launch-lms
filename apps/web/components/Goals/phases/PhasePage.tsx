'use client'
/* eslint-disable no-unused-vars -- parameter names in function types */

import React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import { CalendarDays, Check, ChevronLeft, ChevronRight, Compass, Flag, Home, Map as MapIcon, MapPin, MoreHorizontal, Plus, Sparkles, Users } from 'lucide-react'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import GeneralWrapperStyled from '@components/Objects/StyledElements/Wrappers/GeneralWrapper'
import { Button } from '@components/ui/button'
import { Skeleton } from '@components/ui/skeleton'
import { useAsk } from '@components/ui/ask-dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@components/ui/dropdown-menu'
import { GoalIconMark } from '@components/Goals/goalIcons'
import { planVars } from '@components/Goals/planColors'
import { phaseOfGoal, phaseTimes, monthName, type PhaseTime } from '@components/Goals/learner/phases'
import useGoalColors from '@components/Goals/learner/useGoalColors'
import useStartGoal, { launchPath } from '@components/Goals/learner/useStartGoal'
import useLifeNumbers from '@components/LifePlan/useLifeNumbers'
import { money, phaseOffset, short, type Projection } from '@components/LifePlan/model'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { goalsApi, goalsUrl } from '@services/goals/goals'
import type { GoalSummary } from '@services/goals/types'
import type { Career, LifeDoc, Phase, PlacePhoto } from '@services/life/life'
import PhaseCover, { PhotoCredit } from './PhaseCover'
import { uploadMediaAsset } from '@services/media/library'
import { toast } from 'react-hot-toast'
import { cn } from '@/lib/utils'
import { PhaseStatus } from './PhaseStack'
import { addBetween, ancestors, byId, endsOf, kids, normalize, parents, remove as removePhase, routeDoc, whenOf } from './graph'
import { activityText, checklist, householdLabel, kindFor, livingLabel, suggestTitle, type CheckItem } from './setup'
import EstimatesDialog, { type EstimatesMode } from '@components/LifePlan/EstimatesDialog'
import { ActivityPicker, HouseholdPicker, LivingPicker, MonthPicker } from './PhasePickers'
import { PlacePicker } from '@components/LifePlan/PhaseForm'
import PhaseInsights, { useCareers } from './PhaseInsights'
import useLifePlan from './useLifePlan'
import Invitations from '@components/Goals/home/Invitations'
import SharedWithYou from '@components/LifePlan/SharedWithYou'

import { tr } from '@/lib/tr'
const EMPTY: GoalSummary[] = []
const lower = (title: string) => title.charAt(0).toLowerCase() + title.slice(1)
const due = (date?: string | null) => (date ? new Date(`${date.slice(0, 10)}T12:00:00`).toLocaleDateString(undefined, { month: 'short', year: 'numeric' }) : '')

type Pop = 'name' | 'date' | 'place' | 'living' | 'household' | 'doing' | null

/**
 * One phase: back and next cards with the map between them, its picture (click the name, date, place,
 * living or what you're doing to change it right there), how set up it is, its goals as the main
 * column, and its budget and insights beside them.
 */
export default function PhasePage({ orgslug, phaseId }: { orgslug: string; phaseId: string }) {
  const session = useLHSession() as any
  const token: string | undefined = session?.data?.tokens?.access_token
  const viewerUserId = session?.data?.user?.id !== undefined ? Number(session.data.user.id) : undefined
  const router = useRouter()
  const ask = useAsk()
  const { doc: raw, isLoading, error, change } = useLifePlan(token)
  const doc = React.useMemo(() => (raw?.phases?.length ? normalize(raw) : raw), [raw])
  const { data: all = EMPTY, isLoading: goalsLoading } = useSWR<GoalSummary[]>(token ? goalsUrl('?include_finished=true') : null, () => goalsApi.list(token), { revalidateOnFocus: true })
  const { getGoalColor } = useGoalColors(all, viewerUserId)
  const { startGoal, busy } = useStartGoal(orgslug, token)
  // The budget reads the route through this phase as one line.
  const line = React.useMemo(() => (doc?.phases?.length && byId(doc, phaseId) ? routeDoc(doc, phaseId) : null), [doc, phaseId])
  const { projection, catalog } = useLifeNumbers(line, token)
  const photos = catalog?.place_photos
  const fileInput = React.useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = React.useState(false)
  const [pop, setPop] = React.useState<Pop>(null)
  const [showList, setShowList] = React.useState(false)
  // Estimates: open to start the budget, or after a pick changed (base = the phase before). `waiting` keeps a change put off with Not now.
  const [est, setEst] = React.useState<{ mode: EstimatesMode; base: Phase | null; auto?: boolean } | null>(null)
  const [waiting, setWaiting] = React.useState<Phase | null>(null)
  const applied = React.useRef(false)
  const phaseNow = doc && byId(doc, phaseId)
  const careers = useCareers(phaseNow || ({ activities: [] } as any), token)

  if (!token || isLoading) return <GeneralWrapperStyled><div className="space-y-6"><Skeleton className="h-8 w-24" /><Skeleton className="h-72 w-full rounded-[28px]" /><Skeleton className="h-64 w-full" /></div></GeneralWrapperStyled>
  const time = phaseTimes(doc).find((item) => item.phase.id === phaseId)
  if (error || !doc || !time || !line) return <GeneralWrapperStyled><div className="py-16 text-center">
    <p className="text-lg font-bold">{error ? tr('goals.phase_page.your_plan_couldn_t_load', 'Your plan couldn’t load. Try again in a moment.') : tr('goals.phase_page.this_phase_isn_t_in', 'This phase isn’t in your plan anymore.')}</p>
    <Button variant="brand" className="mt-4" asChild><Link href={getUriWithOrg(orgslug, routePaths.org.plans())}>{tr('goals.phase_page.back_to_plans', 'Back to Plans')}</Link></Button>
  </div></GeneralWrapperStyled>

  const { phase } = time
  // Goals the learner works toward, in this phase. A goal filed nowhere sits in the phase they're in.
  const mine = all.filter((goal) => goal.is_subject && goal.target_kind !== 'group' && goal.status !== 'pending' && goal.source !== 'starter' && goal.status !== 'draft')
  const here = mine.filter((goal) => phaseOfGoal(doc, goal.goal_uuid) === phase.id)
  const active = here.filter((goal) => goal.status !== 'finished')
  const done = here.filter((goal) => goal.status === 'finished')
  const hrefOf = (goal: GoalSummary) => getUriWithOrg(orgslug, goal.status === 'draft' ? launchPath(goal.goal_uuid) : routePaths.org.plan(goal.goal_uuid))
  const mapHref = getUriWithOrg(orgslug, `${routePaths.org.plans()}?phase=${encodeURIComponent(phase.id)}`)

  /** Change this phase in place, then save. A new place, living or activity offers the estimates it changes in the budget. */
  const edit = async (fn: (p: Phase) => void, opts: { picks?: boolean; retitle?: boolean } = {}) => {
    let base: Phase | null = null, auto = false
    const saved = await change((next) => {
      const map = normalize(next)
      const p = byId(map, phase.id)
      if (!p) return
      base = structuredClone(p)
      auto = !!map.auto_estimates
      const before = suggestTitle(p)
      fn(p)
      if (opts.retitle && p.title === before) p.title = suggestTitle(p)
      if (opts.picks) p.kind = kindFor(p.activities)
      Object.assign(next, map)
    })
    const b = base as Phase | null
    if (saved && opts.picks && b?.lines.length) { setWaiting(null); setEst({ mode: 'change', base: b, auto }) }
    return saved
  }
  /** Lines from the Estimates dialog become the phase's budget; "don't ask" is kept on the plan. */
  const applyEstimates = (lines: Phase['lines'], { dontAsk }: { dontAsk: boolean }) => {
    setWaiting(null)
    applied.current = true
    void change((next) => {
      const map = normalize(next)
      const p = byId(map, phase.id)
      if (!p) return
      p.lines = lines
      if (dontAsk) map.auto_estimates = true
      Object.assign(next, map)
    })
  }

  const remove = async () => {
    const goals = here.length ? ` Its ${here.length === 1 ? 'goal moves' : `${here.length} goals move`} to the phase you’re in.` : ''
    if (!phase.idea && !(await ask.confirm({ title: tr('goals.phase_page.remove_title', 'Remove "{{title}}"?', { title: phase.title }), body: `Its budget and the one-time money in it go too.${goals}`, action: tr('lit.phase_page.remove_phase', 'Remove phase'), danger: true }))) return
    const saved = await change((next) => { Object.assign(next, removePhase(normalize(next), phase.id)) })
    if (saved) router.push(getUriWithOrg(orgslug, routePaths.org.plans()))
  }

  const items = checklist(phase, here.length)
  const left = items.filter((i) => !i.done)
  const gaps = careerGaps(doc, phase, careers)
  const nexts = kids(doc, phase.id)
  const fixItem = (key: CheckItem['key']) => {
    if (key === 'goals') { void startGoal(phase.id); return }
    if (key === 'budget') { router.push(getUriWithOrg(orgslug, routePaths.org.phaseBudget(phase.id))); return }
    setPop(key === 'starts' ? 'date' : key); window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return <GeneralWrapperStyled>
    <main className="flex flex-col gap-4 pb-16">
      <PhaseNav doc={doc} phase={phase} orgslug={orgslug} mapHref={mapHref} />
      <div className="relative">
        <Cover time={time} photos={photos} uploading={uploading} pop={pop} setPop={setPop}
          onRename={(title) => { void edit((p) => { p.title = title.trim() || p.title }) }}
          menu={<DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label={tr('goals.phase_page.phase_options', 'Phase options')} className="bg-white/85 text-[#15232c] backdrop-blur hover:bg-white"><MoreHorizontal /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {phase.idea ? <DropdownMenuItem onSelect={() => { void edit((p) => { p.idea = false }) }}>{tr('goals.phase_page.make_it_real', 'Make it real')}</DropdownMenuItem> : null}
              <DropdownMenuItem asChild><Link href={mapHref}>{tr('goals.phase_page.add_a_phase_on_the', 'Add a phase on the map')}</Link></DropdownMenuItem>
              <DropdownMenuItem disabled={viewerUserId === undefined || uploading} onSelect={() => fileInput.current?.click()}>{phase.cover ? tr('goals.phase_page.change_your_photo', 'Change your photo') : tr('goals.phase_page.use_your_own_photo', 'Use your own photo')}</DropdownMenuItem>
              {phase.cover ? <DropdownMenuItem onSelect={() => { void edit((p) => { p.cover = null }) }}>{phase.place && photos?.[phase.place] ? tr('lit.phase_page.use_the_photo_of', 'Use the photo of ') + (phase.place_label || 'the place') : tr('goals.phase_page.remove_your_photo', 'Remove your photo')}</DropdownMenuItem> : null}
              {time.when === 'now' || time.when === 'done' ? null : <><DropdownMenuSeparator /><DropdownMenuItem className="text-destructive" onSelect={() => { void remove() }}>{tr('goals.phase_page.remove_this_phase', 'Remove this phase')}</DropdownMenuItem></>}
            </DropdownMenuContent>
          </DropdownMenu>} />
        {pop && pop !== 'name' ? <div role="dialog" aria-label={tr('goals.phase_page.change_this_phase', 'Change this phase')} className="absolute inset-x-3 top-[calc(100%-14px)] z-30 grid max-w-[460px] gap-3 rounded-[20px] bg-card p-4 text-foreground shadow-[0_0_0_2px_hsl(var(--border)),0_24px_40px_-18px_rgb(0_0_0/0.45)]">
          {pop === 'date' ? <><h3 className="font-extrabold">{time.when === 'now' || time.when === 'done' ? tr('goals.phase_page.started', 'Started') : tr('goals.phase_page.might_start', 'Might start')}</h3>
            <MonthPicker value={phase.starts!} onChange={(v) => { void edit((p) => { p.starts = v; p.undated = false }) }} />
            <p className="text-sm text-muted-foreground">{tr('goals.phase_page.no_end_date_it_lasts', 'No end date: it lasts until the next phase starts.')}</p></> : null}
          {pop === 'place' ? <><h3 className="font-extrabold">{tr('goals.phase_insights.where', 'Where')}</h3>
            <PlacePicker token={token} value={phase.place || null} label={phase.place_label || ''} onPick={(pl) => { void edit((p) => { p.place = pl?.key || null; p.place_label = pl?.label || ''; p.places = [] }, { retitle: true, picks: true }); setPop(null) }} /></> : null}
          {pop === 'living' ? <><h3 className="font-extrabold">{tr('goals.phase_page.how_you_live', 'How you live')}</h3>
            <LivingPicker value={phase.living} onPick={(key) => { void edit((p) => { p.living = key }, { picks: true, retitle: true }); setPop(null) }} /></> : null}
          {pop === 'household' ? <><h3 className="font-extrabold">{tr('goals.phase_page.who_you_re_providing_for', 'Who you’re providing for')}</h3>
            <p className="text-sm font-bold text-muted-foreground">{tr('goals.phase_page.people_whose_costs_this_budget', 'People whose costs this budget covers. Roommates you split with go under how you live.')}</p>
            <HouseholdPicker value={phase.household} onPick={(h) => { void edit((p) => { p.household = h }, { picks: true }); setPop(null) }} /></> : null}
          {pop === 'doing' ? <><h3 className="font-extrabold">{tr('goals.phase_page.what_you_re_doing', 'What you’re doing')}</h3>
            {(phase.activities || []).length ? <ul className="grid gap-1.5">{phase.activities!.map((a, i) => <li key={i} className="flex items-center gap-2 rounded-xl bg-muted px-3 py-2 font-bold"><span className="flex-1">{activityText(a)}</span>
              <button type="button" className="text-sm font-bold text-muted-foreground hover:text-destructive" onClick={() => { void edit((p) => { p.activities = (p.activities || []).filter((_, j) => j !== i) }, { picks: true, retitle: true }) }}>{tr('goals.upload.remove', 'Remove')}</button></li>)}</ul> : null}
            <p className="text-sm font-bold text-muted-foreground">{phase.activities?.length ? tr('goals.phase_page.add_another_two_jobs_school', 'Add another (two jobs, school and a job: all fine)') : tr('goals.phase_page.pick_one', 'Pick one')}</p>
            <ActivityPicker token={token} onPick={(a) => { void edit((p) => { p.activities = [...(p.activities || []), a] }, { picks: true, retitle: true }); setPop(null) }} /></> : null}
          <Button size="sm" variant="surface" className="w-fit" onClick={() => setPop(null)}>{tr('goals.routine_action.done', 'Done')}</Button>
        </div> : null}
      </div>

      {left.length || gaps.length ? <div className="grid auto-cols-[minmax(min(260px,82%),1fr)] grid-flow-col gap-2.5 overflow-x-auto p-0.5 pb-1.5">
        {left.length ? <button type="button" onClick={() => setShowList(!showList)} aria-expanded={showList} className="flex items-center gap-3 rounded-[18px] bg-card px-3.5 py-3 text-left shadow-[0_0_0_1.5px_hsl(var(--border))]">
          <Ring done={items.length - left.length} total={items.length} />
          <span className="min-w-0"><b className="block text-[14.5px] font-extrabold">{tr('goals.phase_page.length_to_set_up', '{{length}} to set up', { length: left.length })}</b><small className="block truncate text-xs font-bold text-muted-foreground">{left.map((i) => i.title).join(', ')}</small></span>
        </button> : null}
        {gaps.map((g) => <button key={g.title} type="button" onClick={() => { void change((next) => { Object.assign(next, g.fix(normalize(next))) }) }} className="flex items-center gap-3 rounded-[18px] bg-amber-100 px-3.5 py-3 text-left text-amber-950 dark:bg-amber-500/15 dark:text-amber-100">
          <span className="grid size-[38px] shrink-0 place-items-center rounded-xl bg-white/60 text-amber-700 dark:bg-white/10"><Flag size={18} aria-hidden="true" /></span>
          <span className="min-w-0"><b className="block text-[14.5px] font-extrabold">{g.title}</b><small className="block text-xs font-bold opacity-80">{tr('goals.phase_page.body_tap_to_add_one', '{{body}} Tap to add one.', { body: g.body })}</small></span>
        </button>)}
      </div> : null}
      {showList && left.length ? <ul className="grid rounded-[22px] bg-card py-1.5 shadow-[0_0_0_1.5px_hsl(var(--border))]">{items.map((it) => <li key={it.key}>
        <button type="button" disabled={it.done} onClick={() => fixItem(it.key)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left font-bold disabled:opacity-60">
          <span className={cn('grid size-6 place-items-center rounded-full', it.done ? 'bg-emerald-500 text-white' : 'shadow-[inset_0_0_0_2px_hsl(var(--border))]')}>{it.done ? <Check size={14} aria-hidden="true" /> : null}</span>
          <span className="flex-1">{it.title}</span>{it.done ? null : <span className="text-sm text-[var(--org-primary-color)]">{tr('goals.phase_page.set', 'Set')}</span>}
        </button></li>)}</ul> : null}

      {/* What others hand you lands in the phase you're in. */}
      {whenOf(doc, phase) === 'now' ? <div className="mt-4 flex flex-col gap-3"><SharedWithYou token={token} /><Invitations token={token} /></div> : null}
      <div className="mt-4 grid gap-6 md:grid-cols-[minmax(0,1fr)_300px] md:items-start lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-8">
        <section aria-labelledby="phase-goals" className="flex min-w-0 flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <h2 id="phase-goals" className="text-2xl font-extrabold tracking-tight">{tr('goals.goals_workspace.goals', 'Goals')}</h2>
            <Button variant="brand" size="sm" onClick={() => void startGoal(phase.id)} disabled={busy}><Plus size={16} />{busy ? tr('goals.phase_page.starting', 'Starting…') : tr('goals.phase_page.new_goal', 'New goal')}</Button>
          </div>
          {goalsLoading ? <Skeleton className="h-28 rounded-2xl" /> : active.length
            ? <ul className="flex flex-col gap-2.5">{active.map((goal) => <li key={goal.goal_uuid}><GoalRow goal={goal} color={getGoalColor(goal.goal_uuid)} href={hrefOf(goal)} /></li>)}</ul>
            : <div className="rounded-[22px] border-2 border-dashed border-border px-5 py-8 text-center">
              <p className="font-bold">{time.when === 'done' ? tr('goals.phase_page.no_goals_were_left_open', 'No goals were left open in {{lower}}.', { lower: lower(phase.title) }) : time.when === 'now' ? tr('goals.phase_page.what_are_you_working_toward', 'What are you working toward right now?') : tr('goals.phase_page.what_has_to_happen_first', 'What has to happen first?')}</p>
              <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">{tr('goals.phase_page.say_it_in_your_own', 'Say it in your own words, or pick one from Discover and earn a badge for it.')}</p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <Button variant="surface" size="sm" onClick={() => void startGoal(phase.id)} disabled={busy}><Plus size={15} />{tr('goals.phase_page.create_your_own', 'Create your own')}</Button>
                <Button variant="ghost" size="sm" asChild><Link href={getUriWithOrg(orgslug, '/discover')}><Compass size={15} />{tr('goals.phase_page.discover', 'Discover')}</Link></Button>
              </div>
            </div>}
          {time.when === 'now' && active.length === 0 && done.length && nexts[0] ? <Button variant="surface" className="w-fit" asChild><Link href={getUriWithOrg(orgslug, routePaths.org.phase(nexts[0].id))}>{tr('goals.phase_page.all_done_here_look_at', 'All done here. Look at {{title}}', { title: nexts[0].title })}<ChevronRight size={15} /></Link></Button> : null}
          {active.length ? <Button variant="ghost" size="sm" className="w-fit" asChild><Link href={getUriWithOrg(orgslug, '/discover')}><Compass size={15} />{tr('goals.phase_page.find_a_goal_in_discover', 'Find a goal in Discover')}</Link></Button> : null}
          {done.length ? <div className="mt-4 flex flex-col gap-2.5">
            <h3 className="text-xs font-extrabold uppercase tracking-[0.08em] text-muted-foreground">{tr('goals.phase_page.finished', 'Finished')}</h3>
            <ul className="flex flex-col gap-2.5">{done.map((goal) => <li key={goal.goal_uuid}><GoalRow goal={goal} color={getGoalColor(goal.goal_uuid)} href={hrefOf(goal)} /></li>)}</ul>
          </div> : null}
        </section>
        <aside className="grid gap-4 md:sticky md:top-6">
          {waiting ? <button type="button" onClick={() => setEst({ mode: 'change', base: waiting })} className="inline-flex w-fit items-center gap-1.5 rounded-full bg-[color-mix(in_srgb,var(--org-primary-color)_14%,transparent)] px-3 py-1.5 text-sm font-bold text-[var(--org-primary-color)] dark:text-[color-mix(in_srgb,var(--org-primary-color)_45%,white)]"><Sparkles size={15} aria-hidden="true" />{tr('goals.phase_page.budget_changes_to_look_at', 'Budget changes to look at')}</button> : null}
          <BudgetCard doc={line} phase={byId(line, phase.id) || phase} ends={time.ends} projection={projection} href={getUriWithOrg(orgslug, routePaths.org.phaseBudget(phase.id))} onStart={() => setEst({ mode: 'start', base: null })} />
          {doc.auto_estimates ? <p className="-mt-2 px-1 text-xs text-muted-foreground">{tr('goals.phase_page.estimate_changes_update_your_budget', 'Estimate changes update your budget without asking.')}{' '}<button type="button" className="font-bold text-[var(--org-primary-color)] underline-offset-2 hover:underline" onClick={() => { void change((next) => { next.auto_estimates = false }) }}>{tr('goals.phase_page.ask_me_next_time', 'Ask me next time')}</button></p> : null}
          <PhaseInsights phase={phase} token={token} careers={careers} />
        </aside>
      </div>
    </main>
    <input ref={fileInput} type="file" accept="image/*" className="hidden" aria-hidden="true" tabIndex={-1} onChange={(event) => {
      const file = event.target.files?.[0]
      event.target.value = ''
      if (file && token && viewerUserId !== undefined) void (async () => {
        setUploading(true)
        try {
          const asset = await uploadMediaAsset({ type: 'user', id: viewerUserId }, 'image', file, token, file.name)
          await edit((p) => { p.cover = { url: asset.url } })
        } catch { toast.error(tr('goals.phase_page.that_photo_couldn_t_be', 'That photo couldn’t be uploaded. Try a smaller image.')) } finally { setUploading(false) }
      })()
    }} />
    {ask.dialog}
    {est ? <EstimatesDialog open mode={est.mode} base={est.base} auto={est.auto} phase={byId(doc, phase.id) || phase} catalog={catalog} token={token}
      onApply={applyEstimates} onClose={(empty) => { if (!empty && !applied.current && est.mode === 'change' && !est.auto && est.base) setWaiting((w) => w ?? est.base); applied.current = false; setEst(null) }} /> : null}
  </GeneralWrapperStyled>
}

/** Where the jobs in a phase usually need more school than the phases before it have. */
function careerGaps(doc: LifeDoc, phase: Phase, careers: Career[]): { title: string; body: string; fix: (d: LifeDoc) => LifeDoc }[] {
  const when = whenOf(doc, phase)
  if (when === 'now' || when === 'done') return []
  const before = ancestors(doc, phase.id)
  const learned = (f: (lv?: string | null) => boolean) => before.some((x) => (x.activities || []).some((a) => a.kind === 'learning' && f(a.level)) || (x.activities || []).some((a) => a.apprentice))
  const out: { title: string; body: string; fix: (d: LifeDoc) => LifeDoc }[] = []
  const prev = parents(doc, phase)[0]
  for (const a of phase.activities || []) {
    const c = careers.find((x) => x.code === a.career)
    if (!c?.job_zone || a.apprentice || !prev) continue
    const name = c.title.split(/,| and /)[0].trim()
    const school = (title: string, level: string) => (d: LifeDoc) => addBetween(d, prev.id, phase.id, { title, idea: true, activities: [{ kind: 'learning', level, schools: [] }], living: level === 'uni' ? 'dorm' : prev.living }).doc
    if (c.job_zone >= 4 && !learned((lv) => lv === 'uni' || lv === 'grad')) out.push({ title: `${name}s usually need a ${c.job_zone >= 5 ? 'graduate' : 'bachelor’s'} degree`, body: `Your way here goes from ${prev.title} straight to this job.`, fix: school(tr('lit.graph.college', 'College'), 'uni') })
    else if (c.job_zone === 3 && !learned((lv) => !!lv && !['middle', 'high'].includes(lv))) out.push({ title: `${name}s usually need training after high school`, body: 'A certificate, a 2-year degree or an apprenticeship.', fix: school(tr('lit.phase_page.training', 'Training'), 'trade') })
  }
  return out
}

function Ring({ done, total }: { done: number; total: number }) {
  const r = 15, c = 2 * Math.PI * r
  return <svg width={38} height={38} viewBox="0 0 38 38" aria-hidden="true" className="shrink-0">
    <circle cx={19} cy={19} r={r} fill="none" stroke="hsl(var(--muted))" strokeWidth={4.5} />
    <circle cx={19} cy={19} r={r} fill="none" stroke="var(--org-primary-color)" strokeWidth={4.5} strokeDasharray={`${(done / total) * c} ${c}`} strokeLinecap="round" transform="rotate(-90 19 19)" />
    <text x={19} y={23} textAnchor="middle" className="fill-foreground text-[10px] font-extrabold">{done}/{total}</text>
  </svg>
}

/** Back and next: one small card per way in or out, with the map between them. A next card says where its way ends. */
function PhaseNav({ doc, phase, orgslug, mapHref }: { doc: LifeDoc; phase: Phase; orgslug: string; mapHref: string }) {
  const prev = parents(doc, phase), next = kids(doc, phase.id)
  const endName = (k: Phase) => { const e = endsOf(doc, k.id); return e.length === 1 && e[0].id !== k.id ? ` (${e[0].title})` : e.length > 1 ? ` (${e.length} ways)` : '' }
  const card = 'inline-flex max-w-[260px] shrink-0 items-center gap-2 rounded-2xl bg-card px-3 py-2 text-left text-[13.5px] font-extrabold shadow-[0_0_0_1.5px_hsl(var(--border))] hover:shadow-[0_0_0_2px_var(--org-primary-color)]'
  return <nav aria-label={tr('goals.phase_page.phases_before_and_after', 'Phases before and after')} className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
    <div className="flex min-w-0 gap-1.5 overflow-x-auto p-0.5">{prev.map((x) => <Link key={x.id} href={getUriWithOrg(orgslug, routePaths.org.phase(x.id))} className={card}><ChevronLeft size={15} aria-hidden="true" /><span className="min-w-0"><span className="block truncate">{x.title}</span><small className="block text-[11.5px] font-bold text-muted-foreground">{monthName(x.starts!)}</small></span></Link>)}</div>
    <Link href={mapHref} aria-label={tr('goals.phase_page.open_the_map_here', 'Open the map here')} className={cn(card, 'px-2.5')}><MapIcon size={16} aria-hidden="true" /><span className="hidden sm:inline">{tr('goals.plan_compare.map', 'Map')}</span></Link>
    <div className="flex min-w-0 justify-end gap-1.5 overflow-x-auto p-0.5">{next.length ? next.map((k) => <Link key={k.id} href={getUriWithOrg(orgslug, routePaths.org.phase(k.id))} className={cn(card, 'min-w-0 shrink', k.idea && 'shadow-none outline-dashed outline-2 -outline-offset-2 outline-border')}><span className="min-w-0"><span className="block truncate">{k.title}{endName(k)}</span><small className="block text-[11.5px] font-bold text-muted-foreground">{monthName(k.starts!)}</small></span><ChevronRight size={15} aria-hidden="true" /></Link>)
      : <Link href={mapHref} className={cn(card, 'min-w-0 shrink shadow-none outline-dashed outline-2 -outline-offset-2 outline-border')}><span className="min-w-0"><span className="block truncate">{tr('goals.phase_page.what_comes_after', 'What comes after?')}</span><small className="block truncate text-[11.5px] font-bold text-muted-foreground">{tr('goals.phase_page.add_it_on_the_map', 'Add it on the map')}</small></span><Plus size={15} aria-hidden="true" /></Link>}</div>
  </nav>
}

function Cover({ time, menu, photos, uploading, pop, setPop, onRename }: { time: PhaseTime; menu: React.ReactNode; photos?: Record<string, PlacePhoto>; uploading?: boolean; pop: Pop; setPop: (p: Pop) => void; onRename: (title: string) => void }) {
  const { phase, when } = time
  const [title, setTitle] = React.useState(phase.title)
  React.useEffect(() => setTitle(phase.title), [phase.title])
  const chip = 'inline-flex items-center gap-1.5 rounded-full bg-black/35 px-3 py-1.5 text-xs font-extrabold text-white backdrop-blur hover:outline hover:outline-2 hover:outline-offset-2 hover:outline-dashed hover:outline-white/70'
  const toggle = (p: Pop) => setPop(pop === p ? null : p)
  const acts = phase.activities || []
  return <section aria-label={phase.title} className="relative h-[clamp(250px,30vw,320px)] overflow-hidden rounded-[28px] bg-muted text-white">
    <PhaseCover phase={phase} photos={photos} past={when === 'done'} className={cn('absolute inset-0 h-full w-full', uploading && 'animate-pulse', phase.idea && 'saturate-[.5]')} />
    <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent_25%,rgb(8_20_30/0.65))]" aria-hidden="true" />
    <div className="absolute inset-x-4 top-4 flex items-start justify-between gap-2"><span className="flex flex-wrap gap-1.5"><PhaseStatus when={when} />{phase.idea ? <span className="inline-flex items-center rounded-full bg-white/90 px-3 py-1.5 text-xs font-extrabold text-[#15232c] outline-dashed outline-2 -outline-offset-4 outline-[#15232c]/40">{tr('goals.phase_page.idea', 'Idea')}</span> : null}</span>{menu}</div>
    <div className="absolute inset-x-5 bottom-5 grid gap-2 pr-8 sm:inset-x-7 sm:bottom-6">
      <button type="button" onClick={() => toggle('doing')} className="inline-flex w-fit items-center gap-1.5 rounded-lg text-left text-sm font-extrabold opacity-95 hover:outline hover:outline-2 hover:outline-offset-4 hover:outline-dashed hover:outline-white/70">
        {acts.length ? acts.map(activityText).join(' + ') : <span className="opacity-80">{tr('goals.phase_page.what_are_you_doing', 'What are you doing?')}</span>}
      </button>
      {pop === 'name'
         
        ? <input autoFocus aria-label={tr('goals.phase_page.phase_name', 'Phase name')} value={title} onChange={(e) => setTitle(e.target.value)} onBlur={() => { onRename(title); setPop(null) }} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') { setTitle(phase.title); setPop(null) } }}
          className="w-[min(100%,520px)] rounded-xl bg-black/30 px-2.5 py-0.5 text-[clamp(28px,6vw,44px)] font-extrabold text-white outline outline-2 outline-white/80" />
        : <h1><button type="button" onClick={() => setPop('name')} className="rounded-xl text-left text-[clamp(30px,6vw,48px)] font-extrabold leading-[1.02] tracking-tight [text-shadow:0_2px_20px_rgb(0_0_0/0.25)] hover:outline hover:outline-2 hover:outline-offset-4 hover:outline-dashed hover:outline-white/70">{phase.title}</button></h1>}
      <div className="flex flex-wrap gap-2">
        <button type="button" className={chip} onClick={() => toggle('date')}><CalendarDays size={14} aria-hidden="true" />{phase.undated ? tr('goals.phase_page.when', 'When?') : `${when === 'now' || when === 'done' ? tr('lit.phase_page.since', 'Since') : tr('lit.phase_page.from', 'From')} ${monthName(time.starts)}`}</button>
        <button type="button" className={chip} onClick={() => toggle('place')}><MapPin size={14} aria-hidden="true" />{phase.place_label || tr('goals.phase_page.where', 'Where?')}</button>
        <button type="button" className={chip} onClick={() => toggle('living')}><Home size={14} aria-hidden="true" />{livingLabel(phase.living) || tr('goals.phase_page.living', 'Living?')}</button>
        <button type="button" className={chip} onClick={() => toggle('household')}><Users size={14} aria-hidden="true" />{householdLabel(phase.household)}</button>
      </div>
    </div>
    <PhotoCredit phase={phase} photos={photos} className="bottom-3 right-3" />
  </section>
}

/** A goal in the phase: its mark, what's next, and how far along it is. */
function GoalRow({ goal, color, href }: { goal: GoalSummary; color: string; href: string }) {
  const { done, total } = goal.progress
  const percent = total ? Math.round((done * 100) / total) : 0
  const finished = goal.status === 'finished'
  return <Link href={href} data-plan="" style={planVars(color)} className="flex w-full items-center gap-4 rounded-[22px] bg-card p-4 text-left shadow-[0_1px_0_hsl(var(--border)),0_10px_28px_-24px_rgb(10_30_50/0.5)] transition-colors hover:bg-raised">
    <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-[color-mix(in_srgb,var(--plan-face)_16%,transparent)] text-[var(--plan-accent,var(--plan-face))]" aria-hidden="true"><GoalIconMark icon={goal.icon} size={22} /></span>
    <span className="grid min-w-0 flex-1 gap-1.5">
      <b className="line-clamp-2 text-[17px] font-extrabold leading-snug">{goal.title}</b>
      {!finished && goal.next_step ? <span className="line-clamp-2 text-sm font-semibold text-foreground/80">{tr('goals.phase_page.next_next_step', 'Next: {{next_step}}', { next_step: goal.next_step })}</span> : null}
      <span role="progressbar" aria-label={`${goal.title} progress`} aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} className="h-1.5 overflow-hidden rounded-full bg-muted"><span className="block h-full rounded-full bg-[var(--plan-face)]" style={{ width: `${percent}%` }} /></span>
      <small className="text-xs font-semibold text-muted-foreground">{finished ? tr('goals.routine_action.done', 'Done') : total ? tr('goals.phase_page.done_of_total_steps', '{{done}} of {{total}} steps', { done, total }) : tr('goals.goal_path.no_steps_yet', 'No steps yet')}{goal.target_date ? ` · ${due(goal.target_date)}` : ''}</small>
    </span>
    <ChevronRight size={18} className="shrink-0 text-muted-foreground" aria-hidden="true" />
  </Link>
}

/** The phase's money in one sentence and a small line of savings and debt, opening the full budget. */
function BudgetCard({ doc, phase, ends, projection, href, onStart }: { doc: LifeDoc; phase: Phase; ends: string; projection: Projection | null; href: string; onStart: () => void }) {
  const off = phaseOffset(doc, phase.id)
  const empty = !phase.lines.length
  let sentence: React.ReactNode = tr('lit.phase_page.add_what_comes_in_and', 'Add what comes in and what goes out to see where this phase leaves you.')
  let spark: React.ReactNode = null
  let after: React.ReactNode = null
  if (!empty && projection) {
    const months = Math.max(1, phase.months)
    const avg = (series: number[]) => series.slice(off, off + months).reduce((a, b) => a + b, 0) / months
    const inn = avg(projection.inn), out = avg(projection.out)
    const sav = projection.sav.slice(off, off + months + 1), debt = projection.debt.slice(off, off + months + 1)
    // With nothing going out yet, savings would be everything that comes in, so ask for the costs first.
    const noCosts = out < 1 && !debt.some((value) => value > 0.5)
    sentence = noCosts
      ? <>{tr('goals.phase_page.about', 'About')}{' '}<b className="text-foreground">{money(inn)}</b>{' '}{tr('goals.phase_page.comes_in_a_month_add', 'comes in a month. Add your costs to see what’s left.')}</>
      : <>{tr('goals.phase_page.costs_about', 'Costs about')}{' '}<b className="text-foreground">{money(out)}</b>{' '}{tr('goals.phase_page.a_month_and_about', 'a month, and about')}{' '}<b className="text-foreground">{money(inn)}</b>{' '}{tr('goals.phase_page.comes_in', 'comes in.')}</>
    const max = Math.max(1000, ...sav, ...debt), W = 300, H = 60
    const pts = (arr: number[]) => arr.map((v, i) => `${((i / Math.max(1, arr.length - 1)) * W).toFixed(1)},${(H - (v / max) * (H - 6) - 3).toFixed(1)}`).join(' ')
    if (!noCosts) spark = <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-16 w-full" role="img" aria-label={tr('goals.phase_page.savings_and_debt_over_the', 'Savings and debt over the phase')}>
      <polyline points={pts(sav)} fill="none" stroke="#2F6FE0" strokeWidth={2.5} vectorEffect="non-scaling-stroke" />
      <polyline points={pts(debt)} fill="none" stroke="#E8642C" strokeWidth={2.5} vectorEffect="non-scaling-stroke" />
    </svg>
    const endSav = sav[sav.length - 1] ?? 0, endDebt = debt[debt.length - 1] ?? 0
    if (!noCosts) after = <span className="text-xs font-semibold text-muted-foreground">{tr('goals.phase_page.by_monthname', 'By {{monthName}}:', { monthName: monthName(ends) })}{' '}<b className="text-foreground">{short(endSav)}</b>{' '}{tr('goals.phase_page.saved', 'saved')}{endDebt > 0.5 ? <>, <b className="text-foreground">{short(endDebt)}</b>{' '}{tr('goals.phase_page.owed', 'owed')}</> : null}</span>
  }
  if (empty) return <div className="grid gap-3 rounded-[22px] bg-card p-5 shadow-[0_1px_0_hsl(var(--border)),0_10px_28px_-24px_rgb(10_30_50/0.5)]">
    <span className="flex items-center justify-between gap-2"><h2 className="text-xl font-extrabold tracking-tight">{tr('goals.phase_page.budget', 'Budget')}</h2><Link href={href} className="text-sm font-bold text-muted-foreground hover:text-foreground">{tr('goals.upload.open', 'Open')}</Link></span>
    <span className="text-[15px] leading-snug text-muted-foreground">{tr('goals.phase_page.we_ll_suggest_lines_and', 'We’ll suggest lines and amounts from where you live, how you live and what you’re doing.')}</span>
    <Button variant="brand" size="sm" className="w-fit" onClick={onStart}><Sparkles size={15} />{tr('goals.phase_page.start_your_budget', 'Start your budget')}</Button>
  </div>
  return <Link href={href} className="grid gap-3 rounded-[22px] bg-card p-5 shadow-[0_1px_0_hsl(var(--border)),0_10px_28px_-24px_rgb(10_30_50/0.5)] transition-colors hover:bg-raised">
    <span className="flex items-center justify-between gap-2"><h2 className="text-xl font-extrabold tracking-tight">{tr('goals.phase_page.budget', 'Budget')}</h2><span className="inline-flex items-center gap-0.5 text-sm font-bold text-[var(--org-primary-color)]">{empty ? tr('goals.phase_page.start_it', 'Start it') : tr('goals.upload.open', 'Open')}<ChevronRight size={16} aria-hidden="true" /></span></span>
    <span className="text-[15px] leading-snug text-muted-foreground">{sentence}</span>
    {spark}
    {after}
  </Link>
}
