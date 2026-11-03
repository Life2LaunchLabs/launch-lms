'use client'

import React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import { ArrowLeft, CalendarDays, ChevronRight, Compass, MapPin, MoreHorizontal, Plus, Sparkles } from 'lucide-react'
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
import type { LifeDoc, Phase, PlacePhoto } from '@services/life/life'
import PhaseCover, { PhotoCredit } from './PhaseCover'
import { uploadMediaAsset } from '@services/media/library'
import { toast } from 'react-hot-toast'
import { cn } from '@/lib/utils'
import PhaseDialog, { type PhaseEdit } from './PhaseDialog'
import { KIND_ICON, PhaseStatus, kindLabel } from './PhaseStack'
import useLifePlan from './useLifePlan'

const EMPTY: GoalSummary[] = []
const lower = (title: string) => title.charAt(0).toLowerCase() + title.slice(1)
const due = (date?: string | null) => (date ? new Date(`${date.slice(0, 10)}T12:00:00`).toLocaleDateString(undefined, { month: 'short', year: 'numeric' }) : '')

/** One phase: its picture and dates, its goals as the main column, and its budget beside them. */
export default function PhasePage({ orgslug, phaseId }: { orgslug: string; phaseId: string }) {
  const session = useLHSession() as any
  const token: string | undefined = session?.data?.tokens?.access_token
  const viewerUserId = session?.data?.user?.id !== undefined ? Number(session.data.user.id) : undefined
  const router = useRouter()
  const ask = useAsk()
  const { doc, isLoading, error, change } = useLifePlan(token)
  const { data: all = EMPTY, isLoading: goalsLoading } = useSWR<GoalSummary[]>(token ? goalsUrl('?include_finished=true') : null, () => goalsApi.list(token), { revalidateOnFocus: true })
  const { getGoalColor } = useGoalColors(all, viewerUserId)
  const { startGoal, busy } = useStartGoal(orgslug, token)
  const { projection, catalog } = useLifeNumbers(doc, token)
  const photos = catalog?.place_photos
  const fileInput = React.useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = React.useState(false)
  const [edit, setEdit] = React.useState<PhaseEdit | null>(null)

  if (!token || isLoading) return <GeneralWrapperStyled><div className="space-y-6"><Skeleton className="h-8 w-24" /><Skeleton className="h-72 w-full rounded-[28px]" /><Skeleton className="h-64 w-full" /></div></GeneralWrapperStyled>
  const time = phaseTimes(doc).find((item) => item.phase.id === phaseId)
  if (error || !doc || !time) return <GeneralWrapperStyled><div className="py-16 text-center">
    <p className="text-lg font-bold">{error ? 'Your plan couldn’t load. Try again in a moment.' : 'This phase isn’t in your plan anymore.'}</p>
    <Button variant="brand" className="mt-4" asChild><Link href={getUriWithOrg(orgslug, routePaths.org.plans())}>Back to Plans</Link></Button>
  </div></GeneralWrapperStyled>

  const { phase } = time
  // Goals the learner works toward, in this phase. A goal filed nowhere sits in the phase they're in.
  const mine = all.filter((goal) => goal.is_subject && goal.target_kind !== 'group' && goal.status !== 'pending' && goal.source !== 'starter' && goal.status !== 'draft')
  const here = mine.filter((goal) => phaseOfGoal(doc, goal.goal_uuid) === phase.id)
  const active = here.filter((goal) => goal.status !== 'finished')
  const done = here.filter((goal) => goal.status === 'finished')
  const hrefOf = (goal: GoalSummary) => getUriWithOrg(orgslug, goal.status === 'draft' ? launchPath(goal.goal_uuid) : routePaths.org.plan(goal.goal_uuid))

  const remove = async () => {
    const goals = here.length ? ` Its ${here.length === 1 ? 'goal moves' : `${here.length} goals move`} to the phase you’re in.` : ''
    if (!(await ask.confirm({ title: `Remove "${phase.title}"?`, body: `Its budget and the one-time money in it go too.${goals}`, action: 'Remove phase', danger: true }))) return
    const saved = await change((next) => { next.phases = next.phases.filter((p) => p.id !== phase.id); next.events = next.events.filter((e) => e.phase !== phase.id) })
    if (saved) router.push(getUriWithOrg(orgslug, routePaths.org.plans()))
  }

  return <GeneralWrapperStyled>
    <main className="pb-16">
      <Button variant="ghost" size="sm" className="-ml-2 mb-3" asChild><Link href={getUriWithOrg(orgslug, routePaths.org.plans())}><ArrowLeft size={16} />Plans</Link></Button>
      <Cover time={time} photos={photos} uploading={uploading}
        menu={<DropdownMenu>
          <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label="Phase options" className="bg-white/85 text-[#15232c] backdrop-blur hover:bg-white"><MoreHorizontal /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setEdit({ mode: 'edit', phaseId: phase.id })}>Edit this phase</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setEdit({ mode: 'add', after: phase.id })}>Add a phase after this one</DropdownMenuItem>
            <DropdownMenuItem disabled={viewerUserId === undefined || uploading} onSelect={() => fileInput.current?.click()}>{phase.cover ? 'Change your photo' : 'Use your own photo'}</DropdownMenuItem>
            {phase.cover ? <DropdownMenuItem onSelect={() => { void change((next) => { const p = next.phases.find((x) => x.id === phase.id); if (p) p.cover = null }) }}>{phase.place && photos?.[phase.place] ? 'Use the photo of ' + (phase.place_label || 'the place') : 'Remove your photo'}</DropdownMenuItem> : null}
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive" onSelect={() => { void remove() }}>Remove this phase</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>} />

      <div className="mt-8 grid gap-6 md:grid-cols-[minmax(0,1fr)_300px] md:items-start lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-8">
        <section aria-labelledby="phase-goals" className="flex min-w-0 flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <h2 id="phase-goals" className="text-2xl font-extrabold tracking-tight">Goals</h2>
            <Button variant="brand" size="sm" onClick={() => void startGoal(phase.id)} disabled={busy}><Plus size={16} />{busy ? 'Starting…' : 'New goal'}</Button>
          </div>
          {goalsLoading ? <Skeleton className="h-28 rounded-2xl" /> : active.length
            ? <ul className="flex flex-col gap-2.5">{active.map((goal) => <li key={goal.goal_uuid}><GoalRow goal={goal} color={getGoalColor(goal.goal_uuid)} href={hrefOf(goal)} /></li>)}</ul>
            : <div className="rounded-[22px] border-2 border-dashed border-border px-5 py-8 text-center">
              <p className="font-bold">{time.when === 'done' ? `No goals were left open in ${lower(phase.title)}.` : `What do you want to get done ${time.when === 'now' ? 'now' : `during ${lower(phase.title)}`}?`}</p>
              <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">Say it in your own words, or pick one from Discover and earn a badge for it.</p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <Button variant="surface" size="sm" onClick={() => void startGoal(phase.id)} disabled={busy}><Plus size={15} />Create your own</Button>
                <Button variant="ghost" size="sm" asChild><Link href={getUriWithOrg(orgslug, '/discover')}><Compass size={15} />Discover</Link></Button>
              </div>
            </div>}
          {active.length ? <Button variant="ghost" size="sm" className="w-fit" asChild><Link href={getUriWithOrg(orgslug, '/discover')}><Compass size={15} />Find a goal in Discover</Link></Button> : null}
          {done.length ? <div className="mt-4 flex flex-col gap-2.5">
            <h3 className="text-xs font-extrabold uppercase tracking-[0.08em] text-muted-foreground">Finished</h3>
            <ul className="flex flex-col gap-2.5">{done.map((goal) => <li key={goal.goal_uuid}><GoalRow goal={goal} color={getGoalColor(goal.goal_uuid)} href={hrefOf(goal)} /></li>)}</ul>
          </div> : null}
        </section>
        <BudgetCard doc={doc} phase={phase} ends={time.ends} projection={projection} href={getUriWithOrg(orgslug, routePaths.org.phaseBudget(phase.id))} />
      </div>
    </main>
    <input ref={fileInput} type="file" accept="image/*" className="hidden" aria-hidden="true" tabIndex={-1} onChange={(event) => {
      const file = event.target.files?.[0]
      event.target.value = ''
      if (file && token && viewerUserId !== undefined) void (async () => {
        setUploading(true)
        try {
          const asset = await uploadMediaAsset({ type: 'user', id: viewerUserId }, 'image', file, token, file.name)
          await change((next) => { const p = next.phases.find((x) => x.id === phase.id); if (p) p.cover = { url: asset.url } })
        } catch { toast.error('That photo couldn’t be uploaded. Try a smaller image.') } finally { setUploading(false) }
      })()
    }} />
    {ask.dialog}
    <PhaseDialog edit={edit} doc={doc} token={token} onClose={() => setEdit(null)} change={change} onAdded={(id) => router.push(getUriWithOrg(orgslug, routePaths.org.phase(id)))} />
  </GeneralWrapperStyled>
}

function Cover({ time, menu, photos, uploading }: { time: PhaseTime; menu: React.ReactNode; photos?: Record<string, PlacePhoto>; uploading?: boolean }) {
  const { phase, when } = time
  const Icon = KIND_ICON[phase.kind] || Sparkles
  const chip = 'inline-flex items-center gap-1.5 rounded-full bg-black/30 px-3 py-1.5 text-xs font-extrabold text-white backdrop-blur'
  return <section aria-label={phase.title} className="relative h-[clamp(240px,30vw,320px)] overflow-hidden rounded-[28px] bg-muted text-white">
    <PhaseCover phase={phase} photos={photos} past={when === 'done'} className={cn('absolute inset-0 h-full w-full', uploading && 'animate-pulse')} />
    <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent_30%,rgb(8_20_30/0.6))]" aria-hidden="true" />
    <div className="absolute inset-x-4 top-4 flex items-start justify-between gap-2"><PhaseStatus when={when} />{menu}</div>
    <div className="absolute inset-x-5 bottom-5 grid gap-2.5 pr-8 sm:inset-x-7 sm:bottom-6">
      <span className="inline-flex items-center gap-1.5 text-sm font-extrabold opacity-95"><Icon size={15} aria-hidden="true" />{kindLabel(phase.kind)}</span>
      <h1 className="text-[clamp(30px,6vw,48px)] font-extrabold leading-[1.02] tracking-tight [text-shadow:0_2px_20px_rgb(0_0_0/0.25)]">{phase.title}</h1>
      <div className="flex flex-wrap gap-2">
        <span className={chip}><CalendarDays size={14} aria-hidden="true" />{monthName(time.starts)} – {monthName(time.ends)}</span>
        {phase.place_label ? <span className={chip}><MapPin size={14} aria-hidden="true" />{phase.place_label}</span> : null}
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
      {!finished && goal.next_step ? <span className="line-clamp-2 text-sm font-semibold text-foreground/80">Next: {goal.next_step}</span> : null}
      <span role="progressbar" aria-label={`${goal.title} progress`} aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} className="h-1.5 overflow-hidden rounded-full bg-muted"><span className="block h-full rounded-full bg-[var(--plan-face)]" style={{ width: `${percent}%` }} /></span>
      <small className="text-xs font-semibold text-muted-foreground">{finished ? 'Done' : total ? `${done} of ${total} steps` : 'No steps yet'}{goal.target_date ? ` · ${due(goal.target_date)}` : ''}</small>
    </span>
    <ChevronRight size={18} className="shrink-0 text-muted-foreground" aria-hidden="true" />
  </Link>
}

/** The phase's money in one sentence and a small line of savings and debt, opening the full budget. */
function BudgetCard({ doc, phase, ends, projection, href }: { doc: LifeDoc; phase: Phase; ends: string; projection: Projection | null; href: string }) {
  const off = phaseOffset(doc, phase.id)
  const empty = !phase.lines.length
  let sentence: React.ReactNode = 'Add what comes in and what goes out to see where this phase leaves you.'
  let spark: React.ReactNode = null
  let after: React.ReactNode = null
  if (!empty && projection) {
    const months = Math.max(1, phase.months)
    const avg = (series: number[]) => series.slice(off, off + months).reduce((a, b) => a + b, 0) / months
    const inn = avg(projection.inn), out = avg(projection.out)
    sentence = <>Costs about <b className="text-foreground">{money(out)}</b> a month, and about <b className="text-foreground">{money(inn)}</b> comes in.</>
    const sav = projection.sav.slice(off, off + months + 1), debt = projection.debt.slice(off, off + months + 1)
    const max = Math.max(1000, ...sav, ...debt), W = 300, H = 60
    const pts = (arr: number[]) => arr.map((v, i) => `${((i / Math.max(1, arr.length - 1)) * W).toFixed(1)},${(H - (v / max) * (H - 6) - 3).toFixed(1)}`).join(' ')
    spark = <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-16 w-full" role="img" aria-label="Savings and debt over the phase">
      <polyline points={pts(sav)} fill="none" stroke="#2F6FE0" strokeWidth={2.5} vectorEffect="non-scaling-stroke" />
      <polyline points={pts(debt)} fill="none" stroke="#E8642C" strokeWidth={2.5} vectorEffect="non-scaling-stroke" />
    </svg>
    const endSav = sav[sav.length - 1] ?? 0, endDebt = debt[debt.length - 1] ?? 0
    after = <span className="text-xs font-semibold text-muted-foreground">By {monthName(ends)}: <b className="text-foreground">{short(endSav)}</b> saved{endDebt > 0.5 ? <>, <b className="text-foreground">{short(endDebt)}</b> owed</> : null}</span>
  }
  return <Link href={href} className="grid gap-3 rounded-[22px] bg-card p-5 shadow-[0_1px_0_hsl(var(--border)),0_10px_28px_-24px_rgb(10_30_50/0.5)] transition-colors hover:bg-raised md:sticky md:top-6">
    <span className="flex items-center justify-between gap-2"><h2 className="text-xl font-extrabold tracking-tight">Budget</h2><span className="inline-flex items-center gap-0.5 text-sm font-bold text-[var(--org-primary-color)]">{empty ? 'Start it' : 'Open'}<ChevronRight size={16} aria-hidden="true" /></span></span>
    <span className="text-[15px] leading-snug text-muted-foreground">{sentence}</span>
    {spark}
    {after}
  </Link>
}
