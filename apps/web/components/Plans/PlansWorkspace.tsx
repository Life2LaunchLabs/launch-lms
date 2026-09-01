'use client'

import React from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import useSWR, { mutate } from 'swr'
import { DragDropContext, Draggable, Droppable, type DropResult } from '@hello-pangea/dnd'
import toast from 'react-hot-toast'
import { ArrowLeft, Award, CalendarDays, Check, ChevronDown, ChevronRight, Compass, FileText, Film, GripVertical, Image as ImageIcon, Link2, Loader2, Lock, LogOut, Menu, MoreVertical, Pencil, Plus, RotateCcw, Sparkles, SquareCheck, Target, Trash2, Upload, X, Zap } from 'lucide-react'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import GeneralWrapperStyled from '@components/Objects/StyledElements/Wrappers/GeneralWrapper'
import Modal from '@components/Objects/StyledElements/Modal/Modal'
import { planningApi, type PlanLifecycle, type PlanScope } from '@services/planning/planning'
import { getLearningBadges } from '@services/learning/learning'
import { getAPIUrl, getUriWithOrg } from '@services/config/config'
import { swrFetcher } from '@services/utils/ts/requests'
import { getUserAvatarMediaDirectory, normalizeMediaUrl } from '@services/media/media'
import { cn } from '@/lib/utils'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@components/ui/dropdown-menu'
import MediaPickerDialog from '@components/Objects/Media/MediaPickerDialog'
import { DiscussionEditor } from '@components/Objects/Communities/DiscussionEditor'
import type { MediaAsset, MediaType } from '@services/media/library'

const plansKey = (lifecycle: PlanLifecycle) => `${getAPIUrl()}planning/plans?lifecycle=${lifecycle}`
const invitesKey = () => `${getAPIUrl()}planning/invitations/me`
const feedKey = (scope: PlanScope, planUuid?: string, exploreAll = false) => `${getAPIUrl()}planning/feed?scope=${scope}${planUuid ? `&plan_uuid=${encodeURIComponent(planUuid)}` : ''}${exploreAll ? '&explore_all=true' : ''}`
const detailKey = (slug?: string) => slug ? `${getAPIUrl()}planning/plans/${encodeURIComponent(slug)}` : null
const PLAN_COLORS = ['#7c3aed', '#0f9f9a', '#d97706', '#2563eb', '#db2777', '#65a30d', '#dc2626', '#0891b2']

function fallbackPlanColor(planUuid = '') {
  const hash = Array.from(planUuid).reduce((total, char) => ((total * 31) + char.charCodeAt(0)) >>> 0, 0)
  return PLAN_COLORS[hash % PLAN_COLORS.length]
}

function usePlanColors(plans: any[], viewerId: string | number | undefined) {
  const storageKey = `launchlms:plan-colors:${viewerId || 'viewer'}`
  const [colors, setColors] = React.useState<Record<string, string>>({})

  React.useEffect(() => {
    try { setColors(JSON.parse(window.localStorage.getItem(storageKey) || '{}')) } catch { setColors({}) }
  }, [storageKey])

  React.useEffect(() => {
    if (!plans.length) return
    setColors((current) => {
      const next = { ...current }
      const used = new Set(Object.values(next))
      let changed = false
      for (const plan of plans) {
        if (next[plan.plan_uuid]) continue
        next[plan.plan_uuid] = PLAN_COLORS.find((color) => !used.has(color)) || fallbackPlanColor(plan.plan_uuid)
        used.add(next[plan.plan_uuid])
        changed = true
      }
      if (changed) window.localStorage.setItem(storageKey, JSON.stringify(next))
      return changed ? next : current
    })
  }, [plans, storageKey])

  const setPlanColor = (planUuid: string, color: string) => setColors((current) => {
    const next = { ...current, [planUuid]: color }
    window.localStorage.setItem(storageKey, JSON.stringify(next))
    return next
  })
  return { getPlanColor: (planUuid?: string) => colors[planUuid || ''] || fallbackPlanColor(planUuid), setPlanColor }
}

export default function PlansWorkspace({ orgslug, initialPlanSlug }: { orgslug: string; initialPlanSlug?: string }) {
  const session = useLHSession() as any
  const token = session?.data?.tokens?.access_token
  const [lifecycle, setLifecycle] = React.useState<PlanLifecycle>('active')
  const [scope, setScope] = React.useState<PlanScope>('all')
  const [selectedSlug, setSelectedSlug] = React.useState(initialPlanSlug || '')
  const [mobilePanel, setMobilePanel] = React.useState(false)
  const [createOpen, setCreateOpen] = React.useState(false)
  const exploreAll = false
  const [selectedObjectiveUuid, setSelectedObjectiveUuid] = React.useState('')
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => setMounted(true), [])
  const { data: plans = [], isLoading } = useSWR<any[]>(token ? plansKey(lifecycle) : null, (url: string) => swrFetcher(url, token), { revalidateOnFocus: true })
  const { getPlanColor, setPlanColor } = usePlanColors(plans, session?.data?.user?.id)
  const selectedSummary = plans.find((plan: any) => plan.slug === selectedSlug)
  const { data: detail } = useSWR<any>(token && selectedSlug ? detailKey(selectedSlug) : null, (url: string) => swrFetcher(url, token))
  const { data: invitations = [] } = useSWR<any[]>(token ? invitesKey() : null, (url: string) => swrFetcher(url, token), { revalidateOnFocus: true })
  const { data: feed, isLoading: feedLoading } = useSWR<any>(token ? feedKey(scope, selectedSummary?.plan_uuid || detail?.plan_uuid, exploreAll) : null, (url: string) => swrFetcher(url, token), { revalidateOnFocus: true })

  const refresh = async () => {
    await mutate((key: unknown) => typeof key === 'string' && key.includes(`${getAPIUrl()}planning`))
  }
  const choose = (plan: any) => {
    setSelectedSlug(plan.slug)
    setSelectedObjectiveUuid('')
    window.history.pushState({}, '', getUriWithOrg(orgslug, `/plans/${encodeURIComponent(plan.slug)}`))
    setMobilePanel(false)
  }
  const clear = () => {
    setSelectedSlug('')
    setSelectedObjectiveUuid('')
    window.history.pushState({}, '', getUriWithOrg(orgslug, '/plans'))
  }
  const panel = <PlansPanel2
    lifecycle={lifecycle} setLifecycle={setLifecycle} plans={plans} invitations={invitations}
    detail={detail} selectedSlug={selectedSlug} choose={choose} clear={clear} refresh={refresh}
    token={token} onCreate={() => setCreateOpen(true)} onCloseMobile={() => setMobilePanel(false)}
    getPlanColor={getPlanColor} setPlanColor={setPlanColor}
    selectedObjectiveUuid={selectedObjectiveUuid} setSelectedObjectiveUuid={setSelectedObjectiveUuid}
  />

  if (!token && session?.status !== 'loading') return <GeneralWrapperStyled><div className="py-24 text-center"><h1 className="text-3xl font-black">Sign in to use Plans</h1><p className="mx-auto mt-3 max-w-md text-sm text-muted-foreground">Use the email that received your invitation. New here? Create an account and your pending plan will be waiting.</p><div className="mt-6 flex justify-center gap-3"><Link href={`/login?next=${encodeURIComponent(getUriWithOrg(orgslug, '/plans'))}`} className="rounded-lg bg-foreground px-5 py-3 text-sm font-black text-background">Sign in</Link><Link href={`/signup?next=${encodeURIComponent(getUriWithOrg(orgslug, '/plans'))}`} className="rounded-lg border border-border px-5 py-3 text-sm font-black">Create account</Link></div></div></GeneralWrapperStyled>
  return <>
    <GeneralWrapperStyled>
      <main className="pb-20 pt-8">
        {selectedSlug && detail ? <SelectedPlanBar detail={detail} color={getPlanColor(detail.plan_uuid)} onClose={clear} onOpenPanel={() => setMobilePanel(true)} /> : <><header className="flex items-start justify-between gap-4"><h1 className="text-4xl font-black tracking-tight">Plans</h1><button type="button" onClick={() => setMobilePanel(true)} className="inline-flex h-10 items-center gap-2 rounded-lg border border-border px-3 text-xs font-black lg:hidden"><Menu size={16} />Plans</button></header>{feed?.has_helping ? <div className="mt-7 flex h-11 gap-1 rounded-xl bg-muted p-1 w-fit">{(['all', 'mine', 'helping'] as PlanScope[]).map((value) => <button key={value} onClick={() => setScope(value)} className={cn('rounded-lg px-4 py-2 text-xs font-black capitalize', scope === value ? 'bg-card shadow-sm' : 'text-muted-foreground')}>{value === 'mine' ? 'My plans' : value}</button>)}</div> : <div className="mt-7 h-11" />}</>}
        {isLoading || (selectedSlug ? !detail : feedLoading) ? <div className="flex min-h-[45vh] items-center justify-center"><Loader2 className="animate-spin text-muted-foreground" /></div> : selectedSlug && detail ? <PlanEditor detail={detail} orgslug={orgslug} token={token} viewerUserId={session?.data?.user?.id} refresh={refresh} color={getPlanColor(detail.plan_uuid)} selectedObjectiveUuid={selectedObjectiveUuid} setSelectedObjectiveUuid={setSelectedObjectiveUuid} /> : <Feed feed={feed} orgslug={orgslug} token={token} viewerUserId={session?.data?.user?.id} refresh={refresh} getPlanColor={getPlanColor} onCreate={() => setCreateOpen(true)} />}
      </main>
    </GeneralWrapperStyled>
    {mounted && document.getElementById('org-layout-right-sidebar') ? createPortal(<div className="sticky top-4 max-h-[calc(100dvh-2rem)] overflow-y-auto pb-6">{panel}</div>, document.getElementById('org-layout-right-sidebar')!) : null}
    {mobilePanel ? <div className="fixed inset-0 z-[var(--z-modal)] bg-black/35 lg:hidden" onClick={() => setMobilePanel(false)}><aside onClick={(event) => event.stopPropagation()} className="ml-auto h-full w-[min(92vw,360px)] overflow-y-auto bg-background p-4 shadow-2xl"><div className="mb-3 flex justify-end"><button onClick={() => setMobilePanel(false)} className="rounded-lg p-2 hover:bg-muted"><X size={18} /></button></div>{panel}</aside></div> : null}
    <CreatePlanModal open={createOpen} setOpen={setCreateOpen} token={token} refresh={refresh} onCreated={(plan: any) => choose(plan)} />
  </>
}

function SelectedPlanBar({ detail, color, onClose, onOpenPanel }: any) {
  const [open, setOpen] = React.useState(false)
  React.useEffect(() => { const frame = requestAnimationFrame(() => setOpen(true)); return () => cancelAnimationFrame(frame) }, [])
  return <div className="h-16 overflow-hidden rounded-2xl">
    <div className={cn('flex h-16 origin-left items-center overflow-hidden rounded-2xl px-5 text-white shadow-sm transition-[transform,opacity] duration-200 ease-out', open ? 'scale-x-100 opacity-100' : 'scale-x-0 opacity-0')} style={{ backgroundColor: color }}>
      <span className={cn('min-w-0 flex-1 truncate text-xl font-black tracking-tight transition-opacity delay-150 sm:text-2xl', open ? 'opacity-100' : 'opacity-0')}>{detail.name}</span>
      <button onClick={onOpenPanel} className="mr-2 flex h-8 items-center gap-1.5 rounded-full bg-black/15 px-3 text-[10px] font-black lg:hidden"><Menu size={14} />Details</button>
      <button onClick={onClose} aria-label="Close plan editor and return to all plans" className="ml-3 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-black/15 transition hover:bg-black/25"><X size={16} /></button>
    </div>
  </div>
}

function dateValue(value?: string) { return value ? String(value).slice(0, 10) : '' }
function isBeforeToday(value?: string) {
  if (!value) return false
  const today = new Date(); today.setHours(0, 0, 0, 0)
  return new Date(`${dateValue(value)}T00:00:00`).getTime() < today.getTime()
}

function PlanEditor({ detail, orgslug, token, viewerUserId, refresh, color, selectedObjectiveUuid, setSelectedObjectiveUuid }: any) {
  const canEdit = detail.capabilities.includes('edit_structure')
  const canSchedule = detail.capabilities.includes('edit_schedule')
  const [addingPhaseUuid, setAddingPhaseUuid] = React.useState<string | null>(null)
  const [newTitle, setNewTitle] = React.useState('')
  const [saving, setSaving] = React.useState(false)
  const [dragging, setDragging] = React.useState(false)
  const [newObjectiveUuid, setNewObjectiveUuid] = React.useState('')
  const [pendingMove, setPendingMove] = React.useState<any>(null)
  const phases = detail.phases || []
  const allObjectives = detail.objectives || phases.flatMap((phase: any) => phase.objectives || [])
  const phaseByObjective = new Map<string, any>(phases.flatMap((phase: any) => (phase.objectives || []).map((objective: any) => [objective.objective_uuid, phase] as [string, any])))
  const phaseDue = (phase: any) => phase?.effective_due_date || phase?.due_date || detail.due_date
  const isComplete = (objective: any) => objective.progress?.status === 'completed'
  const overdue = allObjectives.filter((objective: any) => !isComplete(objective) && isBeforeToday(objective.due_date || phaseDue(phaseByObjective.get(objective.objective_uuid))))
  const overdueIds = new Set(overdue.map((objective: any) => objective.objective_uuid))
  const currentPhases = phases.filter((phase: any) => !isBeforeToday(phaseDue(phase)))
  const completedFromPast = allObjectives.filter((objective: any) => isComplete(objective) && isBeforeToday(phaseDue(phaseByObjective.get(objective.objective_uuid))))

  const addObjective = async (phaseUuid: string | null) => {
    if (!newTitle.trim()) return
    setSaving(true)
    try {
      const updated = await planningApi.addObjective(detail.slug, { title: newTitle.trim(), phase_uuid: phaseUuid }, token)
      const created = updated.objectives?.at(-1)
      setNewTitle(''); setAddingPhaseUuid(null); await refresh()
      if (created) { setSelectedObjectiveUuid(created.objective_uuid); setNewObjectiveUuid(created.objective_uuid) }
      toast.success('Objective added.')
    } catch (error: any) { toast.error(error?.message || 'Could not add objective.') } finally { setSaving(false) }
  }

  const persistMove = async (objective: any, phaseUuid: string | null, targetIndex: number, removeDate: boolean) => {
    const desired = allObjectives.filter((item: any) => item.objective_uuid !== objective.objective_uuid)
    desired.splice(Math.max(0, Math.min(targetIndex, desired.length)), 0, objective)
    setSaving(true)
    try {
      await Promise.all(desired.map((item: any, position: number) => planningApi.updateObjective(detail.slug, item.objective_uuid, {
        position,
        ...(item.objective_uuid === objective.objective_uuid ? { phase_uuid: phaseUuid, ...(removeDate ? { due_date: null } : {}) } : {}),
      }, token)))
      await refresh(); toast.success('Objective moved.')
    } catch (error: any) { toast.error(error?.message || 'Could not move objective.') } finally { setSaving(false) }
  }

  const onDragEnd = (result: DropResult) => {
    if (!result.destination) return
    if (result.source.droppableId === result.destination.droppableId && result.source.index === result.destination.index) return
    const objective = allObjectives.find((item: any) => item.objective_uuid === result.draggableId)
    if (!objective) return
    const [, destinationPhaseKey, destinationZone] = result.destination.droppableId.split(':')
    if (destinationZone === 'dated') return
    let phaseUuid: string | null = destinationPhaseKey === 'none' ? null : destinationPhaseKey
    if (phaseUuid === 'right-now' || phaseUuid === 'completed') phaseUuid = phaseByObjective.get(objective.objective_uuid)?.phase_uuid || null
    const destinationPhase = phases.find((phase: any) => phase.phase_uuid === phaseUuid)
    const destinationPool = destinationPhaseKey === 'right-now' ? overdue : destinationPhaseKey === 'completed' ? completedFromPast : (destinationPhase?.objectives || allObjectives).filter((item: any) => !overdueIds.has(item.objective_uuid))
    const destinationItems = destinationPool.filter((item: any) => (destinationZone === 'dated') === Boolean(item.due_date) && item.objective_uuid !== objective.objective_uuid)
    const targetUuid = destinationItems[result.destination.index]?.objective_uuid
    const lastDestinationUuid = destinationItems.at(-1)?.objective_uuid
    const targetIndex = targetUuid ? allObjectives.findIndex((item: any) => item.objective_uuid === targetUuid) : lastDestinationUuid ? allObjectives.findIndex((item: any) => item.objective_uuid === lastDestinationUuid) + 1 : allObjectives.length
    if (destinationZone === 'flex' && objective.due_date) {
      if (!canSchedule) { toast.error('You do not have permission to remove this target date.'); return }
      setPendingMove({ objective, phaseUuid, targetIndex })
      return
    }
    void persistMove(objective, phaseUuid, targetIndex, false)
  }

  const renderSection = (title: string, phase: any, objectives: any[], subtitle?: string, accent = false) => {
    const isVirtualSection = phase?.phase_uuid === 'right-now' || phase?.phase_uuid === 'completed'
    const addPhaseUuid = isVirtualSection ? (currentPhases[0]?.phase_uuid || phases[0]?.phase_uuid || null) : (phase?.phase_uuid || null)
    const dated = objectives.filter((objective: any) => objective.due_date)
    const unscheduled = objectives.filter((objective: any) => !objective.due_date)
    const phaseKey = phase?.phase_uuid || 'none'
    const objectiveItem = (objective: any) => ({ ...objective, plan: { plan_uuid: detail.plan_uuid, slug: detail.slug, name: detail.name }, subject: detail.subject, is_mine: detail.is_mine })
    const zone = (items: any[], kind: 'dated' | 'flex') => <Droppable droppableId={`plan-zone:${phaseKey}:${kind}`} isDropDisabled={!canEdit || kind === 'dated'}>
      {(provided, snapshot) => <div ref={provided.innerRef} {...provided.droppableProps} className={cn('min-h-3 rounded-lg transition-[background-color,box-shadow,min-height] duration-150', dragging && 'min-h-12 ring-1 ring-dashed ring-violet-200', snapshot.isDraggingOver && 'bg-violet-50/80 ring-2 ring-solid ring-violet-300')}>
        {items.map((objective: any, index: number) => <Draggable key={objective.objective_uuid} draggableId={objective.objective_uuid} index={index} isDragDisabled={!canEdit}>
          {(dragProvided, dragSnapshot) => <div ref={dragProvided.innerRef} {...dragProvided.draggableProps} data-objective-shell={objective.objective_uuid} style={{ ...dragProvided.draggableProps.style, zIndex: dragSnapshot.isDragging ? 70 : undefined }} className="flex items-stretch"><button type="button" aria-label="Drag objective" {...dragProvided.dragHandleProps} className={cn('flex w-8 shrink-0 cursor-grab items-start justify-center rounded-lg pt-5 text-muted-foreground/50 hover:bg-muted hover:text-muted-foreground', !canEdit && 'invisible')}><GripVertical size={15} /></button><div className={cn('min-w-0 flex-1 rounded-xl', dragSnapshot.isDragging && 'bg-card shadow-xl ring-2 ring-violet-200')}><ObjectiveCard item={objectiveItem(objective)} orgslug={orgslug} token={token} viewerUserId={viewerUserId} refresh={refresh} color={color} editorMode detail={detail} expanded={selectedObjectiveUuid === objective.objective_uuid} startEditing={newObjectiveUuid === objective.objective_uuid} onStartedEditing={() => setNewObjectiveUuid('')} onExpandedChange={(open: boolean) => setSelectedObjectiveUuid(open ? objective.objective_uuid : '')} /></div></div>}
        </Draggable>)}
        {provided.placeholder}
      </div>}
    </Droppable>
    return <EditorSection key={phaseKey} title={title} subtitle={subtitle} accent={accent} phase={isVirtualSection ? null : phase} detail={detail} token={token} refresh={refresh} canEdit={canEdit} canSchedule={canSchedule}>
      <div className="space-y-1">
        {zone(dated, 'dated')}
        {dated.length && unscheduled.length ? <div className="mx-5 h-px bg-border/60" /> : null}
        {zone(unscheduled, 'flex')}
        {!objectives.length ? <p className="px-1 py-4 text-xs text-muted-foreground">Nothing here yet.</p> : null}
      </div>
      {canEdit && phase?.phase_uuid !== 'completed' ? <InlineObjectiveAdder phaseUuid={addPhaseUuid} open={addingPhaseUuid === (phase?.phase_uuid || 'none')} setOpen={(open: boolean) => setAddingPhaseUuid(open ? (phase?.phase_uuid || 'none') : null)} title={newTitle} setTitle={setNewTitle} saving={saving} onAdd={addObjective} /> : null}
    </EditorSection>
  }

  if (!allObjectives.length) return <div className="mt-10 rounded-2xl border border-dashed border-border py-16 text-center"><Target className="mx-auto text-muted-foreground" size={40} /><h2 className="mt-4 text-xl font-black">What is the first step?</h2><p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">Add an objective to turn this plan into something you can act on.</p>{canEdit ? <button onClick={() => setAddingPhaseUuid(phases[0]?.phase_uuid || 'none')} className="mt-5 inline-flex items-center gap-2 rounded-lg bg-foreground px-4 py-3 text-sm font-black text-background"><Plus size={16} />Add an objective</button> : null}{addingPhaseUuid ? <div className="mx-auto mt-4 max-w-md"><InlineObjectiveAdder phaseUuid={phases[0]?.phase_uuid || null} open setOpen={(open: boolean) => !open && setAddingPhaseUuid(null)} title={newTitle} setTitle={setNewTitle} saving={saving} onAdd={addObjective} /></div> : null}</div>

  return <DragDropContext onDragStart={() => setDragging(true)} onDragEnd={(result) => { setDragging(false); onDragEnd(result) }}><div className="mt-9 space-y-10">
    {overdue.length ? renderSection('Right now', { phase_uuid: 'right-now' }, overdue, `${overdue.length} overdue ${overdue.length === 1 ? 'objective' : 'objectives'}`, true) : null}
    {currentPhases.map((phase: any) => renderSection(phase.name, phase, (phase.objectives || []).filter((objective: any) => !overdueIds.has(objective.objective_uuid)), `Phase ends ${new Date(`${dateValue(phaseDue(phase))}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}${!phase.due_date ? ' · plan target' : ''}`))}
    {completedFromPast.length ? renderSection('Completed', { phase_uuid: 'completed' }, completedFromPast, 'Finished work from earlier phases') : null}
    {pendingMove ? <div role="alertdialog" className="fixed bottom-6 left-1/2 z-[var(--z-modal)] w-[min(92vw,420px)] -translate-x-1/2 rounded-2xl border border-border bg-card p-4 shadow-2xl"><p className="text-sm font-black">Remove target date {new Date(`${dateValue(pendingMove.objective.due_date)}T12:00:00`).toLocaleDateString()}?</p><p className="mt-1 text-xs text-muted-foreground">Dropping into the phase’s flexible area means this objective will use the phase deadline.</p><div className="mt-4 flex justify-end gap-2"><button onClick={() => setPendingMove(null)} className="rounded-lg border border-border px-3 py-2 text-xs font-black">Cancel</button><button onClick={() => { const move = pendingMove; setPendingMove(null); void persistMove(move.objective, move.phaseUuid, move.targetIndex, true) }} className="rounded-lg bg-foreground px-3 py-2 text-xs font-black text-background">Remove date & move</button></div></div> : null}
  </div></DragDropContext>
}

function EditorSection({ title, subtitle, accent, phase, detail, token, refresh, canEdit, canSchedule, children }: any) {
  return <section id={phase ? `plan-phase-${phase.phase_uuid}` : undefined}><PhaseSectionHeader title={title} subtitle={subtitle} accent={accent} phase={phase} detail={detail} token={token} refresh={refresh} canEdit={canEdit} canSchedule={canSchedule} />{children}</section>
}

function PhaseSectionHeader({ title, subtitle, accent, phase, detail, token, refresh, canEdit, canSchedule }: any) {
  const [editing, setEditing] = React.useState(false)
  const [draft, setDraft] = React.useState({ name: title, due_date: dateValue(phase?.due_date) })
  const [saving, setSaving] = React.useState(false)
  React.useEffect(() => setDraft({ name: title, due_date: dateValue(phase?.due_date) }), [title, phase?.due_date])
  const save = async () => {
    if (!phase || !draft.name.trim()) return
    setSaving(true)
    try { await planningApi.updatePhase(detail.slug, phase.phase_uuid, { ...(canEdit ? { name: draft.name.trim() } : {}), ...(canSchedule ? { due_date: draft.due_date || null } : {}) }, token); await refresh(); setEditing(false); toast.success('Phase updated.') } catch (error: any) { toast.error(error?.message || 'Could not update phase.') } finally { setSaving(false) }
  }
  if (editing) return <div className="mb-3 flex items-center gap-2 rounded-xl bg-muted/60 px-3 py-2"><input autoFocus value={draft.name} disabled={!canEdit} onChange={(event) => setDraft({ ...draft, name: event.target.value })} className={cn(inlineEditableClass, 'min-w-0 flex-1 text-sm font-black uppercase tracking-[0.12em]')} />{canSchedule ? <input type="date" aria-label={`${title} completion date`} value={draft.due_date} onChange={(event) => setDraft({ ...draft, due_date: event.target.value })} className="h-8 rounded-lg border border-border bg-card px-2 text-[10px]" /> : null}<button type="button" onClick={() => setEditing(false)} className="rounded p-1.5 text-muted-foreground"><X size={13} /></button><button type="button" disabled={saving || !draft.name.trim()} onClick={() => void save()} className="rounded-lg bg-foreground p-2 text-background disabled:opacity-40">{saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}</button></div>
  return <div className="group/phase mb-3 flex items-end gap-3"><h2 className={cn('text-sm font-black uppercase tracking-[0.12em]', accent && 'text-red-700')}>{title}</h2>{subtitle ? <p className="pb-px text-xs text-muted-foreground">{subtitle}</p> : null}{phase && (canEdit || canSchedule) ? <button type="button" onClick={() => setEditing(true)} aria-label={`Edit ${title}`} className="mb-[-2px] rounded p-1.5 text-muted-foreground opacity-0 transition-opacity hover:bg-muted group-hover/phase:opacity-100 focus:opacity-100"><Pencil size={12} /></button> : null}</div>
}

function InlineObjectiveAdder({ phaseUuid, open, setOpen, title, setTitle, saving, onAdd }: any) {
  if (!open) return <button onClick={() => setOpen(true)} className="mt-2 inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-black text-muted-foreground transition hover:bg-muted hover:text-foreground"><Plus size={14} />Add objective</button>
  return <div className="mt-2 flex gap-2 rounded-xl border border-border bg-card p-2 shadow-sm"><input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void onAdd(phaseUuid); if (event.key === 'Escape') setOpen(false) }} placeholder="What needs to happen?" className="h-9 min-w-0 flex-1 bg-transparent px-2 text-sm outline-none" /><button onClick={() => setOpen(false)} aria-label="Cancel" className="rounded-lg p-2 text-muted-foreground"><X size={15} /></button><button disabled={saving || !title.trim()} onClick={() => void onAdd(phaseUuid)} className="rounded-lg bg-foreground px-3 text-xs font-black text-background disabled:opacity-40">Add</button></div>
}

function Feed({ feed, orgslug, token, viewerUserId, refresh, getPlanColor, onCreate }: any) {
  if (!feed) return null
  const hasItems = feed.coming_up?.length || feed.future_groups?.some((group: any) => group.items.length)
  if (!hasItems) return <div className="mt-10 rounded-2xl border border-dashed border-border py-20 text-center"><Compass className="mx-auto text-muted-foreground" size={42} /><h2 className="mt-4 text-xl font-black">Start with something that matters</h2><p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">Create a personal plan and shape it one step at a time.</p><button onClick={onCreate} className="mt-5 inline-flex items-center gap-2 rounded-lg bg-foreground px-4 py-3 text-sm font-black text-background"><Plus size={16} />Create a plan</button></div>
  return <div className="mt-9 space-y-10">
    {feed.coming_up?.length ? <FeedSection title="Right now" subtitle={`${feed.coming_up.length} ${feed.coming_up.length === 1 ? 'item needs' : 'items need'} your attention`} icon={<Zap size={18} />}><div className="divide-y divide-border border-y border-border">{feed.coming_up.map((item: any) => <ObjectiveCard key={`${item.plan.plan_uuid}-${item.objective_uuid}`} item={item} orgslug={orgslug} token={token} viewerUserId={viewerUserId} refresh={refresh} color={getPlanColor(item.plan.plan_uuid)} prominent />)}</div></FeedSection> : null}
    {(feed.future_groups || []).map((group: any) => <FeedSection key={group.key} title={group.label} icon={<CalendarDays size={18} />}><div className="divide-y divide-border border-y border-border">{group.items.map((item: any) => <ObjectiveCard key={`${item.plan.plan_uuid}-${item.objective_uuid}`} item={item} orgslug={orgslug} token={token} viewerUserId={viewerUserId} refresh={refresh} color={getPlanColor(item.plan.plan_uuid)} />)}</div></FeedSection>)}
  </div>
}

function FeedSection({ title, subtitle, icon, children }: { title: string; subtitle?: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return <section><div className="mb-3 flex items-center gap-2.5">{icon ? <span className="text-muted-foreground">{icon}</span> : null}<h2 className="text-sm font-black uppercase tracking-[0.12em]">{title}</h2>{subtitle ? <p className="text-xs text-muted-foreground">{subtitle}</p> : null}</div>{children}</section>
}

function targetDateLabel(value?: string) {
  if (!value) return ''
  const target = new Date(`${value}T12:00:00`)
  const today = new Date(); today.setHours(12, 0, 0, 0)
  const days = Math.round((target.getTime() - today.getTime()) / 86400000)
  if (days === 0) return 'today'
  if (days > 0 && days <= 30) return `in ${days} day${days === 1 ? '' : 's'}`
  if (days < 0) return `${Math.abs(days)} day${days === -1 ? '' : 's'} ago`
  return target.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function fieldKey(field: any) { return String(field.field_uuid || field.key || '') }
function hasFieldValue(value: any) { return typeof value === 'boolean' ? value : Array.isArray(value) ? value.length > 0 : value !== undefined && value !== null && String(value).trim() !== '' }

function ObjectiveProgressRing({ completed, total, color, locked = false }: { completed: number; total: number; color: string; locked?: boolean }) {
  const percent = total ? Math.round((completed / total) * 100) : 100
  const visiblePercent = percent === 0 ? 4 : percent
  return <span className="flex shrink-0 flex-col items-center gap-0.5"><span role="progressbar" aria-label={`${completed} of ${total} steps complete`} aria-valuemin={0} aria-valuemax={total} aria-valuenow={completed} className="relative h-7 w-7 rounded-full" style={{ background: `conic-gradient(${color} ${visiblePercent}%, hsl(var(--muted)) 0)` }}><span className="absolute inset-[3px] flex items-center justify-center rounded-full bg-card">{locked && percent === 100 ? <Lock size={9} className="text-muted-foreground" /> : null}</span></span><span className="text-[8px] font-black tabular-nums leading-none text-muted-foreground">{completed}/{total}</span></span>
}

function fieldIsRestricted(field: any) {
  const lane = String(field.access || field.lane || 'contributor')
  return field.restricted ?? ['reviewer', 'staff'].includes(lane)
}

function PersonAvatar({ user, size = 'sm' }: { user: any; size?: 'xs' | 'sm' | 'md' }) {
  const classes = size === 'md' ? 'h-9 w-9 text-xs' : size === 'xs' ? 'h-5 w-5 text-[8px]' : 'h-7 w-7 text-[9px]'
  const src = user?.avatar_image ? (String(user.avatar_image).startsWith('http') ? user.avatar_image : getUserAvatarMediaDirectory(user.user_uuid, user.avatar_image)) : ''
  return src ? <img src={src} alt="" className={cn('shrink-0 rounded-full object-cover', classes)} /> : <span className={cn('flex shrink-0 items-center justify-center rounded-full bg-foreground font-black text-background', classes)}>{String(user?.name || '?').split(/\s+/).slice(0, 2).map((word) => word[0]).join('').toUpperCase()}</span>
}

function AccessPeopleLine({ item, capability, unlocked }: { item: any; capability: string; unlocked: boolean }) {
  const [open, setOpen] = React.useState(false)
  const accessPeople = item.access_people || []
  const isEligible = (person: any) => person?.capabilities?.includes(capability) && (!capability.startsWith('contribute_') || person?.capabilities?.includes('update_progress'))
  const people = accessPeople.filter(isEligible)
  const subject = accessPeople.find((person: any) => person.is_subject)
  const roles = Array.from(new Set(people.map((person: any) => person.role?.name).filter(Boolean)))
  if (!accessPeople.some((person: any) => !person.is_subject)) return null
  if (unlocked) return <p className="mt-1.5 flex items-center gap-1.5 text-[9px] font-bold text-muted-foreground">{isEligible(subject) ? <Check size={10} /> : <Lock size={10} />}{isEligible(subject) ? `${item.subject?.name?.split(' ')[0] || 'The subject'} can do this too` : `${item.subject?.name?.split(' ')[0] || 'The subject'} needs help with this`}</p>
  return <div className="relative mt-1.5"><button type="button" onClick={() => setOpen(!open)} className="flex max-w-full items-center gap-2 text-left"><span className="flex -space-x-1.5">{people.slice(0, 3).map((person: any) => <span key={person.user?.id} className="rounded-full ring-2 ring-card"><PersonAvatar user={person.user} size="xs" /></span>)}{people.length > 3 ? <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[8px] font-black ring-2 ring-card">+{people.length - 3}</span> : null}</span><span className="truncate text-[9px] font-bold text-muted-foreground">{roles.length ? roles.join(', ') : 'No one assigned'} <ChevronDown size={9} className="inline" /></span></button>{open ? <div className="absolute left-0 top-full z-40 mt-1 w-56 rounded-xl border border-border bg-popover p-2 shadow-xl">{people.map((person: any) => <div key={person.user?.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5"><PersonAvatar user={person.user} /><span className="min-w-0"><span className="block truncate text-[10px] font-black">{person.user?.name}</span><span className="block text-[9px] text-muted-foreground">{person.role?.name}</span></span></div>)}{!people.length ? <p className="p-2 text-[10px] text-muted-foreground">No eligible collaborator assigned.</p> : null}</div> : null}</div>
}

function RequirementTypeIcon({ type, size = 15 }: { type?: string; size?: number }) {
  if (type === 'media') return <Upload size={size} />
  if (type === 'image') return <ImageIcon size={size} />
  if (type === 'link') return <Link2 size={size} />
  if (type === 'checkbox') return <SquareCheck size={size} />
  return <FileText size={size} />
}

// eslint-disable-next-line no-unused-vars
function StepPicker({ badges, onAdd, trigger }: { badges: any[]; onAdd: (type: string, options?: any) => void; trigger?: React.ReactNode }) {
  const [open, setOpen] = React.useState(false)
  const [view, setView] = React.useState<'root' | 'badge' | 'media'>('root')
  const [query, setQuery] = React.useState('')
  const [mediaTypes, setMediaTypes] = React.useState<MediaType[]>(['image', 'document'])
  React.useEffect(() => { if (!open) { setView('root'); setQuery(''); setMediaTypes(['image', 'document']) } }, [open])
  const filtered = badges.filter((badge: any) => String(badge.name || '').toLowerCase().includes(query.trim().toLowerCase()))
  const choose = (type: string, options?: any) => { onAdd(type, options); setOpen(false) }
  const toggleMedia = (type: MediaType) => setMediaTypes((current) => current.includes(type) ? current.filter((item) => item !== type) : [...current, type])
  return <DropdownMenu open={open} onOpenChange={setOpen}><DropdownMenuTrigger asChild>{trigger || <button type="button" className="flex h-11 items-center justify-center gap-1.5 rounded-xl border border-dashed border-border text-[10px] font-black text-muted-foreground hover:bg-muted"><Plus size={13} />New step</button>}</DropdownMenuTrigger><DropdownMenuContent align="start" className="w-auto min-w-52 max-w-[min(20rem,calc(100vw-2rem))] overflow-hidden p-1">
    {view === 'root' ? <div className="animate-in fade-in slide-in-from-left-2 duration-150"><DropdownMenuItem onClick={() => choose('text')}><FileText size={14} className="mr-2" />Note</DropdownMenuItem><DropdownMenuItem onSelect={(event) => { event.preventDefault(); setView('media') }}><Upload size={14} className="mr-2" /><span className="flex-1">Media</span><ChevronRight size={13} /></DropdownMenuItem><DropdownMenuItem onClick={() => choose('link')}><Link2 size={14} className="mr-2" />Links</DropdownMenuItem><DropdownMenuItem onClick={() => choose('checkbox')}><SquareCheck size={14} className="mr-2" />Checkbox</DropdownMenuItem><DropdownMenuItem onSelect={(event) => { event.preventDefault(); setView('badge') }}><Award size={14} className="mr-2" /><span className="flex-1">Badge</span><ChevronRight size={13} /></DropdownMenuItem></div> : null}
    {view === 'badge' ? <div className="w-64 animate-in fade-in slide-in-from-right-3 duration-150"><div className="flex items-center gap-1 border-b border-border p-1"><button type="button" onClick={() => setView('root')} className="rounded p-1.5 text-muted-foreground hover:bg-muted"><ArrowLeft size={14} /></button><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a badge…" className="h-8 min-w-0 flex-1 bg-transparent px-1 text-xs outline-none" /></div><div className="max-h-64 overflow-y-auto pt-1">{filtered.map((badge: any) => <DropdownMenuItem key={badge.badge_uuid} onClick={() => choose('badge', badge)}><span className="mr-2 flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">{badge.thumbnail_image ? <img src={normalizeMediaUrl(badge.thumbnail_image)} alt="" className="h-full w-full object-cover" /> : <Award size={13} />}</span><span className="truncate">{badge.name}</span></DropdownMenuItem>)}{!filtered.length ? <p className="p-3 text-center text-[10px] text-muted-foreground">No badges found.</p> : null}</div></div> : null}
    {view === 'media' ? <div className="w-60 animate-in fade-in slide-in-from-right-3 duration-150"><div className="flex items-center gap-2 border-b border-border px-1 pb-2"><button type="button" onClick={() => setView('root')} className="rounded p-1.5 text-muted-foreground hover:bg-muted"><ArrowLeft size={14} /></button><span className="text-xs font-black">Acceptable media</span></div><div className="space-y-1 py-2">{([['image', 'Images', <ImageIcon key="image" size={14} />], ['video', 'Video', <Film key="video" size={14} />], ['document', 'Documents (PDF)', <FileText key="document" size={14} />]] as const).map(([type, label, icon]) => <button key={type} type="button" onClick={() => toggleMedia(type)} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-xs hover:bg-muted">{icon}<span className="flex-1">{label}</span><span className={cn('flex h-4 w-4 items-center justify-center rounded border', mediaTypes.includes(type) && 'bg-foreground text-background')}>{mediaTypes.includes(type) ? <Check size={11} /> : null}</span></button>)}</div><button type="button" disabled={!mediaTypes.length} onClick={() => choose('media', { allowed_types: mediaTypes })} className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-foreground px-3 py-2 text-[10px] font-black text-background disabled:opacity-40"><Check size={12} />Confirm</button></div> : null}
  </DropdownMenuContent></DropdownMenu>
}

const inlineEditableClass = 'border-b border-dashed border-foreground/35 bg-transparent outline-none transition-colors focus:border-foreground'

function ObjectiveCard({ item, orgslug, token, viewerUserId, refresh, color, editorMode = false, detail, expanded, onExpandedChange, startEditing = false, onStartedEditing }: any) {
  const cardRef = React.useRef<HTMLElement>(null)
  const [internalOpen, setInternalOpen] = React.useState(false)
  const open = expanded ?? internalOpen
  const setOpen = React.useCallback((value: boolean) => { setInternalOpen(value); onExpandedChange?.(value) }, [onExpandedChange])
  const [descriptionOpen, setDescriptionOpen] = React.useState(false)
  const [activeField, setActiveField] = React.useState('')
  const [noteField, setNoteField] = React.useState<any>(null)
  const [noteDraft, setNoteDraft] = React.useState<any>('')
  const [linksField, setLinksField] = React.useState<any>(null)
  const [linkDrafts, setLinkDrafts] = React.useState<string[]>([''])
  const [mediaField, setMediaField] = React.useState<any>(null)
  const [mediaType, setMediaType] = React.useState<MediaType | null>(null)
  const [fieldValues, setFieldValues] = React.useState<Record<string, any>>(item.progress?.field_values || {})
  const [editing, setEditing] = React.useState(false)
  const [draft, setDraft] = React.useState<any>(item)
  const [saving, setSaving] = React.useState(false)
  const { data: fetchedDetail } = useSWR<any>(editing && !detail && token ? detailKey(item.plan?.slug) : null, (url: string) => swrFetcher(url, token))
  const { data: badgeChoices = [] } = useSWR<any[]>(editing && token ? ['plan-requirement-badges', token] : null, async ([, accessToken]: [string, string]) => { const response = await getLearningBadges(undefined, accessToken); return Array.isArray(response) ? response : response?.data || [] })
  const fullDetail = detail || fetchedDetail
  React.useEffect(() => { setFieldValues(item.progress?.field_values || {}); setDraft({ ...item, phase_uuid: item.phase_uuid || '', phase_name: item.phase_name || '', due_date: dateValue(item.due_date) }) }, [item])
  React.useEffect(() => { if (startEditing) { setOpen(true); setEditing(true); onStartedEditing?.() } }, [startEditing, onStartedEditing, setOpen])
  React.useEffect(() => {
    if (!open || editing) return
    const closeOutside = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null
      if (cardRef.current?.contains(target) || target?.closest(`[data-objective-shell="${item.objective_uuid}"]`) || target?.closest('[role="menu"], [role="dialog"]')) return
      setOpen(false)
    }
    document.addEventListener('pointerdown', closeOutside)
    return () => document.removeEventListener('pointerdown', closeOutside)
  }, [open, editing, item.objective_uuid, setOpen])
  const status = item.progress?.status
  const supportingLocked = status === 'completed'
  const fields = item.fields || []
  const completeFields = fields.filter((field: any) => field.type === 'badge' ? Number(field.progress_percent || 0) >= 100 : hasFieldValue(fieldValues[fieldKey(field)])).length
  const stepPercent = fields.length ? Math.round((completeFields / fields.length) * 100) : 100
  const visibleStepPercent = stepPercent === 0 ? 3 : stepPercent
  const stepsReady = completeFields === fields.length
  const canMarkComplete = !item.blocked && (item.can_review && status === 'submitted' || item.can_update && item.can_complete)
  const canCompleteNow = status !== 'completed' && stepsReady && canMarkComplete
  const canReopen = status === 'completed' && item.can_update
  const completionCapability = item.completion_restricted ? 'complete_restricted_objectives' : 'update_progress'
  const completionBackground = status === 'completed' ? 'linear-gradient(to right, rgb(16 185 129 / 0.22) 0 100%)' : canCompleteNow ? color : `linear-gradient(to right, color-mix(in srgb, ${color} 32%, transparent) 0 ${visibleStepPercent}%, color-mix(in srgb, ${color} 9%, transparent) ${visibleStepPercent}% 100%)`
  const saveProgress = async (statusOverride?: string, values = fieldValues) => {
    const nextStatus = statusOverride || (status === 'completed' ? 'in_progress' : 'completed')
    setSaving(true)
    try { await planningApi.updateProgress(item.plan.slug, item.objective_uuid, { status: nextStatus, ...(Object.keys(values).length ? { field_values: values } : {}) }, token); await refresh(); toast.success(nextStatus === 'completed' ? 'Objective completed.' : 'Progress saved.') } catch (error: any) { toast.error(error?.message || 'Could not update objective.') } finally { setSaving(false) }
  }
  const saveDefinition = async () => {
    setSaving(true)
    const fieldsToSave = (draft.fields || []).map((field: any) => Object.fromEntries(Object.entries(field).filter(([key]) => !['badge', 'badge_href', 'progress_percent'].includes(key))))
    try { await planningApi.updateObjective(item.plan.slug, item.objective_uuid, { title: draft.title, description: draft.description || '', ...(!supportingLocked ? { fields: fieldsToSave } : {}), blocked: Boolean(draft.blocked), completion_restricted: Boolean(draft.completion_restricted), ...(item.can_schedule ? { phase_uuid: draft.phase_uuid || null, due_date: draft.due_date || null, allow_late: Boolean(draft.allow_late) } : {}) }, token); await refresh(); setEditing(false); toast.success('Objective updated.') } catch (error: any) { toast.error(error?.message || 'Could not update objective.') } finally { setSaving(false) }
  }
  const removeObjective = async () => {
    if (!window.confirm(`Delete “${item.title}”?`)) return
    try { await planningApi.removeObjective(item.plan.slug, item.objective_uuid, token); setOpen(false); await refresh(); toast.success('Objective deleted.') } catch (error: any) { toast.error(error?.message || 'Could not delete objective.') }
  }
  const stepDefinition = (type: string, options?: any) => ({ field_uuid: `field_${crypto.randomUUID()}`, title: options?.name || '', type, access: 'contributor', restricted: false, ...(type === 'badge' && options ? { badge_uuid: options.badge_uuid, badge: { badge_uuid: options.badge_uuid, name: options.name, thumbnail_image: options.thumbnail_image }, progress_percent: 0 } : {}), ...(type === 'media' ? { allowed_types: options?.allowed_types || ['image', 'document'] } : {}) })
  const addRequirement = (type: string, options?: any) => setDraft({ ...draft, fields: [...(draft.fields || []), stepDefinition(type, options)] })
  const changeStepType = (index: number, type: string, options?: any) => setDraft({ ...draft, fields: draft.fields.map((field: any, fieldIndex: number) => fieldIndex === index ? { ...stepDefinition(type, options), field_uuid: field.field_uuid, title: type === 'badge' ? options?.name || field.title : field.title } : field) })
  const saveStepValues = (values: Record<string, any>) => saveProgress('in_progress', { ...fieldValues, ...values })
  const openStep = (field: any) => {
    const key = fieldKey(field)
    if (field.type === 'checkbox') { void saveStepValues({ [key]: !fieldValues[key] }); return }
    if (field.type === 'text') { setNoteField(field); setNoteDraft(fieldValues[key] || ''); return }
    if (field.type === 'link') { const values = Array.isArray(fieldValues[key]) ? fieldValues[key] : []; setLinksField(field); setLinkDrafts(values.length ? values.map((value: string) => value.replace(/^https:\/\/www\./, '')) : ['']); return }
    if (field.type === 'media') { setMediaField(field); const allowed = field.allowed_types || ['image', 'document']; if (allowed.length === 1) setMediaType(allowed[0]); return }
    setActiveField(activeField === key ? '' : key)
  }
  const linkValues = linkDrafts.map((value) => `https://www.${value.trim()}`)
  const linksValid = linkDrafts.length > 0 && linkDrafts.every((value) => { try { const parsed = new URL(`https://www.${value.trim()}`); return Boolean(value.trim() && parsed.hostname.startsWith('www.') && parsed.hostname.length > 4) } catch { return false } })
  const saveNote = async () => { if (!noteField) return; await saveStepValues({ [fieldKey(noteField)]: noteDraft }); setNoteField(null) }
  const saveLinks = async () => { if (!linksField || !linksValid) return; await saveStepValues({ [fieldKey(linksField)]: linkValues }); setLinksField(null) }
  const saveMedia = async (asset: MediaAsset) => { if (!mediaField) return; const key = fieldKey(mediaField); const current = Array.isArray(fieldValues[key]) ? fieldValues[key] : []; await saveStepValues({ [key]: [...current, asset] }); setMediaType(null); setMediaField(null) }
  const helping = !item.is_mine && item.subject && !editorMode
  return <article ref={cardRef} className={cn('group bg-card transition-[box-shadow,border-radius,transform,background-color] duration-150', !editorMode && !open && 'hover:bg-muted/20', !open && status === 'completed' && 'bg-emerald-50/50 dark:bg-emerald-950/15', !open && canCompleteNow && 'bg-emerald-50/30 dark:bg-emerald-950/10', open && 'relative z-10 my-2 rounded-2xl shadow-lg ring-1 ring-black/5')}>
    <div className="flex items-start gap-2 px-2 py-4 sm:gap-3 sm:px-4">
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">{editing ? <input autoFocus value={draft.title || ''} onChange={(event) => setDraft({ ...draft, title: event.target.value })} className={cn(inlineEditableClass, 'min-w-0 flex-1 text-sm font-black')} /> : <button type="button" onClick={() => setOpen(!open)} className="min-w-0 flex-1 truncate text-left text-sm font-black">{item.title}</button>}</div>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] font-bold text-muted-foreground">{!editorMode ? <Link href={getUriWithOrg(orgslug, `/plans/${encodeURIComponent(item.plan.slug)}`)} onClick={(event) => event.stopPropagation()} className="inline-flex max-w-48 truncate rounded-full px-2.5 py-1 text-[10px] font-black text-white" style={{ backgroundColor: color }}>{item.plan.name}</Link> : null}{editing && fullDetail ? <label className="relative inline-flex h-6 items-center gap-1 rounded-full bg-muted px-2.5 text-[10px] font-black"><span className="max-w-32 truncate">{fullDetail.phases?.find((candidate: any) => candidate.phase_uuid === draft.phase_uuid)?.name || 'Choose phase'}</span><ChevronDown size={10} /><select aria-label="Move objective to phase" value={draft.phase_uuid || ''} onChange={(event) => setDraft({ ...draft, phase_uuid: event.target.value })} className="absolute inset-0 cursor-pointer opacity-0"><option value="" disabled>Move to phase…</option>{fullDetail.phases?.map((candidate: any) => <option key={candidate.phase_uuid} value={candidate.phase_uuid}>{candidate.name}{candidate.phase_uuid === item.phase_uuid ? ' (current)' : ''}</option>)}</select></label> : item.phase_name ? <span className="rounded-full bg-muted px-2.5 py-1 text-[10px] font-black">{item.phase_name}</span> : null}{editing && item.can_schedule ? <span className="inline-flex h-7 items-center gap-1 rounded-full bg-muted pl-2 pr-1 text-[10px] font-black"><CalendarDays size={10} /><input type="date" aria-label="Objective target date" value={draft.due_date || ''} min={fullDetail?.start_date ? dateValue(fullDetail.start_date) : undefined} max={fullDetail?.phases?.find((candidate: any) => candidate.phase_uuid === draft.phase_uuid)?.due_date || fullDetail?.due_date ? dateValue(fullDetail?.phases?.find((candidate: any) => candidate.phase_uuid === draft.phase_uuid)?.due_date || fullDetail?.due_date) : undefined} onChange={(event) => setDraft({ ...draft, due_date: event.target.value })} className="h-6 min-w-28 bg-transparent text-[10px] outline-none" />{draft.due_date ? <button type="button" onClick={() => setDraft({ ...draft, due_date: '' })} aria-label="Remove target date" className="rounded-full p-1 hover:bg-background"><X size={11} /></button> : null}</span> : item.effective_due_date ? <span className={cn(targetDateLabel(item.effective_due_date).includes('ago') && 'text-red-600')}>{targetDateLabel(item.effective_due_date)}{!item.has_fixed_due_date ? ' · phase' : ''}</span> : null}{!open && status === 'completed' ? <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400"><Check size={11} />Completed</span> : null}</div>
        {helping ? <span className="mt-2 flex items-center gap-2"><PersonAvatar user={item.subject} size="xs" /><span><span className="block text-[10px] font-black text-foreground">{item.subject.name?.split(' ')[0]}’s plan</span><span className="block text-[9px] text-muted-foreground">My role: {item.viewer_role?.name || 'Collaborator'}</span></span></span> : null}
      </div>
      {!open && !editing ? status === 'completed' ? <span aria-label="Objective completed" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white"><Check size={15} strokeWidth={3} /></span> : canCompleteNow ? <button type="button" disabled={saving} onClick={() => void saveProgress()} className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-foreground px-3 text-[10px] font-black text-background shadow-sm transition hover:-translate-y-px hover:shadow-md disabled:opacity-40">{saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={13} strokeWidth={3} />}Mark complete</button> : <ObjectiveProgressRing completed={completeFields} total={fields.length} color={color} locked={stepsReady && !canMarkComplete} /> : null}
      <div className="flex self-stretch flex-col items-center justify-between">{item.can_edit ? editing ? <button type="button" onClick={() => void saveDefinition()} disabled={saving || !draft.title?.trim()} aria-label="Save objective" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-foreground text-background disabled:opacity-40">{saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={14} />}</button> : <DropdownMenu><DropdownMenuTrigger asChild><button type="button" aria-label="Objective options" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"><MoreVertical size={16} /></button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onClick={() => { setOpen(true); setEditing(true) }}><Pencil size={14} className="mr-2" />Edit</DropdownMenuItem><DropdownMenuItem onClick={() => void removeObjective()} className="text-red-600"><Trash2 size={14} className="mr-2" />Delete</DropdownMenuItem></DropdownMenuContent></DropdownMenu> : <span />}{!editing ? <button type="button" onClick={() => setOpen(!open)} aria-label={open ? 'Collapse objective' : 'Expand objective'} className="rounded p-1 text-muted-foreground"><ChevronDown size={16} className={cn('transition-transform', open && 'rotate-180')} /></button> : <span />}</div>
    </div>
    {open ? <div className="px-3 pb-5 sm:px-4">
      <div className="border-t border-border/60 pt-4">
        {editing ? <textarea value={draft.description || ''} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder="Add a description" className={cn(inlineEditableClass, 'min-h-16 w-full resize-y text-xs leading-5 text-muted-foreground')} /> : item.description ? <button type="button" onClick={() => setDescriptionOpen(!descriptionOpen)} className={cn('block w-full text-left text-xs leading-5 text-muted-foreground', !descriptionOpen && 'line-clamp-2')}>{item.description}</button> : <p className="text-xs text-muted-foreground">No description yet.</p>}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-x-3 gap-y-4">{(editing ? draft.fields || [] : fields).map((field: any, index: number) => {
        if (field.type === 'badge') {
          const progress = Number(field.progress_percent || 0)
          const badgeImage = field.badge?.thumbnail_image ? normalizeMediaUrl(field.badge.thumbnail_image) : ''
          if (editing) return <div key={fieldKey(field) || index}><div className="flex h-11 items-center gap-2 rounded-xl bg-muted px-2"><StepPicker badges={badgeChoices} onAdd={(type, options) => changeStepType(index, type, options)} trigger={<button type="button" disabled={supportingLocked} aria-label="Change step type" className="flex h-8 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-card disabled:opacity-50">{badgeImage ? <img src={badgeImage} alt="" className="h-full w-full object-cover" /> : <Award size={14} className="text-muted-foreground" />}<ChevronDown size={9} className="ml-0.5" /></button>} /><input disabled={supportingLocked} value={field.title || ''} onChange={(event) => setDraft({ ...draft, fields: draft.fields.map((candidate: any, candidateIndex: number) => candidateIndex === index ? { ...candidate, title: event.target.value } : candidate) })} className={cn(inlineEditableClass, 'min-w-0 flex-1 text-[11px] font-black disabled:opacity-60')} /><button type="button" disabled={supportingLocked} onClick={() => setDraft({ ...draft, fields: draft.fields.filter((_: any, candidateIndex: number) => candidateIndex !== index) })} className="rounded p-1 text-muted-foreground hover:text-red-700 disabled:opacity-30"><X size={12} /></button></div><p className="mt-1.5 text-[9px] font-bold text-muted-foreground">Badge step</p></div>
          return <div key={fieldKey(field) || index}><Link href={getUriWithOrg(orgslug, field.badge_href)} className={cn('relative flex h-12 w-full items-center gap-2 overflow-hidden rounded-xl px-3 text-left transition', progress >= 100 && 'ring-1 ring-emerald-500/30')} style={{ background: progress >= 100 ? 'rgb(16 185 129 / 0.14)' : `linear-gradient(to right, #a3a3a3 ${progress}%, #e5e5e5 ${progress}%)` }}><span className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white/80">{badgeImage ? <img src={badgeImage} alt="" className="h-full w-full object-cover" /> : <Award size={15} className="text-neutral-600" />}</span><span className="relative z-10 min-w-0 flex-1 truncate text-[11px] font-black text-neutral-950">{field.title || field.badge?.name || 'Badge'}</span>{progress >= 100 ? <span className="relative z-10 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-white"><Check size={11} strokeWidth={3} /></span> : <span className="relative z-10 text-[9px] font-black text-neutral-700">{progress}%</span>}</Link></div>
        }
        const restricted = fieldIsRestricted(field)
        const capability = restricted ? 'contribute_restricted_fields' : 'contribute_fields'
        const canUse = item.can_update && item[restricted ? 'can_contribute_restricted_fields' : 'can_contribute_fields'] && !item.blocked
        if (editing) return <div key={fieldKey(field) || index}><div className="flex h-11 items-center gap-2 rounded-xl bg-muted px-2"><StepPicker badges={badgeChoices} onAdd={(type, options) => changeStepType(index, type, options)} trigger={<button type="button" disabled={supportingLocked} aria-label="Change step type" className="flex h-8 w-11 shrink-0 items-center justify-between rounded-lg border border-border bg-card px-2 text-muted-foreground disabled:opacity-50"><RequirementTypeIcon type={field.type} size={14} /><ChevronDown size={10} /></button>} /><input disabled={supportingLocked} value={field.title || ''} onChange={(event) => setDraft({ ...draft, fields: draft.fields.map((candidate: any, candidateIndex: number) => candidateIndex === index ? { ...candidate, title: event.target.value } : candidate) })} placeholder="Step name" className={cn(inlineEditableClass, 'min-w-0 flex-1 text-[11px] font-black disabled:opacity-60')} /><button type="button" disabled={supportingLocked} onClick={() => setDraft({ ...draft, fields: draft.fields.filter((_: any, candidateIndex: number) => candidateIndex !== index) })} className="rounded p-1 text-muted-foreground hover:text-red-700 disabled:opacity-30"><X size={12} /></button></div>{field.type === 'media' ? <p className="mt-1.5 text-[9px] font-bold text-muted-foreground">Accepts {(field.allowed_types || ['image', 'document']).join(', ')}</p> : null}{fullDetail?.collaborators?.some((person: any) => !person.is_subject) ? <button type="button" disabled={supportingLocked} onClick={() => setDraft({ ...draft, fields: draft.fields.map((candidate: any, candidateIndex: number) => candidateIndex === index ? { ...candidate, restricted: !restricted, access: !restricted ? 'reviewer' : 'contributor' } : candidate) })} className="mt-1.5 flex items-center gap-1 text-[9px] font-bold text-muted-foreground disabled:opacity-30">{restricted ? <Check size={10} /> : <span className="h-2.5 w-2.5 rounded-sm border border-muted-foreground/50" />}Restricted</button> : null}</div>
        const stepComplete = hasFieldValue(fieldValues[fieldKey(field)])
        return <div key={fieldKey(field) || index}><button type="button" disabled={!canUse || supportingLocked} onClick={() => openStep(field)} className={cn('flex h-12 w-full items-center gap-2 rounded-xl px-3 text-left transition', stepComplete ? 'bg-emerald-50 text-emerald-950 ring-1 ring-emerald-500/25 dark:bg-emerald-950/20 dark:text-emerald-100' : canUse && !supportingLocked ? 'bg-muted hover:bg-muted/80' : 'bg-muted/50 text-muted-foreground')}><span className={cn(stepComplete ? 'text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground')}>{canUse ? <RequirementTypeIcon type={field.type} /> : <Lock size={15} />}</span><span className="min-w-0 flex-1 truncate text-[11px] font-black">{field.title || 'Step'}</span>{stepComplete ? <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white"><Check size={11} strokeWidth={3} /></span> : null}</button><AccessPeopleLine item={item} capability={capability} unlocked={Boolean(canUse)} /></div>
      })}{editing && !supportingLocked ? <StepPicker badges={badgeChoices} onAdd={addRequirement} /> : null}</div>
      {!editing && activeField ? (() => { const field = fields.find((candidate: any) => fieldKey(candidate) === activeField); if (!field) return null; return <div className="mt-4 rounded-xl bg-muted p-3">{field.type === 'text' ? <textarea autoFocus value={fieldValues[activeField] || ''} onChange={(event) => setFieldValues({ ...fieldValues, [activeField]: event.target.value })} className="min-h-20 w-full resize-y bg-transparent text-xs outline-none" placeholder="Jot down notes…" /> : <input autoFocus value={fieldValues[activeField] || ''} onChange={(event) => setFieldValues({ ...fieldValues, [activeField]: event.target.value })} className="h-9 w-full bg-transparent text-xs outline-none" placeholder="Add a file or link" />}<div className="mt-2 flex justify-end"><button type="button" disabled={saving || !hasFieldValue(fieldValues[activeField])} onClick={() => void saveProgress('in_progress', { [activeField]: fieldValues[activeField] })} className="rounded-lg bg-foreground px-3 py-2 text-[10px] font-black text-background disabled:opacity-40">Save step</button></div></div> })() : null}
      {!editing ? <div className="mt-5">{item.can_review && status === 'submitted' ? <div className="grid grid-cols-2 gap-2"><button disabled={saving} onClick={() => void saveProgress('changes_requested')} className="rounded-xl bg-muted px-3 py-3 text-xs font-black">Request changes</button><button disabled={saving || !stepsReady} onClick={() => void saveProgress('completed')} className="rounded-xl bg-foreground px-3 py-3 text-xs font-black text-background disabled:opacity-40">Approve</button></div> : <button type="button" disabled={status === 'completed' ? !canReopen || saving : !canCompleteNow || saving} onClick={() => void saveProgress()} className={cn('relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl px-4 py-3 text-xs font-black transition', status === 'completed' ? 'text-emerald-800 dark:text-emerald-200' : canCompleteNow ? 'text-white shadow-sm hover:brightness-95' : 'text-muted-foreground')} style={{ background: completionBackground }}><span className="relative z-10 flex items-center gap-2">{status === 'completed' ? <RotateCcw size={14} /> : canCompleteNow ? <Check size={14} /> : <Lock size={14} />}{status === 'completed' ? 'Reopen objective' : stepsReady && !canMarkComplete ? 'Ready · waiting for permission' : fields.length ? `Complete ${completeFields}/${fields.length} steps` : 'Mark complete'}</span></button>}<AccessPeopleLine item={item} capability={completionCapability} unlocked={Boolean(canMarkComplete)} /></div> : null}
      {editing ? <div className="mt-5"><button type="button" disabled className="flex w-full items-center justify-center gap-2 rounded-xl bg-muted/50 px-4 py-3 text-xs font-black text-muted-foreground"><Check size={14} />{status === 'completed' ? 'Reopen to change steps' : 'Mark complete'}</button>{fullDetail?.collaborators?.some((person: any) => !person.is_subject) ? <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2"><button type="button" onClick={() => setDraft({ ...draft, completion_restricted: !draft.completion_restricted })} className="flex items-center gap-1 text-[9px] font-bold text-muted-foreground">{draft.completion_restricted ? <Check size={10} /> : <span className="h-2.5 w-2.5 rounded-sm border border-muted-foreground/50" />}Restricted completion</button><button type="button" onClick={() => setDraft({ ...draft, blocked: !draft.blocked })} className="flex items-center gap-1 text-[9px] font-bold text-muted-foreground">{draft.blocked ? <Check size={10} /> : <span className="h-2.5 w-2.5 rounded-sm border border-muted-foreground/50" />}Blocked for now</button>{item.can_schedule ? <button type="button" onClick={() => setDraft({ ...draft, allow_late: !draft.allow_late })} className="flex items-center gap-1 text-[9px] font-bold text-muted-foreground">{draft.allow_late ? <Check size={10} /> : <span className="h-2.5 w-2.5 rounded-sm border border-muted-foreground/50" />}Allow late completion</button> : null}</div> : null}</div> : null}
    </div> : null}
    <Modal isDialogOpen={Boolean(noteField)} onOpenChange={(nextOpen) => { if (!nextOpen) setNoteField(null) }} minHeight="no-min" minWidth="md" dialogTitle={noteField?.title || 'Note'} dialogDescription="Add useful detail and format it so it is easy to revisit." dialogContent={<div className="space-y-4 p-2"><DiscussionEditor content={noteDraft} onChange={setNoteDraft} placeholder="Jot down what you learn…" minHeight="180px" /><button type="button" disabled={saving} onClick={() => void saveNote()} className="flex w-full items-center justify-center gap-2 rounded-xl bg-foreground px-4 py-3 text-xs font-black text-background disabled:opacity-40">{saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}Save note</button></div>} />
    <Modal isDialogOpen={Boolean(linksField)} onOpenChange={(nextOpen) => { if (!nextOpen) setLinksField(null) }} minHeight="no-min" minWidth="md" dialogTitle={linksField?.title || 'Links'} dialogDescription="Add one or more web links for this step." dialogContent={<div className="space-y-3 p-2"><div className="space-y-2">{linkDrafts.map((value, index) => <div key={index} className="flex items-center gap-2"><label className="flex h-11 min-w-0 flex-1 items-center overflow-hidden rounded-xl border border-border bg-background focus-within:border-foreground"><span className="h-full shrink-0 border-r border-border bg-muted px-3 text-[11px] font-bold leading-[2.75rem] text-muted-foreground">https://www.</span><input autoFocus={index === 0} value={value} onChange={(event) => setLinkDrafts(linkDrafts.map((candidate, candidateIndex) => candidateIndex === index ? event.target.value.replace(/^https?:\/\/(www\.)?/, '') : candidate))} placeholder="example.com/page" aria-label={`Link ${index + 1}`} className="h-full min-w-0 flex-1 bg-transparent px-3 text-xs outline-none" /></label>{linkDrafts.length > 1 ? <button type="button" onClick={() => setLinkDrafts(linkDrafts.filter((_, candidateIndex) => candidateIndex !== index))} aria-label={`Remove link ${index + 1}`} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-red-700"><X size={14} /></button> : null}</div>)}</div><button type="button" onClick={() => setLinkDrafts([...linkDrafts, ''])} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[10px] font-black text-muted-foreground hover:bg-muted"><Plus size={12} />Add another link</button>{!linksValid && linkDrafts.some((value) => value.length > 0) ? <p className="text-[10px] font-bold text-red-600">Enter a valid address after https://www.</p> : null}<button type="button" disabled={saving || !linksValid} onClick={() => void saveLinks()} className="flex w-full items-center justify-center gap-2 rounded-xl bg-foreground px-4 py-3 text-xs font-black text-background disabled:opacity-40">{saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}Save links</button></div>} />
    <Modal isDialogOpen={Boolean(mediaField && !mediaType)} onOpenChange={(nextOpen) => { if (!nextOpen) setMediaField(null) }} minHeight="no-min" minWidth="sm" dialogTitle={mediaField?.title || 'Choose media'} dialogDescription="What kind of media do you want to add?" dialogContent={<div className="space-y-2 p-2">{((mediaField?.allowed_types || ['image', 'document']) as MediaType[]).map((type) => <button key={type} type="button" onClick={() => setMediaType(type)} className="flex w-full items-center gap-3 rounded-xl border border-border px-3 py-3 text-left text-xs font-black hover:bg-muted"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted">{type === 'image' ? <ImageIcon size={15} /> : type === 'video' ? <Film size={15} /> : <FileText size={15} />}</span><span className="flex-1 capitalize">{type === 'document' ? 'Document (PDF)' : type}</span><ChevronRight size={14} className="text-muted-foreground" /></button>)}</div>} />
    {viewerUserId && mediaField && mediaType ? <MediaPickerDialog open onOpenChange={(nextOpen) => { if (!nextOpen) { setMediaType(null); setMediaField(null) } }} title={`Add ${mediaType === 'document' ? 'document' : mediaType}`} description="Upload something new or choose it from your media library." owner={{ type: 'user', id: Number(viewerUserId) }} mediaType={mediaType} accessToken={token} onSave={saveMedia} /> : null}
  </article>
}

function PlansPanel2(props: any) {
  const { lifecycle, setLifecycle, plans, invitations, detail, selectedSlug, choose, clear, refresh, token, onCreate, getPlanColor, setPlanColor } = props
  if (selectedSlug && detail) {
    const planColor = getPlanColor(detail.plan_uuid)
    return <div className="rounded-2xl border border-border bg-card p-4 shadow-sm"><PlanInspector detail={detail} token={token} refresh={refresh} clear={clear} color={planColor} setPlanColor={setPlanColor} /></div>
  }
  return (<div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
    <h2 className="font-black">Plans</h2>
    <div className="mt-3 grid grid-cols-2 rounded-lg bg-muted p-1">{(['active', 'completed'] as PlanLifecycle[]).map((value) => <button key={value} onClick={() => setLifecycle(value)} className={cn('rounded-md px-2 py-2 text-[11px] font-black capitalize', lifecycle === value && 'bg-card shadow-sm')}>{value}</button>)}</div>
    <div className="mt-3 space-y-2">{plans.map((plan: any) => { const color = getPlanColor(plan.plan_uuid); const shared = !plan.is_mine && plan.subject; const fill = Math.max(2, Number(plan.progress_percent || 0)); return <button key={plan.plan_uuid} onClick={() => choose(plan)} className="flex min-h-14 w-full items-center gap-2.5 overflow-hidden rounded-xl px-3 py-2 text-left transition hover:brightness-[0.98]" style={{ background: `linear-gradient(to right, ${color}66 0%, ${color}66 ${fill}%, ${color}18 ${fill}%, ${color}18 100%)` }}>
      <span className="min-w-0 flex-1"><span className="block truncate text-xs font-black">{plan.name}</span>{shared ? <span className="mt-1 flex items-center gap-1.5 text-[9px] font-bold text-muted-foreground"><PersonAvatar user={plan.subject} size="xs" />{plan.subject.name?.split(' ')[0] || 'Their'}’s plan</span> : null}</span>
    </button> })}{!plans.length ? <p className="py-8 text-center text-xs text-muted-foreground">No {lifecycle} plans.</p> : null}</div>
    {invitations.length ? <div className="mt-5 border-t border-border pt-4"><p className="flex items-center gap-1.5 text-xs font-black"><Sparkles size={13} className="text-blue-600" />New requests</p><div className="mt-2 space-y-2">{invitations.map((invitation: any) => <div key={invitation.invitation_uuid} className="rounded-xl bg-blue-50 p-3"><p className="text-xs font-black text-blue-950">{invitation.plan.name}</p><p className="mt-1 text-[10px] text-blue-700">{invitation.kind === 'subject' ? 'A plan for you' : `Help as ${invitation.role.name}`}</p><div className="mt-3 grid grid-cols-2 gap-2"><button onClick={async () => { await planningApi.respond(invitation.invitation_uuid, false, token); await refresh() }} className="rounded-md border border-blue-200 px-2 py-1.5 text-[10px] font-black text-blue-800">Hide</button><button onClick={async () => { await planningApi.respond(invitation.invitation_uuid, true, token); await refresh() }} className="rounded-md bg-blue-700 px-2 py-1.5 text-[10px] font-black text-white">Accept</button></div></div>)}</div></div> : null}
    <button onClick={onCreate} className="mt-4 flex w-full items-center gap-3 rounded-xl border border-dashed border-border p-3 text-left transition hover:border-foreground/40 hover:bg-muted/30"><span className="flex h-8 w-8 items-center justify-center rounded-full border border-border"><Plus size={15} /></span><span><span className="block text-xs font-black">New plan</span><span className="mt-0.5 block text-[10px] text-muted-foreground">Create your own plan</span></span></button>
  </div>)
}

// eslint-disable-next-line no-unused-vars
function InspectorField({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1.5 block text-[10px] font-black uppercase tracking-[0.1em] text-muted-foreground">{label}</span>{children}</label>
}

// eslint-disable-next-line no-unused-vars
const inspectorInput = 'h-9 w-full rounded-lg border border-border bg-background px-2.5 text-xs outline-none focus:border-foreground/40 disabled:opacity-60'

/* Objective-specific sidebar editing was intentionally retired in favor of in-place cards.
function ObjectiveInspector({ objective, detail, token, refresh, onClose }: any) {
  const canEdit = detail.capabilities.includes('edit_structure')
  const canSchedule = detail.capabilities.includes('edit_schedule')
  const phase = detail.phases?.find((item: any) => item.objectives?.some((candidate: any) => candidate.objective_uuid === objective.objective_uuid))
  const [draft, setDraft] = React.useState<any>({})
  const [saving, setSaving] = React.useState(false)
  const [editMode, setEditMode] = React.useState(false)
  React.useEffect(() => setDraft({ ...objective, phase_uuid: phase?.phase_uuid || '', start_date: dateValue(objective.start_date), due_date: dateValue(objective.due_date) }), [objective, phase?.phase_uuid])
  React.useEffect(() => setEditMode(false), [objective.objective_uuid])
  const save = async () => {
    setSaving(true)
    try {
      await planningApi.updateObjective(detail.slug, objective.objective_uuid, {
        ...(canEdit ? { title: draft.title, description: draft.description || '', phase_uuid: draft.phase_uuid || null, priority: Number(draft.priority), blocked: Boolean(draft.blocked), completion_restricted: Boolean(draft.completion_restricted), fields: draft.fields || [] } : {}),
        ...(canSchedule ? { start_date: draft.start_date || null, due_date: draft.due_date || null, allow_late: Boolean(draft.allow_late) } : {}),
      }, token)
      await refresh(); setEditMode(false); toast.success('Objective saved.')
    } catch (error: any) { toast.error(error?.message || 'Could not save objective.') } finally { setSaving(false) }
  }
  if (!editMode) return <div className="space-y-4"><div><p className="text-sm font-black">{objective.title}</p><p className="mt-2 text-xs leading-5 text-muted-foreground">{objective.description || 'No description yet.'}</p></div><div className="grid grid-cols-2 gap-2 text-[10px]"><span className="rounded-lg bg-muted px-2.5 py-2"><span className="block font-black">Phase</span><span className="mt-0.5 block text-muted-foreground">{phase?.name || 'Unscheduled'}</span></span><span className="rounded-lg bg-muted px-2.5 py-2"><span className="block font-black">Target</span><span className="mt-0.5 block text-muted-foreground">{objective.due_date ? targetDateLabel(objective.due_date) : 'End of phase'}</span></span></div><div><p className="text-[10px] font-black uppercase tracking-[0.1em] text-muted-foreground">Requirements</p><div className="mt-2 space-y-1.5">{(objective.fields || []).map((field: any) => <div key={fieldKey(field)} className="flex items-center gap-2 rounded-lg bg-muted px-2.5 py-2 text-[10px] font-bold"><RequirementTypeIcon type={field.type} size={12} /><span className="min-w-0 flex-1 truncate">{field.title || 'Requirement'}</span>{fieldIsRestricted(field) ? <Lock size={10} /> : null}</div>)}{!objective.fields?.length ? <p className="text-[10px] text-muted-foreground">No extra requirements.</p> : null}</div></div>{canEdit || canSchedule ? <button onClick={() => setEditMode(true)} className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-muted px-3 py-2.5 text-xs font-black"><Pencil size={12} />Edit objective</button> : null}</div>
  return <div className="space-y-4">
    <InspectorField label="Title"><input value={draft.title || ''} disabled={!canEdit} onChange={(event) => setDraft({ ...draft, title: event.target.value })} className={inspectorInput} /></InspectorField>
    <InspectorField label="Description"><textarea value={draft.description || ''} disabled={!canEdit} onChange={(event) => setDraft({ ...draft, description: event.target.value })} className="min-h-24 w-full rounded-lg border border-border bg-background p-2.5 text-xs leading-5 outline-none disabled:opacity-60" placeholder="Add helpful context" /></InspectorField>
    <div className="grid grid-cols-2 gap-3"><InspectorField label="Phase"><select value={draft.phase_uuid || ''} disabled={!canEdit} onChange={(event) => setDraft({ ...draft, phase_uuid: event.target.value })} className={inspectorInput}>{detail.phases?.map((item: any) => <option key={item.phase_uuid} value={item.phase_uuid}>{item.name}</option>)}</select></InspectorField><InspectorField label="Priority"><select value={draft.priority ?? 1} disabled={!canEdit} onChange={(event) => setDraft({ ...draft, priority: event.target.value })} className={inspectorInput}><option value={0}>Low</option><option value={1}>Normal</option><option value={2}>High</option><option value={3}>Critical</option></select></InspectorField></div>
    <div className="grid grid-cols-2 gap-3"><InspectorField label="Starts"><input type="date" value={draft.start_date || ''} disabled={!canSchedule} onChange={(event) => setDraft({ ...draft, start_date: event.target.value })} className={inspectorInput} /></InspectorField><InspectorField label="Target"><input type="date" value={draft.due_date || ''} disabled={!canSchedule} onChange={(event) => setDraft({ ...draft, due_date: event.target.value })} className={inspectorInput} /></InspectorField></div>
    <div className="rounded-xl bg-muted/60 p-3"><p className="text-[10px] font-black uppercase tracking-[0.1em] text-muted-foreground">Behavior</p><label className="mt-3 flex items-center justify-between gap-3 text-xs font-bold"><span>Blocked for now</span><input type="checkbox" checked={Boolean(draft.blocked)} disabled={!canEdit} onChange={(event) => setDraft({ ...draft, blocked: event.target.checked })} /></label><label className="mt-3 flex items-center justify-between gap-3 text-xs font-bold"><span>Allow late completion</span><input type="checkbox" checked={Boolean(draft.allow_late)} disabled={!canSchedule} onChange={(event) => setDraft({ ...draft, allow_late: event.target.checked })} /></label><label className="mt-3 flex items-center justify-between gap-3 text-xs font-bold"><span>Reviewer must complete</span><input type="checkbox" checked={Boolean(draft.completion_restricted)} disabled={!canEdit || objective.kind === 'badge'} onChange={(event) => setDraft({ ...draft, completion_restricted: event.target.checked })} /></label></div>
    <div><div className="flex items-center justify-between"><p className="text-[10px] font-black uppercase tracking-[0.1em] text-muted-foreground">Requirements</p>{canEdit ? <button onClick={() => setDraft({ ...draft, fields: [...(draft.fields || []), { field_uuid: `field_${crypto.randomUUID()}`, title: '', type: 'text', access: 'contributor' }] })} className="inline-flex items-center gap-1 text-[10px] font-black"><Plus size={11} />Add</button> : null}</div><div className="mt-2 space-y-2">{(draft.fields || []).map((field: any, index: number) => <div key={fieldKey(field) || index} className="rounded-xl border border-border p-2"><div className="flex gap-1.5"><input value={field.title || ''} disabled={!canEdit} onChange={(event) => setDraft({ ...draft, fields: draft.fields.map((item: any, itemIndex: number) => itemIndex === index ? { ...item, title: event.target.value } : item) })} placeholder="Requirement name" className="h-8 min-w-0 flex-1 bg-transparent px-1 text-xs font-bold outline-none" />{canEdit ? <button onClick={() => setDraft({ ...draft, fields: draft.fields.filter((_: any, itemIndex: number) => itemIndex !== index) })} aria-label="Remove requirement" className="rounded p-1.5 text-muted-foreground hover:text-red-700"><Trash2 size={12} /></button> : null}</div><div className="mt-1.5 grid grid-cols-2 gap-2"><select value={field.type || 'text'} disabled={!canEdit} onChange={(event) => setDraft({ ...draft, fields: draft.fields.map((item: any, itemIndex: number) => itemIndex === index ? { ...item, type: event.target.value } : item) })} className="h-7 rounded-md border border-border bg-background px-1.5 text-[10px]"><option value="text">Written response</option><option value="media">File or link</option></select><select value={field.access || field.lane || 'contributor'} disabled={!canEdit} onChange={(event) => setDraft({ ...draft, fields: draft.fields.map((item: any, itemIndex: number) => itemIndex === index ? { ...item, access: event.target.value, restricted: event.target.value === 'reviewer' } : item) })} className="h-7 rounded-md border border-border bg-background px-1.5 text-[10px]"><option value="contributor">Learner fills in</option><option value="reviewer">Reviewer fills in</option></select></div></div>)}{!draft.fields?.length ? <p className="rounded-xl border border-dashed border-border px-3 py-4 text-center text-[10px] text-muted-foreground">No extra requirements</p> : null}</div></div>
    <div className="flex items-center justify-between rounded-xl border border-border p-3"><span><span className="block text-xs font-black capitalize">{String(objective.progress?.status || 'not started').replaceAll('_', ' ')}</span><span className="mt-0.5 block text-[10px] text-muted-foreground">{objective.fields?.length || 0} requirements · {objective.kind}</span></span>{objective.progress?.completed_at ? <Check size={16} className="text-emerald-600" /> : <Clock3 size={16} className="text-muted-foreground" />}</div>
    {canEdit || canSchedule ? <button disabled={saving || !draft.title?.trim()} onClick={() => void save()} className="flex w-full items-center justify-center gap-2 rounded-lg bg-foreground px-3 py-2.5 text-xs font-black text-background disabled:opacity-40">{saving ? <Loader2 size={13} className="animate-spin" /> : null}Save changes</button> : null}
    {canEdit ? <button onClick={async () => { if (!window.confirm('Delete this objective?')) return; try { await planningApi.removeObjective(detail.slug, objective.objective_uuid, token); onClose(); await refresh(); toast.success('Objective deleted.') } catch (error: any) { toast.error(error?.message || 'Could not delete objective.') } }} className="flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[10px] font-black text-red-700 hover:bg-red-50"><Trash2 size={12} />Delete objective</button> : null}
  </div>
}
*/

function PlanInspector({ detail, token, refresh, clear, color, setPlanColor }: any) {
  const canEdit = detail.capabilities.includes('edit_plan_details')
  const canSchedule = detail.capabilities.includes('edit_schedule')
  const canComplete = detail.capabilities.includes('complete_plan')
  const canAddPhase = detail.capabilities.includes('edit_structure')
  const canInvite = detail.capabilities.includes('manage_collaborators') || detail.capabilities.includes('request_collaborators')
  const [editing, setEditing] = React.useState(false)
  const [draft, setDraft] = React.useState<any>({ name: detail.name, description: detail.description || '', due_date: dateValue(detail.due_date) })
  const [saving, setSaving] = React.useState(false)
  const [inviteOpen, setInviteOpen] = React.useState(false)
  const [peopleOpen, setPeopleOpen] = React.useState(false)
  const [addingPhase, setAddingPhase] = React.useState(false)
  const [phaseName, setPhaseName] = React.useState('')
  React.useEffect(() => setDraft({ name: detail.name, description: detail.description || '', due_date: dateValue(detail.due_date) }), [detail])
  const save = async () => {
    setSaving(true)
    try { await planningApi.update(detail.slug, { ...(canEdit ? { name: draft.name.trim(), description: draft.description } : {}), ...(canSchedule ? { due_date: draft.due_date || null } : {}) }, token); await refresh(); setEditing(false); toast.success('Plan saved.') } catch (error: any) { toast.error(error?.message || 'Could not save plan.') } finally { setSaving(false) }
  }
  const toggleComplete = async () => {
    if (detail.status !== 'completed' && detail.completed_objective_count < detail.objective_count && !window.confirm('Some objectives are unfinished. Complete this plan anyway?')) return
    try { await planningApi.status(detail.slug, detail.status === 'completed' ? 'reopen' : 'complete', token); await refresh(); if (detail.status !== 'completed') clear() } catch (error: any) { toast.error(error?.message || 'Could not update plan status.') }
  }
  const collaborators = (detail.collaborators || []).filter((person: any) => !person.is_subject && person.user?.id !== detail.subject?.id)
  const visibleCollaborators = collaborators.slice(0, 3)
  const addPhase = async () => {
    if (!phaseName.trim()) return
    setSaving(true)
    try { await planningApi.addPhase(detail.slug, { name: phaseName.trim() }, token); setPhaseName(''); setAddingPhase(false); await refresh(); toast.success('Phase added.') } catch (error: any) { toast.error(error?.message || 'Could not add phase.') } finally { setSaving(false) }
  }
  const viewerRole = detail.viewer_role?.name || 'Collaborator'
  return <div className="space-y-5">
    <div className="flex items-start gap-3">
      {editing ? <DropdownMenu><DropdownMenuTrigger asChild><button type="button" aria-label="Change plan color" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white shadow-sm" style={{ backgroundColor: color }}><Pencil size={14} /></button></DropdownMenuTrigger><DropdownMenuContent align="start"><div className="grid grid-cols-4 gap-2 p-2">{PLAN_COLORS.map((item) => <button key={item} type="button" onClick={() => setPlanColor(detail.plan_uuid, item)} aria-label={`Use ${item} for ${detail.name}`} className={cn('h-7 w-7 rounded-lg border-2', item === color ? 'border-foreground' : 'border-transparent')} style={{ backgroundColor: item }} />)}</div></DropdownMenuContent></DropdownMenu> : <span className="h-10 w-10 shrink-0 rounded-xl shadow-sm" style={{ backgroundColor: color }} />}
      <div className="min-w-0 flex-1">{editing ? <input autoFocus value={draft.name || ''} disabled={!canEdit} onChange={(event) => setDraft({ ...draft, name: event.target.value })} className={cn(inlineEditableClass, 'w-full text-base font-black')} /> : <h2 className="truncate text-base font-black">{detail.name}</h2>}</div>
      {canEdit || canSchedule ? editing ? <button type="button" disabled={saving || !draft.name?.trim()} onClick={() => void save()} className="flex h-8 w-8 items-center justify-center rounded-lg bg-foreground text-background disabled:opacity-40">{saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={14} />}</button> : <button type="button" onClick={() => setEditing(true)} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"><Pencil size={14} /></button> : null}
    </div>
    <div><div className="flex items-center justify-between text-[10px] font-black"><span>Progress</span><span>{detail.progress_percent}%</span></div><div className="mt-2 h-2 overflow-hidden rounded-full" style={{ backgroundColor: `${color}20` }}><div className="h-full rounded-full" style={{ width: `${detail.progress_percent}%`, backgroundColor: color }} /></div></div>
    <div><p className="text-[10px] font-black uppercase tracking-[0.1em] text-muted-foreground">Target completion</p>{editing && canSchedule ? <input type="date" value={draft.due_date || ''} onChange={(event) => setDraft({ ...draft, due_date: event.target.value })} className="mt-1.5 h-9 w-full rounded-lg border border-border px-2 text-xs" /> : <p className="mt-1 text-xs font-bold">{detail.due_date ? new Date(`${dateValue(detail.due_date)}T12:00:00`).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' }) : 'No target date'}</p>}</div>
    <div><p className="text-[10px] font-black uppercase tracking-[0.1em] text-muted-foreground">Description</p>{editing && canEdit ? <textarea value={draft.description || ''} onChange={(event) => setDraft({ ...draft, description: event.target.value })} className="mt-1.5 min-h-20 w-full rounded-lg border border-border p-2.5 text-xs leading-5 outline-none" /> : <p className="mt-1 text-xs leading-5 text-muted-foreground">{detail.description || 'No description yet.'}</p>}</div>
    {!detail.is_mine && detail.subject ? <div className="flex items-center gap-2.5 rounded-xl bg-muted/60 p-3"><PersonAvatar user={detail.subject} size="md" /><span className="min-w-0"><span className="block truncate text-xs font-black">{detail.subject.name?.split(' ')[0]}’s plan</span><span className="mt-0.5 block text-[10px] text-muted-foreground">My role: {viewerRole}</span></span></div> : null}
    <div className="border-t border-border pt-4"><p className="text-[10px] font-black uppercase tracking-[0.1em] text-muted-foreground">Collaborators</p><div className="mt-2 space-y-2">{visibleCollaborators.map((person: any) => <div key={person.collaborator_uuid} className="flex items-center gap-2.5"><PersonAvatar user={person.user} /><span className="min-w-0"><span className="block truncate text-xs font-black">{person.user?.name}</span><span className="block text-[10px] text-muted-foreground">{person.role?.name}</span></span></div>)}{!collaborators.length ? <p className="text-[10px] text-muted-foreground">No collaborators yet.</p> : null}</div>{collaborators.length > 3 ? <div className="relative"><button type="button" onClick={() => setPeopleOpen(!peopleOpen)} className="mt-2 text-[10px] font-black text-muted-foreground">+{collaborators.length - 3} more</button>{peopleOpen ? <div className="absolute left-0 top-full z-40 mt-1 w-full rounded-xl border border-border bg-popover p-2 shadow-xl">{collaborators.map((person: any) => <div key={person.collaborator_uuid} className="flex items-center gap-2 rounded-lg px-2 py-1.5"><PersonAvatar user={person.user} /><span className="min-w-0"><span className="block truncate text-[10px] font-black">{person.user?.name}</span><span className="block text-[9px] text-muted-foreground">{person.role?.name}</span></span></div>)}</div> : null}</div> : null}{canInvite ? <button type="button" onClick={() => setInviteOpen(true)} className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-[10px] font-black"><Plus size={12} />Invite collaborator</button> : null}</div>
    <div className="border-t border-border pt-4"><p className="text-[10px] font-black uppercase tracking-[0.1em] text-muted-foreground">Phases</p><div className="mt-2 space-y-1">{(detail.phases || []).map((phase: any) => { const target = phase.effective_due_date || detail.due_date; return <button key={phase.phase_uuid} type="button" onClick={() => document.getElementById(`plan-phase-${phase.phase_uuid}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })} className="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-2 text-left hover:bg-muted"><span className="min-w-0 truncate text-xs font-black">{phase.name}</span><span className="shrink-0 text-[9px] text-muted-foreground">{target ? new Date(`${dateValue(target)}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : 'No date'}</span></button> })}</div>{canAddPhase ? addingPhase ? <div className="mt-2 flex gap-2"><input autoFocus value={phaseName} onChange={(event) => setPhaseName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void addPhase(); if (event.key === 'Escape') setAddingPhase(false) }} placeholder="Phase name" className="h-9 min-w-0 flex-1 rounded-lg border border-border px-2 text-xs" /><button type="button" disabled={saving || !phaseName.trim()} onClick={() => void addPhase()} className="rounded-lg bg-foreground px-3 text-background disabled:opacity-40"><Plus size={13} /></button></div> : <button type="button" onClick={() => setAddingPhase(true)} className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-2 text-[10px] font-black text-muted-foreground"><Plus size={12} />Add phase</button> : null}</div>
    {canComplete ? <button onClick={() => void toggleComplete()} className={cn('flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-xs font-black', detail.status === 'completed' ? 'border border-border' : 'bg-foreground text-background')}>{detail.status === 'completed' ? <RotateCcw size={13} /> : <Check size={13} />}{detail.status === 'completed' ? 'Reopen plan' : 'Complete plan'}</button> : null}
    <PlanInvite detail={detail} token={token} refresh={refresh} open={inviteOpen} setOpen={setInviteOpen} />
  </div>
}

// eslint-disable-next-line no-unused-vars
function planOwnerLabel(plan: any) {
  if (plan.is_mine) return 'Your plan'
  if (plan.subject?.name) return `For ${plan.subject.name}`
  if (plan.source_assignment?.group?.name) return `For ${plan.source_assignment.group.name}`
  return plan.owner?.name ? `Shared by ${plan.owner.name}` : plan.source_organization?.name || 'Shared plan'
}

// Kept temporarily for compatibility with pending plan-management work.
// eslint-disable-next-line no-unused-vars
function PlanSettings({ detail, token, refresh }: any) {
  const [open, setOpen] = React.useState(false)
  const [draft, setDraft] = React.useState<any>({})
  const canEdit = detail.capabilities.includes('edit_plan_details')
  const canSchedule = detail.capabilities.includes('edit_schedule')
  if (!canEdit && !canSchedule) return null
  const begin = () => { setDraft({ name: detail.name, description: detail.description || '', priority: detail.priority, start_date: detail.start_date || '', due_date: detail.due_date || '' }); setOpen(true) }
  const save = async () => {
    try { await planningApi.update(detail.slug, { ...(canEdit ? { name: draft.name, description: draft.description, priority: Number(draft.priority) } : {}), ...(canSchedule ? { start_date: draft.start_date || null, due_date: draft.due_date || null } : {}) }, token); setOpen(false); await refresh(); toast.success('Plan updated.') }
    catch (error: any) { toast.error(error?.message || 'Could not update plan.') }
  }
  return <><button onClick={begin} className="mt-3 inline-flex items-center gap-1 text-[10px] font-black text-blue-700"><Pencil size={11} />Edit details and dates</button><Modal isDialogOpen={open} onOpenChange={setOpen} minHeight="no-min" minWidth="md" dialogTitle="Edit plan" dialogDescription="Keep the plan current as its direction and schedule evolve." dialogContent={<div className="space-y-3 p-2"><label className="block text-xs font-black">Name<input value={draft.name || ''} disabled={!canEdit} onChange={(event) => setDraft({ ...draft, name: event.target.value })} className="mt-1 h-10 w-full rounded-lg border border-border px-3 text-sm disabled:opacity-60" /></label><label className="block text-xs font-black">Description<textarea value={draft.description || ''} disabled={!canEdit} onChange={(event) => setDraft({ ...draft, description: event.target.value })} className="mt-1 min-h-24 w-full rounded-lg border border-border p-3 text-sm disabled:opacity-60" /></label><div className="grid grid-cols-2 gap-3"><label className="text-xs font-black">Start<input type="date" value={draft.start_date || ''} disabled={!canSchedule} onChange={(event) => setDraft({ ...draft, start_date: event.target.value })} className="mt-1 h-10 w-full rounded-lg border border-border px-2 text-xs" /></label><label className="text-xs font-black">Target<input type="date" value={draft.due_date || ''} disabled={!canSchedule} onChange={(event) => setDraft({ ...draft, due_date: event.target.value })} className="mt-1 h-10 w-full rounded-lg border border-border px-2 text-xs" /></label></div><button onClick={() => void save()} className="w-full rounded-lg bg-foreground px-4 py-3 text-xs font-black text-background">Save plan</button></div>} /></>
}

// eslint-disable-next-line no-unused-vars
function CollaboratorList({ detail, token, refresh, clear }: any) {
  const canManage = detail.capabilities.includes('manage_collaborators')
  const leave = async () => {
    if (!window.confirm('Leave this plan? You will lose access.')) return
    try { await planningApi.leave(detail.slug, token); await refresh(); clear(); toast.success('You left the plan.') } catch (error: any) { toast.error(error?.message || 'Could not leave plan.') }
  }
  return <div className="mt-5 border-t border-border pt-4"><p className="text-xs font-black">Collaborators</p><div className="mt-2 space-y-2">{(detail.collaborators || []).map((item: any) => <div key={item.collaborator_uuid} className="flex items-center gap-2 text-xs"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted font-black">{item.user?.name?.[0] || '?'}</span><span className="min-w-0 flex-1 truncate font-bold">{item.user?.name}</span>{canManage && !item.is_owner ? <><select value={item.role.key} onChange={async (event) => { try { await planningApi.updateCollaborator(detail.slug, item.collaborator_uuid, event.target.value, token); await refresh() } catch (error: any) { toast.error(error?.message || 'Could not change role.') } }} className="max-w-24 rounded border border-border bg-background px-1 py-1 text-[9px]">{detail.roles.map((role: any) => <option key={role.key} value={role.key}>{role.name}</option>)}</select><button aria-label={`Remove ${item.user?.name}`} onClick={async () => { if (!window.confirm(`Remove ${item.user?.name} from this plan?`)) return; await planningApi.removeCollaborator(detail.slug, item.collaborator_uuid, token); await refresh() }} className="text-red-600"><Trash2 size={12} /></button></> : <span className="text-[10px] text-muted-foreground">{item.is_owner ? 'Owner' : item.role.name}</span>}</div>)}</div>{!detail.is_owner ? <button onClick={() => void leave()} className="mt-3 inline-flex items-center gap-1 text-[10px] font-black text-red-700"><LogOut size={11} />Leave plan</button> : null}</div>
}

// eslint-disable-next-line no-unused-vars
function PlanActivity({ detail, token }: any) {
  const activityKey = token ? `${getAPIUrl()}planning/plans/${encodeURIComponent(detail.slug)}/activity` : null
  const { data: activity = [], mutate: refreshActivity } = useSWR<any[]>(activityKey, (url: string) => swrFetcher(url, token))
  const [comment, setComment] = React.useState('')
  const [expanded, setExpanded] = React.useState(false)
  const canComment = detail.capabilities.includes('comment')
  const post = async () => {
    if (!comment.trim()) return
    try { await planningApi.comment(detail.slug, comment.trim(), token); setComment(''); await refreshActivity(); toast.success('Comment added.') }
    catch (error: any) { toast.error(error?.message || 'Could not add comment.') }
  }
  const visible = expanded ? activity : activity.slice(0, 3)
  return <div className="mt-5 border-t border-border pt-4"><div className="flex items-center justify-between"><p className="text-xs font-black">Activity</p>{activity.length > 3 ? <button onClick={() => setExpanded(!expanded)} className="text-[10px] font-black text-blue-700">{expanded ? 'Show less' : `View all ${activity.length}`}</button> : null}</div><div className="mt-2 space-y-2">{visible.map((item: any) => <div key={item.activity_uuid} className="rounded-lg bg-muted/50 p-2.5"><div className="flex items-center justify-between gap-2"><span className="truncate text-[10px] font-black">{item.actor?.name || 'System'}</span><span className="text-[9px] text-muted-foreground">{item.creation_date ? new Date(item.creation_date).toLocaleDateString() : ''}</span></div><p className="mt-1 text-[10px] leading-4 text-muted-foreground">{item.action === 'comment.added' ? item.payload?.body : String(item.action).replaceAll('.', ' ').replaceAll('_', ' ')}</p></div>)}{!activity.length ? <p className="py-2 text-[10px] text-muted-foreground">No activity yet.</p> : null}</div>{canComment ? <div className="mt-2 flex gap-2"><input value={comment} onChange={(event) => setComment(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void post() }} placeholder="Add a comment" className="h-9 min-w-0 flex-1 rounded-lg border border-border px-2 text-xs" /><button disabled={!comment.trim()} onClick={() => void post()} className="rounded-lg border border-border px-3 text-[10px] font-black disabled:opacity-40">Post</button></div> : null}</div>
}

// eslint-disable-next-line no-unused-vars
function PlanStructure({ detail, token, refresh }: any) {
  const [title, setTitle] = React.useState('')
  const [phaseName, setPhaseName] = React.useState('')
  const [phaseUuid, setPhaseUuid] = React.useState(detail.phases?.[0]?.phase_uuid || '')
  const [editing, setEditing] = React.useState<any>(null)
  const [saving, setSaving] = React.useState(false)
  const add = async () => {
    if (!title.trim()) return
    setSaving(true)
    try { await planningApi.addObjective(detail.slug, { title: title.trim(), phase_uuid: phaseUuid || null }, token); setTitle(''); await refresh(); toast.success('Objective added.') }
    catch (error: any) { toast.error(error?.message || 'Could not add objective.') }
    finally { setSaving(false) }
  }
  const addPhase = async () => {
    if (!phaseName.trim()) return
    setSaving(true)
    try { const updated = await planningApi.addPhase(detail.slug, { name: phaseName.trim() }, token); setPhaseName(''); setPhaseUuid(updated.phases.at(-1)?.phase_uuid || ''); await refresh(); toast.success('Phase added.') }
    catch (error: any) { toast.error(error?.message || 'Could not add phase.') }
    finally { setSaving(false) }
  }
  const saveObjective = async () => {
    if (!editing?.title?.trim()) return
    setSaving(true)
    try {
      await planningApi.updateObjective(detail.slug, editing.objective_uuid, {
        title: editing.title.trim(), description: editing.description || '', phase_uuid: editing.phase_uuid || null,
        start_date: editing.start_date || null, due_date: editing.due_date || null,
        priority: Number(editing.priority || 1), blocked: Boolean(editing.blocked),
      }, token)
      setEditing(null); await refresh(); toast.success('Objective updated.')
    } catch (error: any) { toast.error(error?.message || 'Could not update objective.') } finally { setSaving(false) }
  }
  const canEdit = detail.capabilities.includes('edit_structure')
  const canSchedule = detail.capabilities.includes('edit_schedule')
  return <div className="mt-5 border-t border-border pt-4">
    <p className="text-xs font-black">Phases and objectives</p>
    <div className="mt-2 space-y-3">{(detail.phases || []).map((phase: any) => <div key={phase.phase_uuid} className="rounded-lg bg-muted/50 p-2.5"><div className="flex items-center justify-between gap-2"><p className="text-[10px] font-black uppercase tracking-wide text-muted-foreground">{phase.name}</p>{phase.due_date ? <span className="text-[9px] text-muted-foreground">Target {targetDateLabel(phase.due_date)}</span> : null}</div>{phase.objectives?.length ? <div className="mt-1 space-y-1">{phase.objectives.map((objective: any) => <button key={objective.objective_uuid} onClick={() => canEdit || canSchedule ? setEditing({ ...objective, phase_uuid: phase.phase_uuid }) : undefined} className="flex w-full items-center gap-2 rounded-md px-1 py-1 text-left hover:bg-background"><span className="min-w-0 flex-1 truncate text-xs font-bold">{objective.title}</span>{objective.due_date ? <CalendarDays size={11} className="text-muted-foreground" /> : null}{canEdit || canSchedule ? <Pencil size={11} className="text-muted-foreground" /> : null}</button>)}</div> : <p className="mt-1 text-[10px] text-muted-foreground">No objectives yet</p>}</div>)}</div>
    {canEdit ? <div className="mt-3 space-y-2"><div className="flex gap-2"><select value={phaseUuid} onChange={(event) => setPhaseUuid(event.target.value)} className="h-9 max-w-28 rounded-lg border border-border bg-background px-2 text-[10px]">{detail.phases.map((phase: any) => <option key={phase.phase_uuid} value={phase.phase_uuid}>{phase.name}</option>)}</select><input value={title} onChange={(event) => setTitle(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void add() }} placeholder="Add a next step" className="h-9 min-w-0 flex-1 rounded-lg border border-border px-2 text-xs" /><button disabled={saving || !title.trim()} onClick={() => void add()} className="rounded-lg bg-foreground px-3 text-background disabled:opacity-40"><Plus size={13} /></button></div><div className="flex gap-2"><input value={phaseName} onChange={(event) => setPhaseName(event.target.value)} placeholder="New phase" className="h-8 min-w-0 flex-1 rounded-lg border border-border px-2 text-[11px]" /><button disabled={saving || !phaseName.trim()} onClick={() => void addPhase()} className="rounded-lg border border-border px-2 text-[10px] font-black">Add phase</button></div></div> : null}
    <Modal isDialogOpen={Boolean(editing)} onOpenChange={(open) => { if (!open) setEditing(null) }} minHeight="no-min" minWidth="md" dialogTitle="Edit objective" dialogDescription="Change its content, phase, priority, and schedule." dialogContent={editing ? <div className="space-y-3 p-2"><label className="block text-xs font-black">Title<input value={editing.title || ''} disabled={!canEdit} onChange={(event) => setEditing({ ...editing, title: event.target.value })} className="mt-1 h-10 w-full rounded-lg border border-border px-3 text-sm disabled:opacity-60" /></label><label className="block text-xs font-black">Description<textarea value={editing.description || ''} disabled={!canEdit} onChange={(event) => setEditing({ ...editing, description: event.target.value })} className="mt-1 min-h-20 w-full rounded-lg border border-border p-3 text-sm disabled:opacity-60" /></label><div className="grid grid-cols-2 gap-3"><label className="text-xs font-black">Phase<select value={editing.phase_uuid || ''} disabled={!canEdit} onChange={(event) => setEditing({ ...editing, phase_uuid: event.target.value })} className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-2 text-xs">{detail.phases.map((phase: any) => <option key={phase.phase_uuid} value={phase.phase_uuid}>{phase.name}</option>)}</select></label><label className="text-xs font-black">Priority<select value={editing.priority || 1} disabled={!canEdit} onChange={(event) => setEditing({ ...editing, priority: event.target.value })} className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-2 text-xs"><option value={0}>Low</option><option value={1}>Normal</option><option value={2}>High</option><option value={3}>Critical</option></select></label></div><div className="grid grid-cols-2 gap-3"><label className="text-xs font-black">Start<input type="date" value={editing.start_date || ''} disabled={!canSchedule} onChange={(event) => setEditing({ ...editing, start_date: event.target.value })} className="mt-1 h-10 w-full rounded-lg border border-border px-2 text-xs" /></label><label className="text-xs font-black">Target<input type="date" value={editing.due_date || ''} disabled={!canSchedule} onChange={(event) => setEditing({ ...editing, due_date: event.target.value })} className="mt-1 h-10 w-full rounded-lg border border-border px-2 text-xs" /></label></div><label className="flex items-center gap-2 text-xs font-bold"><input type="checkbox" checked={Boolean(editing.blocked)} disabled={!canEdit} onChange={(event) => setEditing({ ...editing, blocked: event.target.checked })} />Blocked for now</label><div className="flex gap-2"><button onClick={async () => { if (!window.confirm('Delete this objective?')) return; await planningApi.removeObjective(detail.slug, editing.objective_uuid, token); setEditing(null); await refresh() }} className="rounded-lg border border-red-200 px-3 text-red-700"><Trash2 size={14} /></button><button disabled={saving || !editing.title?.trim()} onClick={() => void saveObjective()} className="flex-1 rounded-lg bg-foreground px-4 py-3 text-xs font-black text-background disabled:opacity-50">Save objective</button></div></div> : null} />
  </div>
}

function PlanInvite({ detail, token, refresh, open, setOpen }: any) {
  const [email, setEmail] = React.useState('')
  const [roleKey, setRoleKey] = React.useState('reviewer')
  const [saving, setSaving] = React.useState(false)
  const canInvite = detail.capabilities.includes('manage_collaborators')
  const canRequest = detail.capabilities.includes('request_collaborators')
  const roles = (detail.roles || []).filter((role: any) => !['subject', 'plan_admin'].includes(role.key))
  React.useEffect(() => { if (roles.length && !roles.some((role: any) => role.key === roleKey)) setRoleKey(roles[0].key) }, [roles, roleKey])
  if (!canInvite && !canRequest) return null
  const invite = async () => {
    if (!email.trim()) return
    setSaving(true)
    try { if (canInvite) await planningApi.invite(detail.slug, { email: email.trim(), role_key: roleKey, kind: 'collaborator' }, token); else await planningApi.requestCollaborator(detail.slug, { email: email.trim(), role_key: roleKey }, token); setEmail(''); setOpen(false); await refresh(); toast.success(canInvite ? 'Invitation created.' : 'Collaborator request sent.') }
    catch (error: any) { toast.error(error?.message || 'Could not add collaborator.') } finally { setSaving(false) }
  }
  return <Modal isDialogOpen={Boolean(open)} onOpenChange={setOpen} minHeight="no-min" minWidth="md" dialogTitle={canInvite ? 'Invite collaborator' : 'Request collaborator'} dialogDescription="Add someone who can help with this plan." dialogContent={<div className="space-y-4 p-2"><label className="block text-xs font-black">Email<input autoFocus type="email" value={email} onChange={(event) => setEmail(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && void invite()} placeholder="name@example.com" className="mt-1.5 h-10 w-full rounded-lg border border-border px-3 text-sm" /></label><label className="block text-xs font-black">Role<select value={roleKey} onChange={(event) => setRoleKey(event.target.value)} className="mt-1.5 h-10 w-full rounded-lg border border-border bg-background px-3 text-xs">{roles.map((role: any) => <option key={role.key} value={role.key}>{role.name}</option>)}</select></label><button type="button" disabled={saving || !email.trim()} onClick={() => void invite()} className="flex w-full items-center justify-center gap-2 rounded-lg bg-foreground px-4 py-3 text-xs font-black text-background disabled:opacity-40">{saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}{canInvite ? 'Send invitation' : 'Send request'}</button></div>} />
}

function CreatePlanModal({ open, setOpen, token, refresh, onCreated }: any) {
  const [name, setName] = React.useState('')
  const [description, setDescription] = React.useState('')
  const [dueDate, setDueDate] = React.useState('')
  const [saving, setSaving] = React.useState(false)
  const save = async () => { if (!name.trim() || !dueDate) return; setSaving(true); try { const plan = await planningApi.create({ name: name.trim(), description, due_date: dueDate }, token); await refresh(); setOpen(false); setName(''); setDescription(''); setDueDate(''); onCreated(plan); toast.success('Plan created.') } catch (error: any) { toast.error(error?.message || 'Could not create plan.') } finally { setSaving(false) } }
  return <Modal isDialogOpen={open} onOpenChange={setOpen} minHeight="no-min" minWidth="md" dialogTitle="Create a plan" dialogDescription="Choose the goal, target date, and what you know so far." dialogContent={<div className="space-y-4 p-2"><label className="block text-xs font-black">Goal<input autoFocus value={name} onChange={(event) => setName(event.target.value)} className="mt-2 h-11 w-full rounded-lg border border-border px-3 text-sm" placeholder="Earn my nursing degree" /></label><label className="block text-xs font-black">Target completion date<input type="date" required value={dueDate} onChange={(event) => setDueDate(event.target.value)} className="mt-2 h-11 w-full rounded-lg border border-border px-3 text-sm" /></label><label className="block text-xs font-black">What do you know so far?<textarea value={description} onChange={(event) => setDescription(event.target.value)} className="mt-2 min-h-24 w-full rounded-lg border border-border p-3 text-sm" placeholder="It is okay to leave this open-ended." /></label><button disabled={saving || !name.trim() || !dueDate} onClick={() => void save()} className="flex w-full items-center justify-center gap-2 rounded-lg bg-foreground px-4 py-3 text-sm font-black text-background disabled:opacity-50">{saving ? <Loader2 className="animate-spin" size={15} /> : <Plus size={15} />}Create plan</button></div>} />
}
