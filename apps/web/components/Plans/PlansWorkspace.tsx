'use client'

import React from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import useSWR, { mutate, preload, useSWRConfig } from 'swr'
import toast from 'react-hot-toast'
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from 'motion/react'
import { Compass, Plus } from 'lucide-react'
import { useHub } from '@components/Hub/HubContext'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { useOrg } from '@components/Contexts/OrgContext'
import GeneralWrapperStyled from '@components/Objects/StyledElements/Wrappers/GeneralWrapper'
import ContentPageHeader from '@components/Objects/StyledElements/Headers/ContentPageHeader'
import { Button } from '@components/ui/button'
import { Reveal, Skeleton } from '@components/ui/skeleton'
import { type PlanLifecycle } from '@services/planning/planning'
import { getAPIUrl, getUriWithOrg } from '@services/config/config'
import { swrFetcher } from '@services/utils/ts/requests'
import { bindHubEditRunPlan } from '@services/hub/advisor'
import { shouldOpenHubNewPlanEditor } from '@services/hub/objectEditing'
import type { PlanTarget } from './PlanEditorShared'
import ObjectiveCard from './objective/ObjectiveCard'
import CreatePlanEditor from './edit/CreatePlanEditor'
import PlanEditMode from './edit/PlanEditMode'
import PlanStepsEditor from './edit/PlanStepsEditor'
import PlansHome, { homeKey, WeekSkeleton } from './learner/PlansHome'
import PlanView, { PlanViewSkeleton } from './learner/PlanView'
import PlanComplete from './learner/PlanComplete'
import PlanHeaderActions from './learner/PlanHeaderActions'
import { PlanCarousel, PlanHeaderCard, PlanTabs } from './learner/PlanHeader'
import { planVars } from './learner/planColors'
import usePlanColors from './learner/usePlanColors'
import useQuickCreatePlan from './learner/useQuickCreatePlan'

const plansKey = (lifecycle: PlanLifecycle) => `${getAPIUrl()}planning/plans?lifecycle=${lifecycle}`
const invitesKey = () => `${getAPIUrl()}planning/invitations/me`
const detailKey = (slug?: string) => slug ? `${getAPIUrl()}planning/plans/${encodeURIComponent(slug)}` : null
const EMPTY_PLANS: PlanTarget[] = []
const canEdit = (plan: any) => ['edit_plan_details', 'edit_structure', 'edit_schedule'].some((capability) => plan.capabilities?.includes(capability))
const stepsOf = (detail: any) => detail.objectives || detail.phases?.flatMap((phase: any) => phase.objectives || []) || []
const EASE_OUT = [0.22, 1, 0.36, 1] as const

/**
 * The body below the plan strip slides toward the plan being opened: right for a plan
 * further along the strip, left for one before it or for the overview.
 */
const swipe = {
  enter: ({ dir, still }: { dir: number; still: boolean }) => ({ opacity: 0, x: still ? 0 : dir * 40 }),
  center: { opacity: 1, x: 0, transition: { duration: 0.3, ease: EASE_OUT } },
  exit: ({ dir, still }: { dir: number; still: boolean }) => ({ opacity: 0, x: still ? 0 : dir * -40, transition: { duration: 0.18, ease: 'easeIn' as const } }),
}

/** Plans: the landing page, one plan's path, and editing a plan, chosen by the URL. */
export default function PlansWorkspace({ orgslug, initialPlanSlug }: { orgslug: string; initialPlanSlug?: string }) {
  const session = useLHSession() as any
  const org = useOrg() as any
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const hub = useHub()
  const setSurface = hub?.setSurface
  const token = session?.data?.tokens?.access_token
  const viewerUserId = session?.data?.user?.id
  const [selectedSlug, setSelectedSlug] = React.useState(initialPlanSlug || '')
  const [creating, setCreating] = React.useState(false)
  const [editingPlan, setEditingPlan] = React.useState(false)
  const [selectedObjectiveUuid, setSelectedObjectiveUuid] = React.useState('')
  const editDetails = searchParams.get('edit') === 'details'

  React.useEffect(() => {
    if (searchParams.get('hub_action') !== 'create-plan') return
    setCreating(true)
    const next = new URLSearchParams(searchParams.toString())
    next.delete('hub_action')
    window.history.replaceState({}, '', `${pathname}${next.size ? `?${next.toString()}` : ''}`)
  }, [pathname, searchParams])
  React.useEffect(() => {
    if (shouldOpenHubNewPlanEditor(hub?.editRun) && pathname.endsWith('/plans')) { setCreating(true); setSelectedSlug('') }
  }, [pathname, hub?.editRun])

  const { data: plans = EMPTY_PLANS, error: plansError, isLoading, mutate: retryPlans } = useSWR<PlanTarget[]>(token ? plansKey('active') : null, (url: string) => swrFetcher(url, token), { revalidateOnFocus: true })
  const { data: completedPlans = EMPTY_PLANS, error: completedError, mutate: retryCompleted } = useSWR<PlanTarget[]>(token ? plansKey('completed') : null, (url: string) => swrFetcher(url, token))
  const { data: detail, error: detailError, mutate: retryDetail } = useSWR<any>(token && selectedSlug ? detailKey(selectedSlug) : null, (url: string) => swrFetcher(url, token))
  // Finished plans that have not greeted their learner yet (shared with the Plans home's data).
  const { data: home } = useSWR<any>(token ? homeKey() : null, (url: string) => swrFetcher(url, token))
  const { data: invitations = [] } = useSWR<any[]>(token ? invitesKey() : null, (url: string) => swrFetcher(url, token), { revalidateOnFocus: true })
  const colorPlans = React.useMemo(() => [...plans, ...completedPlans], [plans, completedPlans])
  const { getPlanColor, setPlanColor } = usePlanColors(colorPlans, viewerUserId)
  // Plans that open here (not group assignments), in the order the strip shows them.
  const stripPlans = React.useMemo(() => plans.filter((plan) => plan.target_kind === 'individual'), [plans])
  const { cache } = useSWRConfig()
  const reduceMotion = useReducedMotion()

  React.useEffect(() => {
    const segments = (pathname.split('/plans')[1] || '').split('/').filter(Boolean)
    if (segments.length > 1) return
    setSelectedSlug(decodeURIComponent(segments[0] || ''))
    setSelectedObjectiveUuid('')
  }, [pathname])

  // Tell Coach what the learner is looking at: their plans, or one plan and the steps in view.
  React.useEffect(() => {
    if (!setSurface) return
    if (!selectedSlug) {
      setSurface({ path: pathname, label: 'Plans', hint: { surface: 'plans', visible_ids: plans.slice(0, 8).map(item => item.plan_uuid) } })
      return () => setSurface(null)
    }
    if (!detail || detail.slug !== selectedSlug) { setSurface(null); return }
    const visible = new Set<string>()
    const detailObjectives = detail.objectives || detail.phases?.flatMap((phase: any) => phase.objectives || []) || []
    const publish = () => setSurface({
      path: pathname, label: detail.name,
      selectionLabel: detailObjectives.find((item: any) => item.objective_uuid === selectedObjectiveUuid)?.title,
      hint: { surface: 'plan', entity_id: detail.plan_uuid, selected_objective_id: selectedObjectiveUuid || undefined, visible_ids: [...visible].slice(0, 20) },
    })
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        const id = (entry.target as HTMLElement).dataset.objectiveShell!
        if (entry.isIntersecting) visible.add(id); else visible.delete(id)
      }
      publish()
    })
    document.querySelectorAll('[data-objective-shell]').forEach(node => observer.observe(node))
    publish()
    return () => { observer.disconnect(); setSurface(null) }
  }, [detail, plans, selectedSlug, selectedObjectiveUuid, pathname, setSurface, editingPlan])

  const refresh = async () => {
    await mutate((key: unknown) => typeof key === 'string' && key.includes(`${getAPIUrl()}planning`))
  }
  const choose = (plan: any, edit = false) => {
    if (plan.target_kind === 'group' && plan.assignment_uuid) { router.push(getUriWithOrg(orgslug, `/plans/groups/${plan.assignment_uuid}`)); return }
    setSelectedSlug(plan.slug)
    setSelectedObjectiveUuid(''); setEditingPlan(false)
    window.history.pushState({}, '', getUriWithOrg(orgslug, `/plans/${encodeURIComponent(plan.slug)}${edit ? '?edit=details' : ''}`))
  }
  const clear = () => {
    setSelectedSlug(''); setCreating(false)
    setSelectedObjectiveUuid(''); setEditingPlan(false)
    window.history.pushState({}, '', getUriWithOrg(orgslug, '/plans'))
  }
  const finishEditing = () => {
    setEditingPlan(false)
    if (!editDetails) return
    const next = new URLSearchParams(searchParams.toString()); next.delete('edit')
    window.history.replaceState({}, '', `${pathname}${next.size ? `?${next}` : ''}`)
  }
  const { quickCreate, busy: quickCreateBusy } = useQuickCreatePlan(token, async (plan) => { choose(plan, true); await refresh() })
  const continueRun = (content: string, run = hub?.editRun) => {
    if (run?.status === 'active') hub?.enqueueEditContinuation({ id: crypto.randomUUID(), conversationUuid: run.conversation_uuid, runUuid: run.run_uuid, content })
  }
  const onCreated = async (plan: any, content?: string) => {
    setCreating(false)
    let continued = null
    if (hub?.editRun?.scope.kind === 'new_plan' && org?.id) {
      try { continued = await bindHubEditRunPlan(org.id, hub.editRun.run_uuid, plan.plan_uuid, token); hub.setEditRun(continued) } catch { toast.error('The plan was saved, but Coach lost its editing scope.') }
    }
    choose(plan)
    if (continued && content) continueRun(`[[hub-session-event]] You saved the plan\n${content}`, continued)
  }
  const renderObjective = (item: any, color = getPlanColor(item.plan?.plan_uuid)) => <ObjectiveCard item={item} orgslug={orgslug} token={token} viewerUserId={viewerUserId} refresh={refresh} color={color} expanded />

  // Fetch a plan as soon as the learner reaches for it, so it is usually there by the click.
  const prefetch = (plan: any) => {
    const key = token && plan?.slug && plan.target_kind !== 'group' ? detailKey(plan.slug) : null
    if (key && !cache.get(key)?.data) void preload(key, (url: string) => swrFetcher(url, token)).catch(() => undefined)
  }

  // Which view the body shows, and which way it moved to get there.
  const viewKey = creating ? 'new' : !selectedSlug ? 'overview' : `${editingPlan || editDetails ? 'edit' : 'plan'}:${selectedSlug}`
  const place = (key: string) => {
    if (key === 'overview' || key === 'new') return -1
    const index = stripPlans.findIndex((plan) => plan.slug === key.split(':').slice(1).join(':'))
    return index < 0 ? stripPlans.length : index
  }
  const [motionState, setMotionState] = React.useState({ key: viewKey, dir: 1, still: true })
  if (motionState.key !== viewKey) {
    const samePlan = motionState.key.split(':').slice(1).join(':') === viewKey.split(':').slice(1).join(':') && viewKey !== 'overview'
    setMotionState({ key: viewKey, dir: Math.sign(place(viewKey) - place(motionState.key)) || 1, still: Boolean(reduceMotion) || samePlan })
  }

  if (!token && session?.status !== 'loading') return <SignedOut orgslug={orgslug} />

  const failed = (message: string, retry: () => void) => <div className="rounded-2xl border-2 border-border bg-card p-5" role="alert"><p className="text-sm">{message}</p><Button variant="surface" className="mt-3" onClick={retry}>Try again</Button></div>
  const ready = Boolean(detail) && detail.slug === selectedSlug && detail.source_assignment?.type !== 'group'
  const editing = ready && (editingPlan || editDetails) && canEdit(detail)
  // Until the full plan arrives, its header renders from the plan list's summary.
  const summary: any = stripPlans.find((plan) => plan.slug === selectedSlug) || completedPlans.find((plan) => plan.slug === selectedSlug)
  const active: any = ready ? detail : summary
  const celebrating = Boolean(active?.is_mine && home?.celebrations?.includes(active.plan_uuid))

  // The strip over the body: plan tabs on the overview, the open plan's header among the others on a plan.
  let strip: React.ReactNode = null
  if (!selectedSlug && !creating && !plansError) {
    strip = isLoading
      ? <div className="-mx-4 flex gap-3 overflow-hidden px-4 pt-1 md:mx-0 md:grid md:grid-cols-2 md:px-0 xl:grid-cols-3" aria-hidden="true">{[0, 1, 2].map((index) => <Skeleton key={index} className="h-[70px] w-[78%] shrink-0 rounded-[18px] sm:w-[46%] md:w-auto" />)}</div>
      : plans.length ? <PlanTabs plans={plans} getPlanColor={getPlanColor} choose={choose} onIntent={prefetch}>
        <div className="flex w-[78%] shrink-0 snap-start items-center gap-2 rounded-[18px] border-2 border-dashed border-border p-2 sm:w-[46%] md:w-auto">
          <Button type="button" variant="surface" size="sm" className="flex-1" onClick={() => void quickCreate()} disabled={quickCreateBusy}><Plus size={15} />{quickCreateBusy ? 'Creating…' : 'Create your own'}</Button>
          <Button type="button" variant="ghost" size="sm" asChild><Link href={getUriWithOrg(orgslug, '/discover')}><Compass size={15} />Discover</Link></Button>
        </div>
      </PlanTabs> : null
  } else if (selectedSlug && !creating && !editing && !celebrating && !detailError && active) {
    const steps = ready ? stepsOf(detail) : null
    const done = steps ? steps.filter((item: any) => item.progress?.status === 'completed').length : active.completed_objective_count || 0
    const header = <div data-plan="" style={planVars(getPlanColor(active.plan_uuid))} className="h-full">
      <PlanHeaderCard detail={active} done={done} total={steps ? steps.length : active.objective_count || 0} pending={!ready}
        actions={ready ? <PlanHeaderActions orgslug={orgslug} detail={detail} token={token} refresh={refresh} onBack={clear} onEdit={canEdit(detail) ? () => setEditingPlan(true) : undefined} /> : null} />
    </div>
    strip = <PlanCarousel plans={stripPlans} activeUuid={active.plan_uuid} getPlanColor={getPlanColor} choose={choose} onIntent={prefetch}>{header}</PlanCarousel>
  } else if (selectedSlug && !creating && !detailError && !ready) {
    strip = <Skeleton className="h-52 rounded-3xl" />
  }

  let content: React.ReactNode
  if (creating) content = <CreatePlanEditor token={token} refresh={refresh} onCancel={(text?: string) => { setCreating(false); if (text) continueRun(`[[hub-session-event]] You cancelled the new plan\n${text}`) }} onCreated={onCreated} />
  else if (!selectedSlug) content = plansError ? failed('Your plans could not load.', () => void retryPlans()) : isLoading ? <WeekSkeleton /> : <PlansHome orgslug={orgslug} token={token} plans={plans} completed={completedPlans} invitations={invitations} completedError={Boolean(completedError)} retryCompleted={() => void retryCompleted()} refresh={refresh} choose={choose} creating={quickCreateBusy} getPlanColor={getPlanColor} onCreate={() => void quickCreate()} renderObjective={(item) => renderObjective(item)} />
  else if (detailError) content = failed('This plan could not load. It may no longer be available to you.', () => void retryDetail())
  else {
    // Opening a plan: the header is already up; its steps fade in where the placeholder was.
    let body: React.ReactNode = null
    if (!ready) { /* the placeholder shows until it arrives */ }
    else if (editing) body = <PlanEditMode detail={detail} orgslug={orgslug} token={token} viewerUserId={viewerUserId} refresh={refresh} color={getPlanColor(detail.plan_uuid)} setPlanColor={detail.is_mine ? setPlanColor : undefined} focusGoal={editDetails} onDone={finishEditing} selectedObjectiveUuid={selectedObjectiveUuid} setSelectedObjectiveUuid={setSelectedObjectiveUuid} />
    else if (celebrating) body = <PlanComplete detail={detail} color={getPlanColor(detail.plan_uuid)} token={token} onDone={() => { clear(); void refresh() }} onView={() => void refresh()} />
    else if (detail.is_mine) body = <PlanView orgslug={orgslug} detail={detail} getPlanColor={getPlanColor} onEdit={canEdit(detail) ? () => setEditingPlan(true) : undefined} renderObjective={(item) => renderObjective(item, getPlanColor(detail.plan_uuid))} />
    else body = <div data-plan="" style={planVars(getPlanColor(detail.plan_uuid))}><PlanStepsEditor detail={detail} orgslug={orgslug} token={token} viewerUserId={viewerUserId} refresh={refresh} color={getPlanColor(detail.plan_uuid)} selectedObjectiveUuid={selectedObjectiveUuid} setSelectedObjectiveUuid={setSelectedObjectiveUuid} /></div>
    content = <Reveal ready={ready} fallback={<PlanViewSkeleton />}>{body}</Reveal>
  }

  return <GeneralWrapperStyled>
    <main className="pb-16">
      {selectedSlug || creating
        ? <ContentPageHeader orgslug={orgslug} backLabel="Overview" onBack={clear} compactBottomMargin title={creating ? 'New plan' : editing ? 'Edit plan' : undefined} />
        : <h1 className="pb-4 pt-2 text-3xl font-extrabold tracking-tight">Overview</h1>}
      <LayoutGroup id="plans">
        {strip}
        <div className="relative mt-8 overflow-x-clip">
          <AnimatePresence initial={false} mode="popLayout" custom={motionState}>
            <motion.div key={viewKey} custom={motionState} variants={swipe} initial="enter" animate="center" exit="exit">
              {content}
            </motion.div>
          </AnimatePresence>
        </div>
      </LayoutGroup>
    </main>
  </GeneralWrapperStyled>
}

function SignedOut({ orgslug }: { orgslug: string }) {
  const next = encodeURIComponent(getUriWithOrg(orgslug, '/plans'))
  return <GeneralWrapperStyled><div className="py-24 text-center">
    <h1 className="text-3xl font-extrabold">Sign in to use Plans</h1>
    <p className="mx-auto mt-3 max-w-md text-sm text-muted-foreground">Use the email that received your invitation. New here? Create an account and your pending plan will be waiting.</p>
    <div className="mt-6 flex justify-center gap-3">
      <Button asChild variant="brand"><Link href={`/login?next=${next}`}>Sign in</Link></Button>
      <Button asChild variant="surface"><Link href={`/signup?next=${next}`}>Create account</Link></Button>
    </div>
  </div></GeneralWrapperStyled>
}
