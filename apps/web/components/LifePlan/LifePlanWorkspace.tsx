'use client'

import React from 'react'
import useSWR from 'swr'
import { useRouter } from 'next/navigation'
import { toast } from 'react-hot-toast'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import GeneralWrapperStyled from '@components/Objects/StyledElements/Wrappers/GeneralWrapper'
import { Skeleton } from '@components/ui/skeleton'
import { lifeApi, lifeUrl, type LifeDoc, type Phase } from '@services/life/life'
import { LifeContext, type LifeCtx } from './LifeContext'
import { stretches, type Per } from './model'
import useLifeNumbers from './useLifeNumbers'
import { mergeRoute, normalize, routeDoc } from '@components/Goals/phases/graph'
import ContextBar from './ContextBar'
import PhaseChart from './PhaseChart'
import BudgetSummary from './BudgetSummary'
import BudgetTable from './BudgetTable'
import { OneTimeCard } from './MoneyCards'
import { YouOwnCard } from './YouOwn'
import { SavingsDebtCard } from './SavingsDebt'
import AddTray, { type AddTarget } from './AddTray'
import EstimatesDialog from './EstimatesDialog'
import Link from 'next/link'
import { Button } from '@components/ui/button'
import { getUriWithOrg } from '@services/config/config'

import { tr } from '@/lib/tr'
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x))
const sharedName = (person?: { username: string; name?: string } | null) => person ? (person.name?.split(' ')[0] || `@${person.username}`) : undefined

/** A phase's budget, and what the money adds up to over time, opened from the phase in Plans.
 *  With `of` (a user uuid) it shows that person's plan, when they shared their plans with you, and nothing saves. */
export default function LifePlanWorkspace({ of, phaseId, orgslug }: { of?: string; phaseId?: string; orgslug: string }) {
  const router = useRouter()
  const session = useLHSession() as any
  const token: string | undefined = session?.data?.tokens?.access_token
  const { data, error, isLoading, mutate } = useSWR(token ? lifeUrl(of ? `/shared/${of}` : '/plan') : null, () => (of ? lifeApi.shared(of, token) : lifeApi.get(token)), { revalidateOnFocus: false })
  const owner = of ? sharedName((data as any)?.person) : undefined
  // The whole map; the budget reads one route through it (see `view`).
  const [full, setFull] = React.useState<LifeDoc | null>(null)
  const [saving, setSaving] = React.useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const revision = React.useRef<number | null>(null)
  const pending = React.useRef<LifeDoc | null>(null)
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const [ready, setReady] = React.useState(false)
  const [per, setPer] = React.useState<Per>('mo')
  const [sel, setSel] = React.useState<{ phase: string; i: number } | null>(phaseId ? { phase: phaseId, i: 0 } : null)
  const [openLine, setOpenLine] = React.useState<string | null>(null)
  const [add, setAdd] = React.useState<AddTarget | null>(null)
  const [estOpen, setEstOpen] = React.useState(false)

  React.useEffect(() => {
    if (!data || ready) return
    setReady(true)
    setFull(data.plan?.document ? normalize(data.plan.document) : null)
    revision.current = data.plan?.revision ?? null
  }, [data, ready])

  const flush = React.useCallback(async () => {
    const next = pending.current
    if (!next) return
    pending.current = null
    setSaving('saving')
    try {
      const res = await lifeApi.save(next, revision.current, token)
      revision.current = res.plan.revision
      // The plans pages read the same plan: keep their copy (and its revision) current.
      if (!of) void mutate({ plan: res.plan }, { revalidate: false })
      setSaving(pending.current ? 'saving' : 'saved')
    } catch (e: any) {
      setSaving('error')
      if (e?.status === 409) {
        toast.error(tr('budget.life_plan_workspace.your_life_plan_changed_in', 'Your life plan changed in another window. Loading the newest version.'))
        const fresh = await mutate()
        setFull(fresh?.plan?.document ? normalize(fresh.plan.document) : null)
        revision.current = fresh?.plan?.revision ?? null
      } else toast.error(tr('budget.life_plan_workspace.couldn_t_save_your_life', 'Couldn\'t save your life plan. Your last change is kept on this page.'))
    }
  }, [token, mutate, of])

  const commit = React.useCallback((next: LifeDoc) => {
    if (of) return
    setFull(next)
    pending.current = next
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => { void flush() }, 700)
  }, [flush, of])

  // Leaving the page saves a change still waiting for its pause.
  const flushRef = React.useRef(flush)
  React.useEffect(() => { flushRef.current = flush }, [flush])
  React.useEffect(() => () => { if (timer.current) clearTimeout(timer.current); void flushRef.current() }, [])

  // The budget and its chart read the plan as one line: the route through the phase being looked at.
  const routeOf = sel?.phase || phaseId || full?.phases[0]?.id
  const doc = React.useMemo(() => (full && routeOf ? routeDoc(full, routeOf) : full), [full, routeOf])
  const { catalog, estimates, estimatesLoading: estLoading, valueOf, projection: proj } = useLifeNumbers(doc, token)

  if (!token || isLoading || (data && !ready)) {
    return <GeneralWrapperStyled><div className="mx-auto max-w-[860px] space-y-4"><Skeleton className="h-10 w-48" /><Skeleton className="h-40 w-full" /><Skeleton className="h-96 w-full" /></div></GeneralWrapperStyled>
  }
  if (error) return <GeneralWrapperStyled><p className="text-muted-foreground">{of ? tr('budget.life_plan_workspace.this_plan_isn_t_shared', 'This plan isn’t shared with you.') : tr('budget.life_plan_workspace.couldn_t_load_your_life', 'Couldn’t load your life plan. Try again in a moment.')}</p></GeneralWrapperStyled>
  if (of && (!doc || !doc.phases.length)) return <GeneralWrapperStyled><p className="text-muted-foreground">{owner || tr('budget.life_plan_workspace.they', 'They')}{' '}{tr('budget.life_plan_workspace.haven_t_started_a_life', 'haven’t started a life plan yet.')}</p></GeneralWrapperStyled>
  if (!doc || !doc.phases.length) {
    return <GeneralWrapperStyled><div className="py-16 text-center">
      <p className="text-lg font-bold">{tr('budget.life_plan_workspace.budgets_belong_to_a_phase', 'Budgets belong to a phase of your plan.')}</p>
      <Button variant="brand" className="mt-4" asChild><Link href={getUriWithOrg(orgslug, '/plans')}>{tr('budget.life_plan_workspace.go_to_plans', 'Go to Plans')}</Link></Button>
    </div></GeneralWrapperStyled>
  }

  const phase: Phase = doc.phases.find((p) => p.id === sel?.phase) || doc.phases[0]
  const stretchesOf = stretches(doc, phase)
  const stretch = stretchesOf[Math.min(sel?.phase === phase.id ? sel.i : 0, stretchesOf.length - 1)]
  const projection = proj!

  const ctx: LifeCtx = {
    token, doc, catalog, estimates, estimatesLoading: estLoading, per, setPer, phase, stretch, stretchesOf,
    selectStretch: (id, i) => {
      setSel({ phase: id, i }); setOpenLine(null)
      // The address follows the phase, so back and a reload land on the budget being looked at.
      if (!of && id !== phase.id) window.history.replaceState(window.history.state, '', getUriWithOrg(orgslug, `/plans/phase/${encodeURIComponent(id)}/budget`))
    },
    projection, valueOf,
    update: (fn) => { const next = clone(doc); fn(next); commit(mergeRoute(full!, next)) },
    updatePhase: (fn) => { const next = clone(doc); const p = next.phases.find((x) => x.id === phase.id); if (p) fn(p); commit(mergeRoute(full!, next)) },
    openLine, setOpenLine, readOnly: Boolean(of),
    openAdd: (side, cat) => setAdd({ side, cat }),
    openEstimates: of ? undefined : () => setEstOpen(true),
  }

  return (
    <LifeContext.Provider value={ctx}>
      <div className="mx-auto w-full max-w-[900px] px-4 pb-24 sm:px-6">
        <ContextBar saving={saving} owner={owner} onBack={() => (of ? router.back() : router.push(getUriWithOrg(orgslug, `/plans/phase/${encodeURIComponent(phase.id)}`)))} backLabel={of ? tr('lit.life_plan_workspace.back', 'Back') : `Back to ${phase.title}`} full={full}
          onMap={of ? undefined : () => router.push(getUriWithOrg(orgslug, '/plans'))} />
        <BudgetSummary />
        <div className="mt-2"><PhaseChart /></div>
        <div className="mt-5" />
        {/* A shared plan reads like yours, with every control that would change it turned off. */}
        <fieldset disabled={Boolean(of)} className="min-w-0 space-y-5">
          <BudgetTable />
          <SavingsDebtCard />
          <OneTimeCard />
          <YouOwnCard />
        </fieldset>
        <p className="mt-6 text-xs text-muted-foreground">
          {tr('budget.life_plan_workspace.estimates_appear_only_where_we', 'Estimates appear only where we have a published source for them, and each one says where it comes from. Lines without an estimate use your own number. Taxes are a rough estimate on pay from work, from the latest published federal and Oregon rates; open Taxes under Income to see how, or use your own rate.')}
        </p>
      </div>
      {of ? null : <AddTray target={add} onClose={() => setAdd(null)} />}
      {of || !estOpen ? null : <EstimatesDialog open mode={phase.lines.length ? 'fill' : 'start'} base={null} phase={phase} catalog={catalog} token={token}
        onApply={(lines) => ctx.updatePhase((p) => { p.lines = lines })} onClose={() => setEstOpen(false)} />}
    </LifeContext.Provider>
  )
}
