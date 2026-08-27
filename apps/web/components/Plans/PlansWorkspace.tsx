'use client'

import React from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import useSWR, { mutate } from 'swr'
import toast from 'react-hot-toast'
import { ArrowLeft, Award, CalendarDays, Check, ChevronRight, CircleDot, Compass, Loader2, Menu, Plus, RotateCcw, Sparkles, Users, X } from 'lucide-react'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import GeneralWrapperStyled from '@components/Objects/StyledElements/Wrappers/GeneralWrapper'
import Modal from '@components/Objects/StyledElements/Modal/Modal'
import { planningApi, type PlanLifecycle, type PlanScope } from '@services/planning/planning'
import { getAPIUrl, getUriWithOrg } from '@services/config/config'
import { swrFetcher } from '@services/utils/ts/requests'
import { cn } from '@/lib/utils'

const plansKey = (lifecycle: PlanLifecycle) => `${getAPIUrl()}planning/plans?lifecycle=${lifecycle}`
const invitesKey = () => `${getAPIUrl()}planning/invitations/me`
const feedKey = (scope: PlanScope, planUuid?: string) => `${getAPIUrl()}planning/feed?scope=${scope}${planUuid ? `&plan_uuid=${encodeURIComponent(planUuid)}` : ''}`
const detailKey = (slug?: string) => slug ? `${getAPIUrl()}planning/plans/${encodeURIComponent(slug)}` : null

export default function PlansWorkspace({ orgslug, initialPlanSlug }: { orgslug: string; initialPlanSlug?: string }) {
  const session = useLHSession() as any
  const token = session?.data?.tokens?.access_token
  const [lifecycle, setLifecycle] = React.useState<PlanLifecycle>('active')
  const [scope, setScope] = React.useState<PlanScope>('all')
  const [selectedSlug, setSelectedSlug] = React.useState(initialPlanSlug || '')
  const [mobilePanel, setMobilePanel] = React.useState(false)
  const [createOpen, setCreateOpen] = React.useState(false)
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => setMounted(true), [])
  const { data: plans = [], isLoading } = useSWR<any[]>(token ? plansKey(lifecycle) : null, (url: string) => swrFetcher(url, token), { revalidateOnFocus: true })
  const selectedSummary = plans.find((plan: any) => plan.slug === selectedSlug)
  const { data: detail } = useSWR<any>(token && selectedSlug ? detailKey(selectedSlug) : null, (url: string) => swrFetcher(url, token))
  const { data: invitations = [] } = useSWR<any[]>(token ? invitesKey() : null, (url: string) => swrFetcher(url, token), { revalidateOnFocus: true })
  const { data: feed, isLoading: feedLoading } = useSWR<any>(token ? feedKey(scope, selectedSummary?.plan_uuid || detail?.plan_uuid) : null, (url: string) => swrFetcher(url, token), { revalidateOnFocus: true })

  const refresh = async () => {
    await mutate((key: unknown) => typeof key === 'string' && key.includes(`${getAPIUrl()}planning`))
  }
  const choose = (plan: any) => {
    setSelectedSlug(plan.slug)
    window.history.pushState({}, '', getUriWithOrg(orgslug, `/plans/${encodeURIComponent(plan.slug)}`))
    setMobilePanel(false)
  }
  const clear = () => {
    setSelectedSlug('')
    window.history.pushState({}, '', getUriWithOrg(orgslug, '/plans'))
  }
  const panel = <PlansPanel2
    lifecycle={lifecycle} setLifecycle={setLifecycle} plans={plans} invitations={invitations}
    detail={detail} selectedSlug={selectedSlug} choose={choose} clear={clear} refresh={refresh}
    token={token} onCreate={() => setCreateOpen(true)} onCloseMobile={() => setMobilePanel(false)}
  />

  if (!token && session?.status !== 'loading') return <GeneralWrapperStyled><div className="py-24 text-center"><h1 className="text-3xl font-black">Sign in to use Plans</h1></div></GeneralWrapperStyled>
  return <>
    <GeneralWrapperStyled>
      <main className="pb-20 pt-8">
        <header className="flex items-start justify-between gap-4">
          <div><p className="text-xs font-black uppercase tracking-[0.18em] text-blue-600">Your direction</p><h1 className="mt-1 text-4xl font-black tracking-tight">Plans</h1><p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">Bring every goal, next step, and person helping you into one clear view.</p></div>
          <button type="button" onClick={() => setMobilePanel(true)} className="inline-flex h-10 items-center gap-2 rounded-lg border border-border px-3 text-xs font-black lg:hidden"><Menu size={16} />Plans</button>
        </header>
        {feed?.has_helping ? <div className="mt-7 flex gap-1 rounded-xl bg-muted p-1 w-fit">{(['all', 'mine', 'helping'] as PlanScope[]).map((value) => <button key={value} onClick={() => setScope(value)} className={cn('rounded-lg px-4 py-2 text-xs font-black capitalize', scope === value ? 'bg-card shadow-sm' : 'text-muted-foreground')}>{value === 'mine' ? 'My plans' : value}</button>)}</div> : null}
        {selectedSummary ? <button onClick={clear} className="mt-6 inline-flex items-center gap-1.5 text-sm font-bold text-muted-foreground hover:text-foreground"><ArrowLeft size={14} />All plans</button> : null}
        {isLoading || feedLoading ? <div className="flex min-h-[45vh] items-center justify-center"><Loader2 className="animate-spin text-muted-foreground" /></div> : <Feed feed={feed} orgslug={orgslug} token={token} refresh={refresh} />}
      </main>
    </GeneralWrapperStyled>
    {mounted && document.getElementById('org-layout-right-sidebar') ? createPortal(<div className="sticky top-4 max-h-[calc(100dvh-2rem)] overflow-y-auto pb-6">{panel}</div>, document.getElementById('org-layout-right-sidebar')!) : null}
    {mobilePanel ? <div className="fixed inset-0 z-[var(--z-modal)] bg-black/35 lg:hidden" onClick={() => setMobilePanel(false)}><aside onClick={(event) => event.stopPropagation()} className="ml-auto h-full w-[min(92vw,360px)] overflow-y-auto bg-background p-4 shadow-2xl"><div className="mb-3 flex justify-end"><button onClick={() => setMobilePanel(false)} className="rounded-lg p-2 hover:bg-muted"><X size={18} /></button></div>{panel}</aside></div> : null}
    <CreatePlanModal open={createOpen} setOpen={setCreateOpen} token={token} refresh={refresh} onCreated={(plan: any) => choose(plan)} />
  </>
}

function Feed({ feed, orgslug, token, refresh }: any) {
  if (!feed) return null
  const hasItems = feed.coming_up?.length || feed.explore?.length || feed.future_groups?.some((group: any) => group.items.length)
  if (!hasItems) return <div className="mt-10 rounded-2xl border border-dashed border-border py-20 text-center"><Compass className="mx-auto text-muted-foreground" size={42} /><h2 className="mt-4 text-xl font-black">A clear horizon</h2><p className="mt-2 text-sm text-muted-foreground">Create a plan or add an objective to begin shaping what comes next.</p></div>
  return <div className="mt-8 space-y-10">
    {feed.coming_up?.length ? <FeedSection title="Coming up" subtitle="Overdue, review-ready, and due within two weeks"><div className="space-y-3">{feed.coming_up.map((item: any) => <ObjectiveCard key={`${item.plan.plan_uuid}-${item.objective_uuid}`} item={item} orgslug={orgslug} token={token} refresh={refresh} />)}</div></FeedSection> : null}
    {feed.explore?.length ? <FeedSection title="Explore next" subtitle="Open-ended steps worth shaping now"><div className="flex snap-x gap-3 overflow-x-auto pb-2">{feed.explore.map((item: any) => <ObjectiveCard key={`${item.plan.plan_uuid}-${item.objective_uuid}`} item={item} orgslug={orgslug} token={token} refresh={refresh} compact />)}</div>{feed.explore_total > feed.explore.length ? <p className="mt-2 text-xs font-bold text-muted-foreground">{feed.explore_total - feed.explore.length} more open-ended objectives are available inside their plans.</p> : null}</FeedSection> : null}
    {(feed.future_groups || []).map((group: any) => <FeedSection key={group.key} title={group.label}><div className="space-y-3">{group.items.map((item: any) => <ObjectiveCard key={`${item.plan.plan_uuid}-${item.objective_uuid}`} item={item} orgslug={orgslug} token={token} refresh={refresh} />)}</div></FeedSection>)}
  </div>
}

function FeedSection({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return <section><div className="mb-4"><h2 className="text-xl font-black">{title}</h2>{subtitle ? <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p> : null}</div>{children}</section>
}

function ObjectiveCard({ item, orgslug, token, refresh, compact = false }: any) {
  const [open, setOpen] = React.useState(false)
  const status = item.progress?.status
  const helpingLabel = !item.is_mine && item.subject ? `${item.subject.name}'s plan` : null
  const due = item.due_date ? new Date(`${item.due_date}T12:00:00`) : null
  const overdue = due && due < new Date(new Date().toDateString())
  const save = async (nextStatus: string) => {
    try { await planningApi.updateProgress(item.plan.slug, item.objective_uuid, { status: nextStatus }, token); await refresh(); setOpen(false); toast.success(nextStatus === 'completed' ? 'Objective completed.' : 'Progress updated.') } catch (error: any) { toast.error(error?.message || 'Could not update objective.') }
  }
  const card = <article className={cn('group rounded-2xl border bg-card shadow-xs transition hover:border-foreground/25', compact ? 'w-[min(82vw,320px)] shrink-0 snap-start p-4' : 'p-5')}>
    <button className="w-full text-left" onClick={() => item.kind === 'badge' ? undefined : setOpen(true)}>
      <div className="flex items-start gap-4"><span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', item.action_type === 'review' ? 'bg-violet-100 text-violet-700' : item.kind === 'badge' ? 'bg-lime-100 text-lime-800' : 'bg-blue-50 text-blue-700')}>{item.kind === 'badge' ? <Award size={18} /> : item.action_type === 'review' ? <Users size={18} /> : <CircleDot size={18} />}</span><div className="min-w-0 flex-1">{helpingLabel ? <p className="mb-1 text-[10px] font-black uppercase tracking-wider text-violet-600">{helpingLabel}</p> : null}<h3 className="font-black leading-5">{item.title}</h3><p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{item.description || item.plan.name}</p><div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] font-bold text-muted-foreground"><span>{item.plan.name}</span>{due ? <span className={cn('inline-flex items-center gap-1', overdue && 'text-red-600')}><CalendarDays size={11} />{overdue ? 'Overdue · ' : ''}{due.toLocaleDateString()}</span> : null}<span className="rounded-full bg-muted px-2 py-0.5 capitalize">{String(status).replaceAll('_', ' ')}</span></div></div><ChevronRight size={17} className="mt-2 text-muted-foreground" /></div>
    </button>
    {item.kind === 'badge' && item.badge ? <Link href={getUriWithOrg(orgslug, item.badge_href)} className="mt-4 flex items-center justify-center gap-2 rounded-lg bg-foreground px-3 py-2.5 text-xs font-black text-background">{status === 'in_progress' ? 'Continue badge' : 'Open badge'}<ChevronRight size={14} /></Link> : null}
  </article>
  return <>{card}<Modal isDialogOpen={open} onOpenChange={setOpen} minHeight="no-min" minWidth="md" dialogTitle={item.title} dialogDescription={item.description || item.plan.name} dialogContent={<div className="space-y-3 p-2"><p className="rounded-xl bg-muted p-4 text-sm leading-6 text-muted-foreground">{item.description || 'Choose the next state for this objective.'}</p>{item.can_review && status === 'submitted' ? <div className="grid grid-cols-2 gap-2"><button onClick={() => void save('changes_requested')} className="rounded-lg border border-border px-3 py-3 text-xs font-black">Request changes</button><button onClick={() => void save('completed')} className="rounded-lg bg-foreground px-3 py-3 text-xs font-black text-background">Approve</button></div> : item.can_update ? <div className="grid grid-cols-2 gap-2"><button onClick={() => void save('in_progress')} className="rounded-lg border border-border px-3 py-3 text-xs font-black">In progress</button><button onClick={() => void save('submitted')} className="rounded-lg bg-foreground px-3 py-3 text-xs font-black text-background">Submit</button></div> : null}</div>} /></>
}

function PlansPanel2(props: any) {
  const { lifecycle, setLifecycle, plans, invitations, detail, selectedSlug, choose, clear, refresh, token, onCreate } = props
  if (selectedSlug && detail) {
    const canComplete = detail.capabilities.includes('complete_plan')
    const toggleComplete = async () => {
      if (detail.status !== 'completed' && detail.completed_objective_count < detail.objective_count && !window.confirm('Some objectives are unfinished. Complete this plan anyway?')) return
      await planningApi.status(detail.slug, detail.status === 'completed' ? 'reopen' : 'complete', token)
      await refresh()
      if (detail.status !== 'completed') clear()
    }
    return (<div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <button onClick={clear} className="inline-flex items-center gap-1 text-xs font-black text-muted-foreground"><ArrowLeft size={13} />All plans</button>
      <p className="mt-5 text-[10px] font-black uppercase tracking-wider text-blue-600">{detail.is_mine ? 'Your plan' : `${detail.subject?.name || 'Someone else'}'s plan`}</p>
      <h2 className="mt-1 text-xl font-black">{detail.name}</h2>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">{detail.description || 'No description yet.'}</p>
      <div>
      <div className="mt-5"><div className="flex justify-between text-xs font-black"><span>Progress</span><span>{detail.progress_percent}%</span></div><div className="mt-2 h-2 rounded-full bg-muted"><div className="h-full rounded-full bg-lime-500" style={{ width: `${detail.progress_percent}%` }} /></div></div></div>
      <PlanStructure detail={detail} token={token} refresh={refresh} />
      <div className="mt-5 border-t border-border pt-4">
        <p className="text-xs font-black">Collaborators</p>
        <div className="mt-2 space-y-2">{(detail.collaborators || []).map((item: any) => <div key={item.collaborator_uuid} className="flex items-center gap-2 text-xs"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-muted font-black">{item.user?.name?.[0] || '?'}</span><span className="min-w-0 flex-1 truncate font-bold">{item.user?.name}</span><span className="text-[10px] text-muted-foreground">{item.is_owner ? 'Owner' : item.role.name}</span></div>)}</div>
      </div>
      <PlanInvite detail={detail} token={token} refresh={refresh} />
      {canComplete ? <button onClick={() => void toggleComplete()} className={cn('mt-5 flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-xs font-black', detail.status === 'completed' ? 'border border-border' : 'bg-foreground text-background')}>{detail.status === 'completed' ? <RotateCcw size={13} /> : <Check size={13} />}{detail.status === 'completed' ? 'Reopen plan' : 'Complete plan'}</button> : null}
    </div>)
  }
  return (<div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
    <div className="flex items-center justify-between"><h2 className="font-black">Your plans</h2><button onClick={onCreate} className="rounded-lg bg-foreground p-2 text-background" aria-label="Create plan"><Plus size={15} /></button></div>
    <div className="mt-4 grid grid-cols-2 rounded-lg bg-muted p-1">{(['active', 'completed'] as PlanLifecycle[]).map((value) => <button key={value} onClick={() => setLifecycle(value)} className={cn('rounded-md px-2 py-2 text-[11px] font-black capitalize', lifecycle === value && 'bg-card shadow-sm')}>{value}</button>)}</div>
    <div className="mt-4 space-y-2">{plans.map((plan: any) => <button key={plan.plan_uuid} onClick={() => choose(plan)} className="flex w-full items-center gap-3 rounded-xl p-2 text-left hover:bg-muted/50"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-lime-100 text-lime-800"><Compass size={16} /></span><span className="min-w-0 flex-1"><span className="block truncate text-xs font-black">{plan.name}</span><span className="block text-[10px] text-muted-foreground">{!plan.is_mine && plan.subject ? `Helping ${plan.subject.name}` : `${plan.progress_percent}% complete`}</span></span><ChevronRight size={14} /></button>)}{!plans.length ? <p className="py-8 text-center text-xs text-muted-foreground">No {lifecycle} plans.</p> : null}</div>
    {invitations.length ? <div className="mt-5 border-t border-border pt-4"><p className="flex items-center gap-1.5 text-xs font-black"><Sparkles size={13} className="text-blue-600" />New requests</p><div className="mt-2 space-y-2">{invitations.map((invitation: any) => <div key={invitation.invitation_uuid} className="rounded-xl bg-blue-50 p-3"><p className="text-xs font-black text-blue-950">{invitation.plan.name}</p><p className="mt-1 text-[10px] text-blue-700">{invitation.kind === 'subject' ? 'A plan for you' : `Help as ${invitation.role.name}`}</p><div className="mt-3 grid grid-cols-2 gap-2"><button onClick={async () => { await planningApi.respond(invitation.invitation_uuid, false, token); await refresh() }} className="rounded-md border border-blue-200 px-2 py-1.5 text-[10px] font-black text-blue-800">Hide</button><button onClick={async () => { await planningApi.respond(invitation.invitation_uuid, true, token); await refresh() }} className="rounded-md bg-blue-700 px-2 py-1.5 text-[10px] font-black text-white">Accept</button></div></div>)}</div></div> : null}
  </div>)
}

/* Legacy compact rendering retained temporarily for easier visual diffing.
function PlansPanel({ lifecycle, setLifecycle, plans, invitations, detail, selectedSlug, choose, clear, refresh, token, onCreate, onCloseMobile }: any) {
  if (selectedSlug && detail) return <div className="rounded-2xl border border-border bg-card p-4 shadow-sm"><button onClick={clear} className="inline-flex items-center gap-1 text-xs font-black text-muted-foreground"><ArrowLeft size={13} />All plans</button><p className="mt-5 text-[10px] font-black uppercase tracking-wider text-blue-600">{detail.is_mine ? 'Your plan' : `${detail.subject?.name || 'Someone else'}'s plan`}</p><h2 className="mt-1 text-xl font-black">{detail.name}</h2><p className="mt-2 text-xs leading-5 text-muted-foreground">{detail.description || 'No description yet.'}</p><div className="mt-5"><div className="flex justify-between text-xs font-black"><span>Progress</span><span>{detail.progress_percent}%</span></div><div className="mt-2 h-2 rounded-full bg-muted"><div className="h-full rounded-full bg-lime-500" style={{ width: `${detail.progress_percent}%` }} /></div></div></div><PlanStructure detail={detail} token={token} refresh={refresh} /><div className="mt-5 border-t border-border pt-4"><p className="text-xs font-black">Collaborators</p><div className="mt-2 space-y-2">{(detail.collaborators || []).map((item: any) => <div key={item.collaborator_uuid} className="flex items-center gap-2 text-xs"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-muted font-black">{item.user?.name?.[0] || '?'}</span><span className="min-w-0 flex-1 truncate font-bold">{item.user?.name}</span><span className="text-[10px] text-muted-foreground">{item.is_owner ? 'Owner' : item.role.name}</span></div>)}</div></div><PlanInvite detail={detail} token={token} refresh={refresh} /><div className="mt-5 space-y-2">{detail.status === 'completed' && detail.capabilities.includes('complete_plan') ? <button onClick={async () => { await planningApi.status(detail.slug, 'reopen', token); await refresh() }} className="flex w-full items-center justify-center gap-2 rounded-lg border border-border px-3 py-2.5 text-xs font-black"><RotateCcw size={13} />Reopen plan</button> : detail.capabilities.includes('complete_plan') ? <button onClick={async () => { if (detail.completed_objective_count < detail.objective_count && !window.confirm('Some objectives are unfinished. Complete this plan anyway?')) return; await planningApi.status(detail.slug, 'complete', token); await refresh(); clear() }} className="flex w-full items-center justify-center gap-2 rounded-lg bg-foreground px-3 py-2.5 text-xs font-black text-background"><Check size={13} />Complete plan</button> : null}</div></div>
  return <div className="rounded-2xl border border-border bg-card p-4 shadow-sm"><div className="flex items-center justify-between"><h2 className="font-black">Your plans</h2><button onClick={onCreate} className="rounded-lg bg-foreground p-2 text-background" aria-label="Create plan"><Plus size={15} /></button></div><div className="mt-4 grid grid-cols-2 rounded-lg bg-muted p-1">{(['active', 'completed'] as PlanLifecycle[]).map((value) => <button key={value} onClick={() => setLifecycle(value)} className={cn('rounded-md px-2 py-2 text-[11px] font-black capitalize', lifecycle === value && 'bg-card shadow-sm')}>{value}</button>)}</div><div className="mt-4 space-y-2">{plans.map((plan: any) => <button key={plan.plan_uuid} onClick={() => choose(plan)} className="flex w-full items-center gap-3 rounded-xl border border-transparent p-2 text-left hover:border-border hover:bg-muted/50"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-lime-100 text-lime-800"><Compass size={16} /></span><span className="min-w-0 flex-1"><span className="block truncate text-xs font-black">{plan.name}</span>{!plan.is_mine && plan.subject ? <span className="block truncate text-[10px] text-violet-600">Helping {plan.subject.name}</span> : <span className="block text-[10px] text-muted-foreground">{plan.progress_percent}% complete</span>}</span><ChevronRight size={14} className="text-muted-foreground" /></button>)}{!plans.length ? <p className="py-8 text-center text-xs text-muted-foreground">No {lifecycle} plans.</p> : null}</div>{invitations.length ? <div className="mt-5 border-t border-border pt-4"><p className="flex items-center gap-1.5 text-xs font-black"><Sparkles size={13} className="text-blue-600" />New requests</p><div className="mt-2 space-y-2">{invitations.map((invitation: any) => <div key={invitation.invitation_uuid} className="rounded-xl bg-blue-50 p-3"><p className="text-xs font-black text-blue-950">{invitation.plan.name}</p><p className="mt-1 text-[10px] text-blue-700">{invitation.kind === 'subject' ? 'A plan for you' : `Help as ${invitation.role.name}`}</p><div className="mt-3 grid grid-cols-2 gap-2"><button onClick={async () => { await planningApi.respond(invitation.invitation_uuid, false, token); await refresh() }} className="rounded-md border border-blue-200 px-2 py-1.5 text-[10px] font-black text-blue-800">Hide</button><button onClick={async () => { await planningApi.respond(invitation.invitation_uuid, true, token); await refresh() }} className="rounded-md bg-blue-700 px-2 py-1.5 text-[10px] font-black text-white">Accept</button></div></div>)}</div></div> : null}</div>
}
*/

function PlanStructure({ detail, token, refresh }: any) {
  const [title, setTitle] = React.useState('')
  const [saving, setSaving] = React.useState(false)
  const add = async () => {
    if (!title.trim()) return
    setSaving(true)
    try { await planningApi.addObjective(detail.slug, { title: title.trim() }, token); setTitle(''); await refresh(); toast.success('Objective added.') }
    catch (error: any) { toast.error(error?.message || 'Could not add objective.') }
    finally { setSaving(false) }
  }
  return <div className="mt-5 border-t border-border pt-4"><p className="text-xs font-black">Phases and objectives</p><div className="mt-2 space-y-3">{(detail.phases || []).map((phase: any) => <div key={phase.phase_uuid}><p className="text-[10px] font-black uppercase tracking-wide text-muted-foreground">{phase.name}</p>{phase.objectives?.length ? <div className="mt-1 space-y-1">{phase.objectives.map((objective: any) => <p key={objective.objective_uuid} className="truncate text-xs font-bold">{objective.title}</p>)}</div> : <p className="mt-1 text-[10px] text-muted-foreground">No objectives yet</p>}</div>)}</div>{detail.capabilities.includes('edit_structure') ? <div className="mt-3 flex gap-2"><input value={title} onChange={(event) => setTitle(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void add() }} placeholder="Add a next step" className="h-9 min-w-0 flex-1 rounded-lg border border-border px-2 text-xs" /><button disabled={saving || !title.trim()} onClick={() => void add()} className="rounded-lg bg-foreground px-3 text-background disabled:opacity-40"><Plus size={13} /></button></div> : null}</div>
}

function PlanInvite({ detail, token, refresh }: any) {
  const [email, setEmail] = React.useState('')
  if (!detail.capabilities.includes('manage_collaborators')) return null
  const invite = async () => {
    if (!email.trim()) return
    try { await planningApi.invite(detail.slug, { email: email.trim(), role_key: 'reviewer', kind: 'collaborator' }, token); setEmail(''); await refresh(); toast.success('Invitation created.') }
    catch (error: any) { toast.error(error?.message || 'Could not invite collaborator.') }
  }
  return <div className="mt-3 flex gap-2"><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Invite reviewer by email" className="h-9 min-w-0 flex-1 rounded-lg border border-border px-2 text-xs" /><button onClick={() => void invite()} className="rounded-lg border border-border px-3 text-xs font-black">Invite</button></div>
}

function CreatePlanModal({ open, setOpen, token, refresh, onCreated }: any) {
  const [name, setName] = React.useState('')
  const [description, setDescription] = React.useState('')
  const [saving, setSaving] = React.useState(false)
  const save = async () => { if (!name.trim()) return; setSaving(true); try { const plan = await planningApi.create({ name: name.trim(), description }, token); await refresh(); setOpen(false); setName(''); setDescription(''); onCreated(plan); toast.success('Plan created.') } catch (error: any) { toast.error(error?.message || 'Could not create plan.') } finally { setSaving(false) } }
  return <Modal isDialogOpen={open} onOpenChange={setOpen} minHeight="no-min" minWidth="md" dialogTitle="Create a plan" dialogDescription="Start broad. You can add phases, dates, badges, and collaborators as your goal becomes clearer." dialogContent={<div className="space-y-4 p-2"><label className="block text-xs font-black">Goal<input autoFocus value={name} onChange={(event) => setName(event.target.value)} className="mt-2 h-11 w-full rounded-lg border border-border px-3 text-sm" placeholder="Earn my nursing degree" /></label><label className="block text-xs font-black">What do you know so far?<textarea value={description} onChange={(event) => setDescription(event.target.value)} className="mt-2 min-h-24 w-full rounded-lg border border-border p-3 text-sm" placeholder="It is okay to leave this open-ended." /></label><button disabled={saving || !name.trim()} onClick={() => void save()} className="flex w-full items-center justify-center gap-2 rounded-lg bg-foreground px-4 py-3 text-sm font-black text-background disabled:opacity-50">{saving ? <Loader2 className="animate-spin" size={15} /> : <Plus size={15} />}Create plan</button></div>} />
}
