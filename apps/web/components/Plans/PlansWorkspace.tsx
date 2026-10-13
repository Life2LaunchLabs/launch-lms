'use client'

import React from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import useSWR, { mutate } from 'swr'
import toast from 'react-hot-toast'
import { Loader2, Plus } from 'lucide-react'
import { useHub } from '@components/Hub/HubContext'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { useOrg } from '@components/Contexts/OrgContext'
import GeneralWrapperStyled from '@components/Objects/StyledElements/Wrappers/GeneralWrapper'
import ContentPageHeader from '@components/Objects/StyledElements/Headers/ContentPageHeader'
import { Button } from '@components/ui/button'
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
import PlansHome from './learner/PlansHome'
import PlanView from './learner/PlanView'
import PlanComplete from './learner/PlanComplete'
import PlanHeaderActions from './learner/PlanHeaderActions'
import { PlanHeaderCard } from './learner/PlanHeader'
import { planVars } from './learner/planColors'
import usePlanColors from './learner/usePlanColors'
import useQuickCreatePlan from './learner/useQuickCreatePlan'

const plansKey = (lifecycle: PlanLifecycle) => `${getAPIUrl()}planning/plans?lifecycle=${lifecycle}`
const invitesKey = () => `${getAPIUrl()}planning/invitations/me`
const detailKey = (slug?: string) => slug ? `${getAPIUrl()}planning/plans/${encodeURIComponent(slug)}` : null
const EMPTY_PLANS: PlanTarget[] = []
const canEdit = (plan: any) => ['edit_plan_details', 'edit_structure', 'edit_schedule'].some((capability) => plan.capabilities?.includes(capability))

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
  const { data: invitations = [] } = useSWR<any[]>(token ? invitesKey() : null, (url: string) => swrFetcher(url, token), { revalidateOnFocus: true })
  const colorPlans = React.useMemo(() => [...plans, ...completedPlans], [plans, completedPlans])
  const { getPlanColor, setPlanColor } = usePlanColors(colorPlans, viewerUserId)
  const ownPlans = React.useMemo(() => plans.filter((plan) => plan.target_kind === 'individual' && plan.is_mine !== false), [plans])

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

  if (!token && session?.status !== 'loading') return <SignedOut orgslug={orgslug} />

  const loading = <div className="flex min-h-[45vh] items-center justify-center"><Loader2 className="animate-spin text-muted-foreground" /></div>
  const failed = (message: string, retry: () => void) => <div className="mt-6 rounded-2xl border-2 border-border bg-card p-5" role="alert"><p className="text-sm">{message}</p><Button variant="surface" className="mt-3" onClick={retry}>Try again</Button></div>
  const editing = Boolean(detail) && (editingPlan || editDetails) && canEdit(detail)

  let content: React.ReactNode
  if (creating) content = <CreatePlanEditor token={token} refresh={refresh} onCancel={(text?: string) => { setCreating(false); if (text) continueRun(`[[hub-session-event]] You cancelled the new plan\n${text}`) }} onCreated={onCreated} />
  else if (!selectedSlug) content = plansError ? failed('Your plans could not load.', () => void retryPlans()) : isLoading ? loading : <PlansHome orgslug={orgslug} token={token} plans={plans} completed={completedPlans} invitations={invitations} completedError={Boolean(completedError)} retryCompleted={() => void retryCompleted()} refresh={refresh} choose={choose} creating={quickCreateBusy} getPlanColor={getPlanColor} onCreate={() => void quickCreate()} renderObjective={(item) => renderObjective(item)} />
  else if (detailError) content = failed('This plan could not load. It may no longer be available to you.', () => void retryDetail())
  else if (!detail || detail.slug !== selectedSlug || detail.source_assignment?.type === 'group') content = loading
  else if (editing) content = <PlanEditMode detail={detail} orgslug={orgslug} token={token} viewerUserId={viewerUserId} refresh={refresh} color={getPlanColor(detail.plan_uuid)} setPlanColor={detail.is_mine ? setPlanColor : undefined} focusGoal={editDetails} onDone={finishEditing} selectedObjectiveUuid={selectedObjectiveUuid} setSelectedObjectiveUuid={setSelectedObjectiveUuid} />
  else if (detail.is_mine && detail.celebration_pending) content = <PlanComplete detail={detail} color={getPlanColor(detail.plan_uuid)} token={token} onDone={() => { clear(); void refresh() }} onView={() => void refresh()} />
  else if (detail.is_mine) content = <PlanView orgslug={orgslug} detail={detail} token={token} refresh={refresh} onBack={clear} plans={ownPlans} getPlanColor={getPlanColor} choose={choose} onEdit={canEdit(detail) ? () => setEditingPlan(true) : undefined} renderObjective={(item) => renderObjective(item, getPlanColor(detail.plan_uuid))} />
  else content = <HelpingView detail={detail} orgslug={orgslug} token={token} viewerUserId={viewerUserId} refresh={refresh} color={getPlanColor(detail.plan_uuid)} onBack={clear} onEdit={canEdit(detail) ? () => setEditingPlan(true) : undefined} selectedObjectiveUuid={selectedObjectiveUuid} setSelectedObjectiveUuid={setSelectedObjectiveUuid} />

  return <GeneralWrapperStyled>
    <main className="pb-16">
      {selectedSlug || creating
        ? <ContentPageHeader orgslug={orgslug} backLabel="Plans" onBack={clear} compactBottomMargin title={creating ? 'New plan' : editing ? 'Edit plan' : undefined} />
        : <div className="flex items-center justify-between gap-3 pt-2"><h1 className="text-3xl font-extrabold tracking-tight">Plans</h1><Button type="button" variant="brand" size="sm" onClick={() => void quickCreate()} disabled={quickCreateBusy}><Plus size={16} />New plan</Button></div>}
      {content}
    </main>
  </GeneralWrapperStyled>
}

/** A plan someone shared with the viewer to help with: its header, then its steps to review and sign off. */
// eslint-disable-next-line no-unused-vars
function HelpingView({ detail, orgslug, token, viewerUserId, refresh, color, onBack, onEdit, selectedObjectiveUuid, setSelectedObjectiveUuid }: { detail: any; orgslug: string; token?: string; viewerUserId?: number; refresh: () => Promise<unknown>; color: string; onBack: () => void; onEdit?: () => void; selectedObjectiveUuid: string; setSelectedObjectiveUuid: (uuid: string) => void }) {
  const steps = detail.objectives || detail.phases?.flatMap((phase: any) => phase.objectives || []) || []
  const done = steps.filter((item: any) => item.progress?.status === 'completed').length
  return <div data-plan="" style={planVars(color)} className="flex flex-col gap-8">
    <PlanHeaderCard detail={detail} done={done} total={steps.length} actions={<PlanHeaderActions orgslug={orgslug} detail={detail} token={token} refresh={refresh} onBack={onBack} onEdit={onEdit} />} />
    <PlanStepsEditor detail={detail} orgslug={orgslug} token={token} viewerUserId={viewerUserId} refresh={refresh} color={color} selectedObjectiveUuid={selectedObjectiveUuid} setSelectedObjectiveUuid={setSelectedObjectiveUuid} />
  </div>
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
