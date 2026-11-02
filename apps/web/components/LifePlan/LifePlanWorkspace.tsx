'use client'

import React from 'react'
import useSWR from 'swr'
import { toast } from 'react-hot-toast'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import GeneralWrapperStyled from '@components/Objects/StyledElements/Wrappers/GeneralWrapper'
import { Skeleton } from '@components/ui/skeleton'
import { lifeApi, lifeUrl, type Estimate, type LifeDoc, type Line, type Phase } from '@services/life/life'
import { LifeContext, type LifeCtx } from './LifeContext'
import { estimateQuery, lineValue, project, stretches, type Per } from './model'
import ContextBar from './ContextBar'
import PhaseChart from './PhaseChart'
import BudgetTable from './BudgetTable'
import { DebtCard, OneTimeCard, OwnCard, SavingsCard } from './MoneyCards'
import AddTray, { type AddTarget } from './AddTray'
import StartPlan from './StartPlan'

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x))

/** Life plan: phases of life, each with a budget, and what the money adds up to over time. */
export default function LifePlanWorkspace() {
  const session = useLHSession() as any
  const token: string | undefined = session?.data?.tokens?.access_token
  const { data, error, isLoading, mutate } = useSWR(token ? lifeUrl('/plan') : null, () => lifeApi.get(token), { revalidateOnFocus: false })
  const { data: catalog } = useSWR(token ? lifeUrl('/catalog') : null, () => lifeApi.catalog(token), { revalidateOnFocus: false })
  const [doc, setDoc] = React.useState<LifeDoc | null>(null)
  const [saving, setSaving] = React.useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const revision = React.useRef<number | null>(null)
  const pending = React.useRef<LifeDoc | null>(null)
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const [ready, setReady] = React.useState(false)
  const [per, setPer] = React.useState<Per>('mo')
  const [sel, setSel] = React.useState<{ phase: string; i: number } | null>(null)
  const [openLine, setOpenLine] = React.useState<string | null>(null)
  const [add, setAdd] = React.useState<AddTarget | null>(null)

  React.useEffect(() => {
    if (!data || ready) return
    setReady(true)
    setDoc(data.plan?.document ?? null)
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
      setSaving(pending.current ? 'saving' : 'saved')
    } catch (e: any) {
      setSaving('error')
      if (e?.status === 409) {
        toast.error('Your life plan changed in another window. Loading the newest version.')
        const fresh = await mutate()
        setDoc(fresh?.plan?.document ?? null)
        revision.current = fresh?.plan?.revision ?? null
      } else toast.error("Couldn't save your life plan. Your last change is kept on this page.")
    }
  }, [token, mutate])

  const commit = React.useCallback((next: LifeDoc) => {
    setDoc(next)
    pending.current = next
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => { void flush() }, 700)
  }, [flush])

  React.useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  // Estimates for every line that has a metric, looked up together.
  const queries = React.useMemo(() => {
    if (!doc || !catalog) return []
    return doc.phases.flatMap((p) => p.lines.map((l) => estimateQuery(catalog, p, l)).filter(Boolean)) as NonNullable<ReturnType<typeof estimateQuery>>[]
  }, [doc, catalog])
  const qKey = JSON.stringify(queries)
  const { data: est, isLoading: estLoading } = useSWR(token && queries.length ? ['life-estimates', qKey] : null, () => lifeApi.estimates(queries, token), { revalidateOnFocus: false, keepPreviousData: true })
  const estimates: Record<string, Estimate | null> = est?.estimates || {}

  if (!token || isLoading || (data && !ready)) {
    return <GeneralWrapperStyled><div className="mx-auto max-w-[860px] space-y-4"><Skeleton className="h-10 w-48" /><Skeleton className="h-40 w-full" /><Skeleton className="h-96 w-full" /></div></GeneralWrapperStyled>
  }
  if (error) return <GeneralWrapperStyled><p className="text-muted-foreground">Couldn't load your life plan. Try again in a moment.</p></GeneralWrapperStyled>
  if (!doc || !doc.phases.length) {
    return <GeneralWrapperStyled><StartPlan token={token} existing={doc} onStart={(next) => { commit(next); setSel({ phase: next.phases[0].id, i: 0 }) }} /></GeneralWrapperStyled>
  }

  const phase: Phase = doc.phases.find((p) => p.id === sel?.phase) || doc.phases[0]
  const stretchesOf = stretches(doc, phase)
  const stretch = stretchesOf[Math.min(sel?.phase === phase.id ? sel.i : 0, stretchesOf.length - 1)]
  const valueOf = (p: Phase, l: Line) => lineValue(l, estimates[`${p.id}:${l.id}`])
  const projection = project(doc, valueOf)

  const ctx: LifeCtx = {
    token, doc, catalog, estimates, estimatesLoading: estLoading, per, setPer, phase, stretch, stretchesOf,
    selectStretch: (phaseId, i) => { setSel({ phase: phaseId, i }); setOpenLine(null) },
    projection, valueOf,
    update: (fn) => { const next = clone(doc); fn(next); commit(next) },
    updatePhase: (fn) => { const next = clone(doc); const p = next.phases.find((x) => x.id === phase.id); if (p) fn(p); commit(next) },
    openLine, setOpenLine,
    openAdd: (side, cat) => setAdd({ side, cat }),
  }

  return (
    <LifeContext.Provider value={ctx}>
      <div className="mx-auto w-full max-w-[900px] px-4 pb-24 sm:px-6">
        <ContextBar saving={saving} />
        <PhaseChart />
        <div className="mb-3 mt-8 flex items-center justify-between gap-3">
          <h2 className="text-2xl font-extrabold tracking-tight">Budget</h2>
          <div className="flex rounded-full bg-muted p-1" role="group" aria-label="Show amounts per">
            {(['wk', 'mo', 'yr'] as Per[]).map((p) => (
              <button key={p} type="button" onClick={() => setPer(p)} aria-pressed={per === p} className={`rounded-full px-3 py-1 text-sm font-semibold ${per === p ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'}`}>{p === 'wk' ? 'Week' : p === 'mo' ? 'Month' : 'Year'}</button>
            ))}
          </div>
        </div>
        <div className="space-y-4">
          <BudgetTable />
          <OneTimeCard />
          <DebtCard />
          <SavingsCard />
          <OwnCard />
        </div>
        <p className="mt-6 text-xs text-muted-foreground">
          Estimates appear only where we have a published source for them, and each one says where it comes from. Lines without an estimate use your own number. Amounts are before taxes; taxes aren't worked out yet.
        </p>
      </div>
      <AddTray target={add} onClose={() => setAdd(null)} />
    </LifeContext.Provider>
  )
}
