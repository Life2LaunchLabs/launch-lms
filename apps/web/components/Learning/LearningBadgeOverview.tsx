'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import React from 'react'
import toast from 'react-hot-toast'
import { Award, CheckCircle2, ChevronRight, Clock3, Circle, RotateCcw, Search } from 'lucide-react'
import { SafeImage } from '@components/Objects/SafeImage'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { getUriWithOrg } from '@services/config/config'
import { deleteIssuerLearnerLink, requestIssuerLearnerSupport } from '@services/learning/marketplace'

export default function LearningBadgeOverview({ orgslug, badgePath, programAssignmentUuid }: { orgslug: string; badgePath: any; programAssignmentUuid?: string }) {
  const router = useRouter()
  const session = useLHSession() as any
  const badge = badgePath?.badge || {}
  const activities = badgePath?.activities || []
  const completed = Boolean(badgePath?.run?.award || badgePath?.run?.status === 'completed')
  const enrollment = badgePath?.enrollment || {}
  const [issuerSearch, setIssuerSearch] = React.useState('')
  const [requesting, setRequesting] = React.useState<number | null>(null)
  const [removing, setRemoving] = React.useState<string | null>(null)
  const issuers = (enrollment.issuers || []).filter((item: any) => item.org?.name?.toLowerCase().includes(issuerSearch.toLowerCase()))
  const pathBlocked = Boolean(enrollment.requires_cooperating_org && !enrollment.satisfied)

  const requestSupport = async (issuerOrgId: number) => {
    setRequesting(issuerOrgId)
    try {
      await requestIssuerLearnerSupport({ badge_uuid: badge.badge_uuid, issuer_org_id: issuerOrgId }, session.data?.tokens?.access_token)
      toast.success('Request sent. You can start when the organization accepts it.')
      router.refresh()
    } catch (error: any) {
      toast.error(error?.message || 'Could not send your request.')
    } finally {
      setRequesting(null)
    }
  }

  const removeCollaboration = async (linkUuid: string) => {
    setRemoving(linkUuid)
    try {
      await deleteIssuerLearnerLink(linkUuid, session.data?.tokens?.access_token)
      toast.success('Organization removed from this badge. Your progress is preserved.')
      router.refresh()
    } catch (error: any) {
      toast.error(error?.message || 'Could not end this collaboration.')
    } finally {
      setRemoving(null)
    }
  }

  return (
    <main className="mx-auto w-full max-w-5xl px-5 py-10 sm:px-8">
      <section className="overflow-hidden rounded-2xl bg-card shadow-sm">
        <div className="grid gap-8 p-6 md:grid-cols-[260px_1fr] md:p-8">
          <div className="flex aspect-square items-center justify-center overflow-hidden rounded-2xl bg-muted text-lime-500">
            {badge.thumbnail_image ? <SafeImage src={badge.thumbnail_image} alt={badge.name || 'Badge'} className="h-full w-full object-cover" /> : <Award size={72} strokeWidth={1.4} />}
          </div>
          <div className="flex flex-col justify-center">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              <Award size={15} /> Learning badge
            </div>
            <h1 className="mt-3 text-3xl font-black tracking-tight text-foreground sm:text-4xl">{badge.name}</h1>
            <p className="mt-4 max-w-2xl leading-7 text-muted-foreground">{badge.description || badge.about || 'Complete the learning path to earn this badge.'}</p>
            {completed ? <div className="mt-5 inline-flex w-fit items-center gap-2 rounded-full bg-green-50 px-3 py-1.5 text-sm font-bold text-green-700"><CheckCircle2 size={17} /> Badge earned</div> : null}
          </div>
        </div>
      </section>
      {(enrollment.collaborations || []).length ? <section className="mt-6 rounded-2xl bg-card p-5 shadow-sm"><h2 className="text-sm font-black uppercase tracking-wider text-muted-foreground">Cooperating organizations</h2><div className="mt-3 space-y-2">{enrollment.collaborations.map((item: any) => <div key={item.org.id} className="flex items-center justify-between gap-4 rounded-xl border border-border px-4 py-3"><div><p className="text-sm font-bold text-foreground">{item.org.name}</p><p className="text-xs text-muted-foreground">{item.source === 'program' ? 'Connected through your program' : 'Direct badge collaboration'}</p></div>{item.link_uuid ? <button type="button" disabled={removing === item.link_uuid} onClick={() => void removeCollaboration(item.link_uuid)} className="rounded-lg border border-border px-3 py-2 text-xs font-bold text-muted-foreground hover:bg-muted disabled:opacity-50">{removing === item.link_uuid ? 'Removing…' : 'Remove'}</button> : null}</div>)}</div></section> : null}
      {enrollment.requires_cooperating_org && !enrollment.satisfied ? (
        <section className="mt-8 rounded-2xl bg-card p-6 shadow-sm">
          <h2 className="text-xl font-black text-foreground">Choose a cooperating organization</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">This badge includes instructor-graded work. Request support from a recognized issuer before starting.</p>
          <label className="mt-5 flex items-center gap-2 rounded-xl border border-border px-3 py-2">
            <Search size={17} className="text-muted-foreground" />
            <input value={issuerSearch} onChange={(event) => setIssuerSearch(event.target.value)} placeholder="Search organizations" className="w-full bg-transparent text-sm outline-none" />
          </label>
          <div className="mt-3 space-y-2">
            {issuers.map((item: any) => (
              <div key={item.org.id} className="flex items-center justify-between gap-4 rounded-xl border border-border p-4">
                <div className="min-w-0"><p className="font-bold text-foreground">{item.org.name}</p><p className="text-xs text-muted-foreground">Recognized issuer</p></div>
                {item.request_status === 'requested' ? <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">Request pending</span> : item.request_status === 'rejected' ? <button type="button" onClick={() => void requestSupport(item.org.id)} disabled={requesting === item.org.id} className="rounded-lg bg-foreground px-4 py-2 text-xs font-bold text-background disabled:opacity-50">Request again</button> : <button type="button" onClick={() => void requestSupport(item.org.id)} disabled={requesting === item.org.id} className="rounded-lg bg-foreground px-4 py-2 text-xs font-bold text-background disabled:opacity-50">{requesting === item.org.id ? 'Sending…' : 'Request to start'}</button>}
              </div>
            ))}
            {!issuers.length ? <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No cooperating organizations are currently open to learner requests.</div> : null}
          </div>
        </section>
      ) : null}
      <section className="mt-8">
        <h2 className="text-xl font-black text-foreground">Learning path</h2>
        {pathBlocked ? <p className="mt-2 max-w-2xl text-sm text-muted-foreground">Your learning path and progress remain visible. Activities are read-only until a cooperating organization joins you on this badge.</p> : null}
        <div className="mt-4 space-y-3">
          {activities.map((activity: any, index: number) => {
            const state = getActivityState(badgePath?.run, activity)
            const StateIcon = state.icon
            return <Link key={activity.activity_uuid} aria-disabled={pathBlocked} onClick={pathBlocked ? (event) => event.preventDefault() : undefined} href={getUriWithOrg(orgslug, `/badges/${badge.badge_uuid}/chapter/${activity.activity_uuid}${programAssignmentUuid ? `?assignment=${encodeURIComponent(programAssignmentUuid)}` : ''}`)} className={`flex items-center gap-4 rounded-xl bg-card p-4 shadow-sm transition ${pathBlocked ? 'cursor-not-allowed opacity-55 grayscale' : 'hover:-translate-y-0.5'}`}>
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-black ${state.tone}`}><StateIcon size={16} />{state.status === 'not_started' ? <span className="sr-only">{index + 1}</span> : null}</span>
              <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="font-bold text-foreground">{activity.title}</h3><span className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase ${state.badgeTone}`}>{state.label}</span></div><p className="mt-0.5 line-clamp-1 text-sm text-muted-foreground">{state.detail || activity.description || `${activity.pages?.length || 0} pages`}</p>{state.breakdown.length ? <div className="mt-2 flex flex-wrap gap-1.5">{state.breakdown.map((item: any) => <span key={item.pageUuid} title={item.feedback || item.label} className="rounded-md bg-muted px-2 py-1 text-[10px] font-bold text-muted-foreground">{item.label}: {item.score}/{item.max}{item.feedback ? ' · comment' : ''}</span>)}</div> : null}</div>
              <ChevronRight className="text-muted-foreground" size={20} />
            </Link>
          })}
          {!activities.length ? <div className="rounded-xl border-2 border-dashed border-border p-10 text-center text-sm text-muted-foreground">No learning activities are available yet.</div> : null}
        </div>
      </section>
    </main>
  )
}

function getActivityState(run: any, activity: any) {
  const pageIds = new Set((activity.pages || []).map((page: any) => page.page_uuid))
  const attempts = (run?.attempts || []).filter((attempt: any) => pageIds.has(attempt.page_uuid))
  const latestByPage = new Map<string, any>()
  attempts.forEach((attempt: any) => {
    const prior = latestByPage.get(attempt.page_uuid)
    if (!prior || new Date(attempt.submitted_at).getTime() >= new Date(prior.submitted_at).getTime()) latestByPage.set(attempt.page_uuid, attempt)
  })
  const pagesByUuid = new Map((activity.pages || []).map((page: any) => [page.page_uuid, page]))
  const breakdown = Array.from(latestByPage.values()).filter((attempt: any) => attempt.result?.grading_status === 'graded' && Number(attempt.result?.max_score || 0) > 0).map((attempt: any) => ({ pageUuid: attempt.page_uuid, label: (pagesByUuid.get(attempt.page_uuid) as any)?.title || 'Question', score: Number(attempt.score ?? attempt.result?.score ?? 0), max: Number(attempt.result?.max_score || 0), feedback: attempt.result?.feedback || '' }))
  const progress = (run?.page_progress || []).filter((item: any) => pageIds.has(item.page_uuid))
  const pending = attempts.some((attempt: any) => attempt.result?.grading_status === 'pending')
  const allComplete = Boolean(pageIds.size) && progress.filter((item: any) => item.complete).length >= pageIds.size
  const scored = attempts.filter((attempt: any) => attempt.result?.grading_status === 'graded' && Number(attempt.result?.max_score || 0) > 0)
  const score = scored.reduce((total: number, attempt: any) => total + Number(attempt.score || attempt.result?.score || 0), 0)
  const max = scored.reduce((total: number, attempt: any) => total + Number(attempt.result?.max_score || 0), 0)
  const percent = max ? Math.round((score / max) * 100) : null
  const minimum = Number(activity.settings?.grading?.minimum_score_percent ?? 70)
  if (pending) return { status: 'pending', label: 'Submitted · pending review', detail: 'Your instructor is reviewing this activity.', icon: Clock3, tone: 'bg-blue-100 text-blue-700', badgeTone: 'bg-blue-50 text-blue-700', breakdown }
  if (allComplete && percent !== null && percent < minimum) return { status: 'failed', label: 'Needs retaking', detail: `${percent}% earned · ${minimum}% required. Open to review and try again.`, icon: RotateCcw, tone: 'bg-amber-100 text-amber-700', badgeTone: 'bg-amber-50 text-amber-700', breakdown }
  if (allComplete) return { status: 'completed', label: 'Completed', detail: percent === null ? '' : `${percent}% earned`, icon: CheckCircle2, tone: 'bg-green-100 text-green-700', badgeTone: 'bg-green-50 text-green-700', breakdown }
  if (progress.some((item: any) => item.complete) || attempts.length) return { status: 'in_progress', label: 'In progress', detail: '', icon: Clock3, tone: 'bg-amber-100 text-amber-700', badgeTone: 'bg-amber-50 text-amber-700', breakdown }
  return { status: 'not_started', label: 'Not started', detail: '', icon: Circle, tone: 'bg-muted text-muted-foreground', badgeTone: 'bg-muted text-muted-foreground', breakdown }
}
