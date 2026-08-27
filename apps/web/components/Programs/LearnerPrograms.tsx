'use client'

import React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import useSWR, { mutate } from 'swr'
import toast from 'react-hot-toast'
import { ArrowLeft, CalendarDays, Check, ChevronRight, FileUp, Layers3, Link2, Loader2, MailOpen, MessageSquareText, Sparkles } from 'lucide-react'
import GeneralWrapperStyled from '@components/Objects/StyledElements/Wrappers/GeneralWrapper'
import Modal from '@components/Objects/StyledElements/Modal/Modal'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { useOrg } from '@components/Contexts/OrgContext'
import { getAPIUrl, getUriWithOrg, routePaths } from '@services/config/config'
import { swrFetcher } from '@services/utils/ts/requests'
import { programsApi, type LearnerProgramDetailResponse, type LearnerProgramEnrollment } from '@services/programs/programs'
import { cn } from '@/lib/utils'
import FilterChips from '@components/Objects/StyledElements/FilterChips'
import { useReducedMotion } from 'motion/react'

const myKey = (orgId: number) => `${getAPIUrl()}programs/me?org_id=${orgId}`
const allMyKey = () => `${getAPIUrl()}programs/me/all/details`
const programDetailKey = (programSlug: string) => `${getAPIUrl()}programs/me/programs/${encodeURIComponent(programSlug)}`
const enrollmentDetailKey = (participantUuid: string) => `${getAPIUrl()}programs/me/enrollments/${encodeURIComponent(participantUuid)}`

export function LearnerProgramsCarousel({ orgslug }: { orgslug: string }) {
  const session = useLHSession() as any
  const token = session?.data?.tokens?.access_token
  const { data } = useSWR(token ? allMyKey() : null, (url) => swrFetcher(url, token), { revalidateOnFocus: false })
  const visible = (data || []).filter((item: any) => ['invited', 'active'].includes(item.status))
  const reduceMotion = useReducedMotion()
  const [activeIndex, setActiveIndex] = React.useState(0)
  const active = visible[Math.min(activeIndex, visible.length - 1)] || visible[0]
  React.useEffect(() => { setActiveIndex((current) => Math.min(current, Math.max(0, visible.length - 1))) }, [visible.length])
  React.useEffect(() => {
    if (visible.length < 2 || reduceMotion) return
    const timer = window.setTimeout(() => setActiveIndex((current) => (current + 1) % visible.length), 6000)
    return () => window.clearTimeout(timer)
  }, [activeIndex, reduceMotion, visible.length])
  if (!visible.length) return null
  const href = routePaths.org.program(active.program.slug)
  return <section className="min-w-0"><div className="mb-2 flex items-center justify-between"><h2 className="text-base font-black text-foreground">Your programs</h2><Link href={getUriWithOrg(orgslug, routePaths.org.programs())} className="text-xs font-black text-foreground hover:underline">View all</Link></div><div className="grid gap-3"><Link href={href} className={cn('group grid min-h-32 grid-cols-[minmax(0,1fr)_38%] overflow-hidden rounded-xl border bg-popover transition hover:border-foreground/25 hover:bg-accent/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-foreground sm:min-h-44 sm:grid-cols-[34%_minmax(0,1fr)]', active.status === 'invited' ? 'border-blue-200' : 'border-border')}><div className={cn('order-2 flex items-center justify-center border-l border-border sm:order-1 sm:border-l-0 sm:border-r', active.status === 'invited' ? 'bg-blue-50 text-blue-600' : 'bg-lime-100 text-gray-950')}>{active.status === 'invited' ? <MailOpen size={44} strokeWidth={1.6} /> : <Layers3 size={44} strokeWidth={1.6} />}</div><div className="order-1 flex min-w-0 flex-col justify-center p-4 sm:order-2 sm:px-6"><div className="flex items-center gap-2">{active.status === 'invited' && <span className="rounded-full bg-blue-600 px-2 py-0.5 text-[9px] font-black uppercase text-white">New invitation</span>}</div><h3 className="mt-2 line-clamp-2 text-lg font-black text-foreground">{active.program?.name}</h3>{(active.program?.description || active.assignment?.welcome_message) && <p className="mt-2 hidden line-clamp-2 text-sm leading-5 text-muted-foreground sm:block">{active.program?.description || active.assignment?.welcome_message}</p>}<p className="mt-3 text-xs font-bold text-muted-foreground">{active.status === 'invited' ? 'Ready when you are' : `${active.assignment.progress_percent}% complete`}</p>{active.status === 'active' && <div className="mt-2 h-1.5 max-w-sm overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-[var(--org-primary-color)]" style={{ width: `${active.assignment.progress_percent}%` }} /></div>}</div></Link>{visible.length > 1 && <div className="flex snap-x gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">{visible.map((item: any, index: number) => <button type="button" key={item.participant_uuid} onClick={() => setActiveIndex(index)} aria-pressed={index === activeIndex} className={cn('flex h-16 min-w-44 max-w-56 shrink-0 snap-start items-center gap-3 rounded-lg px-2 text-left transition hover:bg-muted/60', index === activeIndex && 'bg-muted')}><span className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-md', item.status === 'invited' ? 'bg-blue-100 text-blue-700' : 'bg-lime-100 text-gray-950')}>{item.status === 'invited' ? <MailOpen size={17} /> : <Layers3 size={17} />}</span><span className="line-clamp-2 text-sm font-semibold leading-snug">{item.program?.name}</span></button>)}</div>}</div></section>
}

export default function LearnerProgramsPage({ orgslug, participantUuid, programSlug, embedded = false }: { orgslug: string; participantUuid?: string; programSlug?: string; embedded?: boolean }) {
  const router = useRouter()
  const org = useOrg() as any
  const session = useLHSession() as any
  const token = session?.data?.tokens?.access_token
  const [selectedEnrollmentUuid, setSelectedEnrollmentUuid] = React.useState<string | null>(null)
  const key = !token
    ? null
    : programSlug
      ? programDetailKey(programSlug)
      : participantUuid
        ? enrollmentDetailKey(participantUuid)
        : embedded
          ? allMyKey()
          : org?.id
            ? myKey(Number(org.id))
            : null
  const { data, isLoading } = useSWR<LearnerProgramEnrollment[] | LearnerProgramDetailResponse>(key, (url) => swrFetcher(url, token), { revalidateOnFocus: false })
  const detail = programSlug || participantUuid ? data as LearnerProgramDetailResponse | undefined : null
  const programs = detail ? detail.enrollments : Array.isArray(data) ? data : []
  const selected = detail
    ? programs.find((item) => item.participant_uuid === selectedEnrollmentUuid) || detail.current_enrollment
    : null
  const selectedProgramSlug = selected?.program?.slug
  React.useEffect(() => {
    if (participantUuid && selectedProgramSlug) router.replace(routePaths.org.program(selectedProgramSlug))
  }, [participantUuid, router, selectedProgramSlug])
  if (isLoading) return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="animate-spin text-gray-400" /></div>
  if ((programSlug || participantUuid) && !selected) return <GeneralWrapperStyled><div className="rounded-xl border border-dashed border-border py-20 text-center"><Layers3 className="mx-auto text-muted-foreground" size={40} /><h1 className="mt-4 font-black text-foreground">Program not found</h1><p className="mt-1 text-sm text-muted-foreground">This program is not assigned to your account.</p><Link href={routePaths.org.programs()} className="mt-5 inline-flex rounded-lg bg-foreground px-4 py-2.5 text-xs font-black text-background">View your programs</Link></div></GeneralWrapperStyled>
  const content = selected ? <ProgramDetail orgslug={orgslug} orgId={Number(org?.id)} token={token} item={selected} enrollments={programs} onSelectEnrollment={setSelectedEnrollmentUuid} refresh={() => key ? mutate(key) : Promise.resolve()} /> : <ProgramsList orgId={Number(org?.id)} token={token} programs={programs} refresh={() => key ? mutate(key) : Promise.resolve()} />
  return embedded ? content : <GeneralWrapperStyled>{content}</GeneralWrapperStyled>
}

function ProgramsList({ orgId, token, programs, refresh }: any) {
  const [filter, setFilter] = React.useState<'all' | 'active' | 'completed' | 'cancelled'>('all')
  const matches = (item: any, value: typeof filter) => value === 'all' || (value === 'active' ? ['active', 'invited'].includes(item.status) : value === 'cancelled' ? item.status === 'declined' : item.status === value)
  const visible = programs.filter((item: any) => matches(item, filter))
  const options = ([['all', 'All'], ['active', 'Active'], ['completed', 'Completed'], ['cancelled', 'Cancelled']] as const).map(([id, label]) => ({ id, label, count: programs.filter((item: any) => matches(item, id)).length }))
  return <main className="pb-14"><FilterChips value={filter} options={options} onChange={setFilter} ariaLabel="Filter programs" className="mb-6" />{visible.length ? <div className="grid gap-4 md:grid-cols-2">{visible.map((item: any) => <ProgramCard key={item.participant_uuid} item={item} orgId={orgId} token={token} refresh={refresh} />)}</div> : <div className="rounded-xl border border-dashed border-border bg-card py-20 text-center"><Layers3 className="mx-auto text-muted-foreground" size={40} /><h2 className="mt-4 font-black text-foreground">{programs.length ? `No ${filter} programs` : 'No program invitations yet'}</h2><p className="mt-1 text-sm text-muted-foreground">{programs.length ? 'Try another filter.' : 'When an organization invites you, it will appear here.'}</p></div>}</main>
}

function ProgramCard({ item, orgId, token, refresh }: any) {
  const owningOrgId = Number(item.organization?.id || orgId)
  const respond = async (accept: boolean) => { try { await programsApi.respond(owningOrgId, item.participant_uuid, accept, token); await refresh(); toast.success(accept ? 'Program accepted.' : 'Invitation declined.') } catch (error: any) { toast.error(error?.message || 'Could not update the invitation.') } }
  return <article className={cn('rounded-xl border bg-card p-5', item.status === 'invited' ? 'border-blue-200 ring-2 ring-blue-50' : 'border-border')}><div className="flex items-start justify-between"><span className={cn('flex h-10 w-10 items-center justify-center rounded-xl', item.status === 'invited' ? 'bg-blue-600 text-white' : 'bg-lime-200 text-gray-950')}>{item.status === 'invited' ? <Sparkles size={18} /> : <Layers3 size={18} />}</span>{item.status === 'invited' && <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-black uppercase text-blue-700">New invitation</span>}</div>{item.organization?.name && <p className="mt-4 text-[10px] font-black uppercase tracking-wider text-muted-foreground">{item.organization.name}</p>}<h2 className={cn('text-lg font-black text-foreground', item.organization?.name ? 'mt-1' : 'mt-4')}>{item.program?.name}</h2><p className="mt-1 line-clamp-2 min-h-10 text-sm leading-5 text-muted-foreground">{item.program?.description || item.assignment.welcome_message || 'Open this program to see your objectives.'}</p><div className="mt-4 flex items-center justify-between text-xs font-bold text-muted-foreground"><span>{item.objectives.length} objectives{item.enrollment_count > 1 ? ` · ${item.enrollment_count} runs` : ''}</span><span>{item.assignment.due_date ? `Due ${new Date(item.assignment.due_date).toLocaleDateString()}` : 'At your own pace'}</span></div>{item.status === 'invited' ? <div className="mt-5 grid grid-cols-2 gap-2"><button onClick={() => void respond(false)} className="rounded-lg border border-border px-3 py-2.5 text-xs font-black text-muted-foreground hover:bg-muted">Decline</button><button onClick={() => void respond(true)} className="rounded-lg bg-foreground px-3 py-2.5 text-xs font-black text-background">Accept program</button></div> : item.status === 'declined' ? <button onClick={() => void respond(true)} className="mt-5 w-full rounded-lg border border-border px-3 py-2.5 text-xs font-black text-foreground hover:bg-muted">Accept instead</button> : <Link href={routePaths.org.program(item.program.slug)} className="mt-5 flex items-center justify-center gap-2 rounded-lg bg-foreground px-3 py-2.5 text-xs font-black text-background">Open program<ChevronRight size={14} /></Link>}</article>
}

function ProgramDetail({ orgslug, orgId, token, item, enrollments, onSelectEnrollment, refresh }: any) {
  const owningOrgId = Number(item.organization?.id || orgId)
  const owningOrgslug = item.organization?.slug || orgslug
  const [objective, setObjective] = React.useState<any>(null)
  const [note, setNote] = React.useState('')
  const [evidenceUrl, setEvidenceUrl] = React.useState('')
  const [saving, setSaving] = React.useState(false)
  const runSelector = enrollments.length > 1 && <div className="mt-6 rounded-xl border border-border bg-card p-4"><label className="text-xs font-black uppercase tracking-wider text-muted-foreground" htmlFor="program-run">Program run</label><select id="program-run" value={item.participant_uuid} onChange={(event) => onSelectEnrollment(event.target.value)} className="mt-2 h-11 w-full rounded-lg border border-border bg-background px-3 text-sm font-bold text-foreground"><option value={item.participant_uuid}>{runLabel(item)} · current view</option>{enrollments.filter((entry: any) => entry.participant_uuid !== item.participant_uuid).map((entry: any) => <option key={entry.participant_uuid} value={entry.participant_uuid}>{runLabel(entry)}</option>)}</select><p className="mt-2 text-xs text-muted-foreground">This program has been assigned to you more than once. Timing, staff, and cohort context belong to the selected run.</p></div>
  if (item.status === 'invited') return <main className="py-8"><Link href={routePaths.org.programs()} className="inline-flex items-center gap-1.5 text-sm font-bold text-muted-foreground"><ArrowLeft size={14} />All programs</Link>{runSelector}<div className="mx-auto mt-12 max-w-xl rounded-2xl border border-blue-200 bg-blue-50/50 p-8 text-center"><MailOpen className="mx-auto text-blue-600" size={36} /><p className="mt-4 text-xs font-black uppercase tracking-widest text-blue-600">Program invitation</p><h1 className="mt-2 text-3xl font-black text-foreground">{item.program?.name}</h1><p className="mt-3 text-sm leading-6 text-muted-foreground">{item.assignment.welcome_message || item.program?.description}</p><div className="mt-7 grid grid-cols-2 gap-3"><button onClick={async () => { await programsApi.respond(owningOrgId, item.participant_uuid, false, token); await refresh() }} className="rounded-lg border border-border bg-card px-4 py-3 text-sm font-black">Decline</button><button onClick={async () => { await programsApi.respond(owningOrgId, item.participant_uuid, true, token); await refresh() }} className="rounded-lg bg-foreground px-4 py-3 text-sm font-black text-background">Accept and begin</button></div></div></main>
  const completeCount = item.objectives.filter((entry: any) => entry.progress.status === 'completed').length
  const openObjective = (entry: any) => {
    if (entry.kind === 'badge' && entry.badge_uuid) {
      window.location.assign(getUriWithOrg(owningOrgslug, `${routePaths.org.badgeDetail(entry.badge_uuid)}?assignment=${encodeURIComponent(item.assignment.assignment_uuid)}`))
      return
    }
    setObjective(entry)
    setNote(entry.progress?.learner_note || '')
    setEvidenceUrl((entry.progress?.evidence || []).find((item: any) => item.url)?.url || '')
  }
  const save = async () => {
    if (!objective) return
    if (!objective.can_start) return toast.error(`This objective opens ${new Date(`${objective.schedule.effective_start_date}T12:00:00`).toLocaleDateString()}.`)
    if (objective.is_late && !objective.schedule?.allow_late) return toast.error('The submission window for this objective has closed.')
    setSaving(true)
    try {
      await programsApi.updateMine(owningOrgId, {
        objective_uuid: objective.objective_uuid,
        status: 'submitted',
        learner_note: note,
        evidence: evidenceUrl ? [{ type: 'link', url: evidenceUrl, title: 'Learner evidence' }] : [],
      }, token)
      await refresh()
      setObjective(null); setNote(''); setEvidenceUrl('')
      toast.success('Sent to staff for review.')
    } catch (error: any) { toast.error(error?.message || 'Could not save your progress.') } finally { setSaving(false) }
  }
  return <main className="pb-14 pt-7">
    <Link href={routePaths.org.programs()} className="inline-flex items-center gap-1.5 text-sm font-bold text-muted-foreground hover:text-foreground"><ArrowLeft size={14} />All programs</Link>
    {runSelector}
    <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]"><div><p className="text-xs font-black uppercase tracking-[0.16em] text-blue-600">Active program{item.organization?.name ? ` · ${item.organization.name}` : ''}</p><h1 className="mt-2 text-4xl font-black text-foreground">{item.program?.name}</h1><p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">{item.assignment.welcome_message || item.program?.description}</p></div><aside className="rounded-xl border border-border bg-card p-5"><div className="flex items-center justify-between text-xs font-black"><span>Your progress</span><span>{item.assignment.progress_percent}%</span></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-[var(--org-primary-color)]" style={{ width: `${item.assignment.progress_percent}%` }} /></div><p className="mt-3 text-xs font-medium text-muted-foreground">{completeCount} of {item.objectives.length} objectives complete</p>{item.assignment.due_date && <p className="mt-3 flex items-center gap-1.5 border-t border-border pt-3 text-xs font-bold text-muted-foreground"><CalendarDays size={13} />Complete by {new Date(item.assignment.due_date).toLocaleDateString()}</p>}</aside></div>
    <section className="mt-8"><h2 className="text-lg font-black text-foreground">Objectives</h2><div className="mt-4 space-y-3">{item.objectives.map((entry: any, index: number) => { const status = entry.progress.status; return <button key={entry.objective_uuid} onClick={() => status !== 'completed' && openObjective(entry)} className="flex w-full items-center gap-4 rounded-xl border border-border bg-card p-4 text-left transition hover:border-foreground/30"><span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-black', status === 'completed' ? 'bg-green-100 text-green-700' : status === 'submitted' || status === 'ready_for_review' ? 'bg-blue-100 text-blue-700' : status === 'flagged' ? 'bg-amber-100 text-amber-700' : 'bg-muted text-muted-foreground')}>{status === 'completed' ? <Check size={16} /> : index + 1}</span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-black text-foreground">{entry.title}</h3><span className="rounded-full bg-muted px-2 py-0.5 text-[9px] font-black uppercase text-muted-foreground">{String(status).replaceAll('_', ' ')}</span></div><p className="mt-1 text-xs leading-5 text-muted-foreground">{entry.description || completionHint(entry)}</p>{entry.progress.staff_note && <p className="mt-2 flex items-start gap-1.5 text-xs font-semibold text-blue-700"><MessageSquareText className="mt-0.5 shrink-0" size={12} />{entry.progress.staff_note}</p>}</div><ChevronRight size={17} className="text-muted-foreground" /></button> })}</div></section>
    <Modal isDialogOpen={Boolean(objective)} onOpenChange={(open) => !open && setObjective(null)} minHeight="no-min" minWidth="md" dialogTitle={objective?.title || 'Objective'} dialogDescription={completionHint(objective || {})} dialogContent={<div className="space-y-4 p-2"><p className="rounded-lg bg-muted p-3 text-sm leading-6 text-muted-foreground">{objective?.description || 'Add anything requested below, then update your progress.'}</p>{objective?.progress?.feedback_history?.length ? <div><p className="text-xs font-black uppercase tracking-wide text-muted-foreground">Previous feedback</p><div className="mt-2 space-y-2">{objective.progress.feedback_history.map((entry: any, index: number) => <div key={index} className="rounded-lg bg-amber-50 p-3"><p className="text-sm text-amber-950">{entry.message}</p><p className="mt-1 text-[10px] font-bold text-amber-700">{entry.created_at ? new Date(entry.created_at).toLocaleDateString() : ''}</p></div>)}</div></div> : null}{['learner', 'both'].includes(objective?.evidence_policy) && <label className="block text-xs font-black text-foreground"><span className="mb-2 flex items-center gap-1.5"><Link2 size={13} />Evidence link</span><input value={evidenceUrl} onChange={(e) => setEvidenceUrl(e.target.value)} className="h-11 w-full rounded-lg border border-border bg-card px-3 text-sm" placeholder="https://…" /></label>}<label className="block text-xs font-black text-foreground"><span className="mb-2 block">Note</span><textarea value={note} onChange={(e) => setNote(e.target.value)} className="min-h-24 w-full rounded-lg border border-border bg-card p-3 text-sm" placeholder="Add context for staff" /></label><button onClick={() => void save()} disabled={saving} className="flex w-full items-center justify-center gap-2 rounded-lg bg-foreground px-4 py-3 text-sm font-black text-background disabled:opacity-50">{saving ? <Loader2 className="animate-spin" size={16} /> : <FileUp size={16} />}{objective?.progress?.status === 'flagged' ? 'Resubmit for review' : 'Submit for review'}</button></div>} />
  </main>
}

function completionHint(objective: any) { if (objective.can_start === false) return `Opens ${new Date(`${objective.schedule?.effective_start_date}T12:00:00`).toLocaleDateString()}. You can view it now, but cannot submit yet.`; if (objective.is_late && !objective.schedule?.allow_late) return 'The submission window for this objective has closed.'; if (objective.is_late && objective.schedule?.allow_late) return 'The deadline has passed, but late submissions are allowed.'; if (objective.completion_policy === 'staff') return 'Staff will confirm when this is complete.'; if (objective.completion_policy === 'both') return 'Submit your part, then staff will confirm completion.'; return 'You can mark this objective complete when you are ready.' }

function runLabel(item: any) {
  const source = item.run?.cohort?.name ? item.run.cohort.name : 'Direct assignment'
  const date = item.run?.start_date || item.run?.initiate_date || item.run?.creation_date || item.created_at
  const formattedDate = date ? new Date(date).toLocaleDateString() : 'No start date'
  return `${source} · ${formattedDate} · ${String(item.status).replaceAll('_', ' ')}`
}
