'use client'

import React from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import useSWR, { preload, useSWRConfig } from 'swr'
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from 'motion/react'
import { Compass, Plus } from 'lucide-react'
import { useHub } from '@components/Hub/HubContext'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import GeneralWrapperStyled from '@components/Objects/StyledElements/Wrappers/GeneralWrapper'
import ContentPageHeader from '@components/Objects/StyledElements/Headers/ContentPageHeader'
import { Button } from '@components/ui/button'
import { Reveal, Skeleton } from '@components/ui/skeleton'
import GoalsHome from '@components/Goals/home/GoalsHome'
import useGoalCoachSession from '@components/Goals/edit/useGoalCoachSession'
import { GoalEditingProvider } from '@components/Goals/edit/GoalEditing'
import { GoalCoachBar } from '@components/Goals/coach/CoachNotes'
import { planVars } from '@components/Goals/planColors'
import { getUriWithOrg } from '@services/config/config'
import { goalsApi, goalsUrl, goalUrl } from '@services/goals/goals'
import { can, goalSteps, type Goal, type GoalSummary } from '@services/goals/types'
import { swrFetcher } from '@services/utils/ts/requests'
import GoalPath from './GoalPath'
import GoalHeaderActions from './GoalHeaderActions'
import { GoalCarousel, GoalHeaderCard, GoalTabs, summaryHeader, type HeaderGoal } from './GoalHeader'
import { GoalPathSkeleton } from './GoalStepRow'
import useGoalColors from './useGoalColors'
import useStartGoal, { launchPath } from './useStartGoal'

const EMPTY: GoalSummary[] = []
const homeKey = () => goalsUrl('/home')
const isGroup = (goal: GoalSummary) => goal.target_kind === 'group'
const EASE_OUT = [0.22, 1, 0.36, 1] as const

/**
 * The body below the goal strip slides toward the goal being opened: right for a goal
 * further along the strip, left for one before it or for the overview.
 */
const swipe = {
  enter: ({ dir, still }: { dir: number; still: boolean }) => ({ opacity: 0, x: still ? 0 : dir * 40 }),
  center: { opacity: 1, x: 0, transition: { duration: 0.3, ease: EASE_OUT } },
  exit: ({ dir, still }: { dir: number; still: boolean }) => ({ opacity: 0, x: still ? 0 : dir * -40, transition: { duration: 0.18, ease: 'easeIn' as const } }),
}

/** Goals: the landing page, one goal's path, and editing a goal, chosen by the URL. */
export default function GoalsWorkspace({ orgslug, initialGoalUuid }: { orgslug: string; initialGoalUuid?: string }) {
  const session = useLHSession() as any
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const hub = useHub()
  const setSurface = hub?.setSurface
  const token: string | undefined = session?.data?.tokens?.access_token
  const viewerUserId = session?.data?.user?.id !== undefined ? Number(session.data.user.id) : undefined
  const [selectedUuid, setSelectedUuid] = React.useState(initialGoalUuid || '')
  const [selectedStepUuid, setSelectedStepUuid] = React.useState('')

  // Coach's "Start a goal" lands here; the learner sets the goal up in the launch flow.
  const { startGoal, busy: startingGoal } = useStartGoal(orgslug, token)
  const hubStart = searchParams.get('hub_action') === 'create-plan' && Boolean(token)
  React.useEffect(() => {
    if (!hubStart) return
    const next = new URLSearchParams(window.location.search)
    next.delete('hub_action')
    window.history.replaceState({}, '', `${window.location.pathname}${next.size ? `?${next.toString()}` : ''}`)
    void startGoal()
  }, [hubStart]) // eslint-disable-line react-hooks/exhaustive-deps

  const { data: all = EMPTY, error: listError, isLoading, mutate: retryList } = useSWR<GoalSummary[]>(token ? goalsUrl('?include_finished=true') : null, () => goalsApi.list(token), { revalidateOnFocus: true })
  const { data: detail, error: detailError, mutate: retryDetail, isValidating: detailValidating } = useSWR<Goal>(token && selectedUuid ? goalUrl(selectedUuid) : null, () => goalsApi.get(selectedUuid, token))
  // Finished goals that have not greeted their learner yet (shared with This week's data).
  const { data: home } = useSWR<{ celebrations?: string[] }>(token ? homeKey() : null, (url: string) => swrFetcher(url, token))
  const goals = React.useMemo(() => all.filter((goal) => goal.status !== 'finished'), [all])
  const finished = React.useMemo(() => all.filter((goal) => goal.status === 'finished' && !isGroup(goal)), [all])
  const { getGoalColor, setGoalColor } = useGoalColors(all, viewerUserId)
  // Goals that open here (not group rows), in the order the strip shows them. A goal an
  // organization handed the learner waits under Invitations until they accept it.
  const stripGoals = React.useMemo(() => goals.filter((goal) => !isGroup(goal) && goal.status !== 'pending'), [goals])
  const { cache } = useSWRConfig()
  const reduceMotion = useReducedMotion()

  React.useEffect(() => {
    const segments = (pathname.split('/plans')[1] || '').split('/').filter(Boolean)
    if (segments.length > 1) return
    setSelectedUuid(decodeURIComponent(segments[0] || ''))
    // A link can open a goal at one step (This week, Coach): /plans/{goal}?step={step}.
    const params = new URLSearchParams(window.location.search)
    setSelectedStepUuid(params.get('step') || '')
  }, [pathname])

  // Tell Coach what the learner is looking at: their goals, or one goal and the steps in view.
  React.useEffect(() => {
    if (!setSurface) return
    if (!selectedUuid) {
      setSurface({ path: pathname, label: 'Goals', hint: { surface: 'goals', visible_ids: stripGoals.slice(0, 8).map((goal) => goal.goal_uuid) } })
      return () => setSurface(null)
    }
    if (!detail || detail.goal_uuid !== selectedUuid) { setSurface(null); return }
    const visible = new Set<string>()
    const publish = () => setSurface({
      path: pathname, label: detail.title,
      selectionLabel: goalSteps(detail).find((step) => step.step_uuid === selectedStepUuid)?.title,
      hint: { surface: 'goal', entity_id: detail.goal_uuid, selected_step_id: selectedStepUuid || undefined, visible_ids: [...visible].slice(0, 20) },
    })
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const id = (entry.target as HTMLElement).dataset.stepShell!
        if (entry.isIntersecting) visible.add(id); else visible.delete(id)
      }
      publish()
    })
    document.querySelectorAll('[data-step-shell]').forEach((node) => observer.observe(node))
    publish()
    return () => { observer.disconnect(); setSurface(null) }
  }, [detail, stripGoals, selectedUuid, selectedStepUuid, pathname, setSurface])

  // A goal finished since the learner last looked greets them with its story, once.
  const storyDue = Boolean(detail && detail.goal_uuid === selectedUuid && viewerUserId !== undefined && detail.subject?.id === viewerUserId && home?.celebrations?.includes(detail.goal_uuid))
  React.useEffect(() => {
    if (storyDue) router.replace(getUriWithOrg(orgslug, `/plans/${encodeURIComponent(selectedUuid)}/story`))
  }, [storyDue, selectedUuid, orgslug, router])
  const choose = (goal: GoalSummary | Goal) => {
    const assignment = (goal as GoalSummary).assignment_uuid
    if ((goal as GoalSummary).target_kind === 'group' && assignment) { router.push(getUriWithOrg(orgslug, `/plans/groups/${assignment}`)); return }
    if (goal.status === 'draft') { router.push(getUriWithOrg(orgslug, launchPath(goal.goal_uuid))); return }
    setSelectedUuid(goal.goal_uuid)
    setSelectedStepUuid('')
    window.history.pushState({}, '', getUriWithOrg(orgslug, `/plans/${encodeURIComponent(goal.goal_uuid)}`))
  }
  const clear = () => {
    setSelectedUuid('')
    setSelectedStepUuid('')
    window.history.pushState({}, '', getUriWithOrg(orgslug, '/plans'))
  }
  // Coach's session on the open goal: its suggestions show on the goal as they come.
  const coach = useGoalCoachSession({ goal_uuid: selectedUuid, title: detail?.title || '' }, token)
  // A draft opened by its link goes back to setting it up, once the goal is fresh: a copy cached
  // while the launch flow ran would otherwise bounce a goal that just went live.
  React.useEffect(() => {
    if (!detailValidating && detail?.status === 'draft' && detail.goal_uuid === selectedUuid) router.replace(getUriWithOrg(orgslug, launchPath(detail.goal_uuid)))
  }, [detail, detailValidating, selectedUuid, orgslug, router])

  // Fetch a goal as soon as the learner reaches for it, so it is usually there by the click.
  const prefetch = (goal: GoalSummary) => {
    const key = token && goal.goal_uuid && !isGroup(goal) ? goalUrl(goal.goal_uuid) : null
    if (key && !cache.get(key)?.data) void preload(key, () => goalsApi.get(goal.goal_uuid, token)).catch(() => undefined)
  }

  // Which view the body shows, and which way it moved to get there.
  const viewKey = !selectedUuid ? 'overview' : `goal:${selectedUuid}`
  const place = (key: string) => {
    if (key === 'overview') return -1
    const index = stripGoals.findIndex((goal) => goal.goal_uuid === key.split(':').slice(1).join(':'))
    return index < 0 ? stripGoals.length : index
  }
  const [motionState, setMotionState] = React.useState({ key: viewKey, dir: 1, still: true })
  if (motionState.key !== viewKey) {
    setMotionState({ key: viewKey, dir: Math.sign(place(viewKey) - place(motionState.key)) || 1, still: Boolean(reduceMotion) })
  }

  if (!token && session?.status !== 'loading') return <SignedOut orgslug={orgslug} />

  const failed = (message: string, retry: () => void) => <div className="rounded-2xl border-2 border-border bg-card p-5" role="alert"><p className="text-sm">{message}</p><Button variant="surface" className="mt-3" onClick={retry}>Try again</Button></div>
  const ready = Boolean(detail) && detail!.goal_uuid === selectedUuid
  const goal = ready ? detail! : null
  const isSubject = Boolean(goal && viewerUserId !== undefined && goal.subject?.id === viewerUserId)
  // Until the full goal arrives, its header renders from the goal list's summary.
  const summary = stripGoals.find((item) => item.goal_uuid === selectedUuid) || finished.find((item) => item.goal_uuid === selectedUuid)
  const header: HeaderGoal | null = summary
    ? { ...summaryHeader(summary), ...(goal ? { title: goal.title, description: goal.description, icon: goal.icon } : {}) }
    : goal ? { goal_uuid: goal.goal_uuid, title: goal.title, description: goal.description, icon: goal.icon, is_subject: isSubject, subject: goal.subject } : null
  const badge = header?.source_badge || null
  const celebrating = Boolean(goal && isSubject && home?.celebrations?.includes(goal.goal_uuid))
  const color = getGoalColor(selectedUuid)

  // The strip over the body: goal tabs on the overview, the open goal's header among the others on a goal.
  let strip: React.ReactNode = null
  if (!selectedUuid && !listError) {
    strip = isLoading
      ? <div className="-mx-4 flex gap-3 overflow-hidden px-4 pt-1 md:mx-0 md:grid md:grid-cols-2 md:px-0 xl:grid-cols-3" aria-hidden="true">{[0, 1, 2].map((index) => <Skeleton key={index} className="h-[70px] w-[78%] shrink-0 rounded-[18px] sm:w-[46%] md:w-auto" />)}</div>
      : stripGoals.length ? <GoalTabs goals={stripGoals} getGoalColor={getGoalColor} choose={choose} onIntent={prefetch}>
        <div className="flex w-[78%] shrink-0 snap-start items-center gap-2 rounded-[18px] border-2 border-dashed border-border p-2 sm:w-[46%] md:w-auto">
          <Button type="button" variant="surface" size="sm" className="flex-1" onClick={() => void startGoal()} disabled={startingGoal}><Plus size={15} />{startingGoal ? 'Starting…' : 'Create your own'}</Button>
          <Button type="button" variant="ghost" size="sm" asChild><Link href={getUriWithOrg(orgslug, '/discover')}><Compass size={15} />Discover</Link></Button>
        </div>
      </GoalTabs> : null
  } else if (selectedUuid && !celebrating && !detailError && header) {
    const card = <div data-plan="" style={planVars(color)} className="h-full">
      <GoalHeaderCard goal={header} done={goal ? goal.progress.done : summary?.progress.done || 0} total={goal ? goal.progress.total : summary?.progress.total || 0} pending={!goal}
        actions={goal ? <GoalHeaderActions orgslug={orgslug} goal={goal} badge={badge} token={token} onBack={clear} coachWorking={Boolean(coach.session)} onEndCoach={() => void coach.end()}
          onPlanWithCoach={coach.available && goal.ownership === 'personal' && can(goal, 'delete_plan') && can(goal, 'edit_structure') && !coach.session ? () => void coach.start() : undefined} /> : null} />
    </div>
    strip = <GoalCarousel goals={stripGoals} activeUuid={selectedUuid} getGoalColor={getGoalColor} choose={choose} onIntent={prefetch}>{card}</GoalCarousel>
  } else if (selectedUuid && !detailError && !ready) {
    strip = <Skeleton className="h-52 rounded-3xl" />
  }

  let content: React.ReactNode
  if (!selectedUuid) content = listError ? failed('Your goals could not load.', () => void retryList()) : isLoading ? <Skeleton className="h-64 rounded-3xl" /> : <GoalsHome orgslug={orgslug} token={token} goals={goals} finished={finished} choose={choose} getGoalColor={getGoalColor} onCreate={() => void startGoal()} creating={startingGoal} />
  else if (detailError) content = failed('This goal could not load. It may no longer be available to you.', () => void retryDetail())
  else {
    // Opening a goal: the header is already up; its steps fade in where the placeholder was.
    let body: React.ReactNode = null
    if (!goal) { /* the placeholder shows until it arrives */ }
    else if (celebrating) { /* the story opens; the placeholder shows until it does */ }
    else body = <GoalPath goal={goal} color={color} badge={badge} selectedUuid={selectedStepUuid} onSelect={setSelectedStepUuid}
      own={goal.ownership === 'personal' && can(goal, 'delete_plan')}
      viewer={{ orgslug, token, viewerUserId, canWork: isSubject && can(goal, 'update_progress'), staff: !isSubject && can(goal, 'complete_restricted_objectives') }} />
    content = <Reveal ready={ready} fallback={<GoalPathSkeleton />}>{body}</Reveal>
  }

  return <GeneralWrapperStyled>
    <main className="pb-16">
      {selectedUuid
        ? <ContentPageHeader orgslug={orgslug} backLabel="Overview" onBack={clear} compactBottomMargin />
        : <h1 className="pb-4 pt-2 text-3xl font-extrabold tracking-tight">Overview</h1>}
      <LayoutGroup id="plans">
        <GoalEditingProvider goal={goal} token={token} color={color} setColor={isSubject && goal ? (next: string) => setGoalColor(goal.goal_uuid, next) : undefined}>
        {strip}
        {goal && goal.ownership === 'personal' && goal.status === 'active' && viewerUserId !== undefined && goal.owner?.id === viewerUserId && !celebrating ? <GoalCoachBar goalUuid={goal.goal_uuid} token={token} /> : null}
        <div className="relative mt-8 overflow-x-clip">
          <AnimatePresence initial={false} mode="popLayout" custom={motionState}>
            <motion.div key={viewKey} custom={motionState} variants={swipe} initial="enter" animate="center" exit="exit">
              {content}
            </motion.div>
          </AnimatePresence>
        </div>
        </GoalEditingProvider>
      </LayoutGroup>
    </main>
  </GeneralWrapperStyled>
}

function SignedOut({ orgslug }: { orgslug: string }) {
  const next = encodeURIComponent(getUriWithOrg(orgslug, '/plans'))
  return <GeneralWrapperStyled><div className="py-24 text-center">
    <h1 className="text-3xl font-extrabold">Sign in to see your goals</h1>
    <p className="mx-auto mt-3 max-w-md text-sm text-muted-foreground">Use the email that received your invitation. New here? Create an account and your pending goal will be waiting.</p>
    <div className="mt-6 flex justify-center gap-3">
      <Button asChild variant="brand"><Link href={`/login?next=${next}`}>Sign in</Link></Button>
      <Button asChild variant="surface"><Link href={`/signup?next=${next}`}>Create account</Link></Button>
    </div>
  </div></GeneralWrapperStyled>
}
