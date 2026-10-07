'use client'
import Image from 'next/image'
import { useCallback, useEffect, useState } from 'react'
import { FlaskConical, ArrowRight, UserRound } from 'lucide-react'
import { Button } from '@components/ui/button'
import { getConfig } from '@services/config/config'
import { demoRequest, demoAccountName, type DemoStatus } from '@services/demo/demo'
import DemoCohortManager from './DemoCohortManager'

export default function DemoSelection({ busy, error, onStart, onCancel }: { busy: boolean; error: string; onStart: React.Dispatch<number>; onCancel: () => void }) {
  const [state, setState] = useState<DemoStatus | null>(null)
  const [manage, setManage] = useState(false)
  const [failure, setFailure] = useState('')
  const [notice, setNotice] = useState('')
  const refresh = useCallback(async () => {
    try { setState(await demoRequest<DemoStatus>('status')); setFailure('') }
    catch (problem) { setFailure((problem as Error).message) }
  }, [])
  useEffect(() => {
    const controller = new AbortController()
    void demoRequest<DemoStatus>('status', 'GET', undefined, controller.signal).then(setState).catch(problem => { if (!controller.signal.aborted) setFailure((problem as Error).message) })
    window.addEventListener('demo-setup-changed', refresh)
    return () => { controller.abort(); window.removeEventListener('demo-setup-changed', refresh) }
  }, [refresh])
  const operator = state?.mode === 'operator'
  const accounts = operator ? state.members || [] : state?.accounts || []
  const liveDomain = getConfig('NEXT_PUBLIC_LAUNCHLMS_DOMAIN', 'life2launch.app')
  const adminUrl = `${getConfig('NEXT_PUBLIC_LAUNCHLMS_HTTPS', 'true') === 'true' ? 'https' : 'http'}://${liveDomain}/login?next=%2Fdemo`
  async function enter(userId: number) {
    try {
      const result = await demoRequest<{ tokens: { entry_org_slug: string } }>('admin/enter', 'POST', { user_id: userId }); window.location.assign(`/orgs/${encodeURIComponent(result.tokens.entry_org_slug)}/hub`)
    } catch (problem) { setFailure((problem as Error).message) }
  }
  return <div className="min-h-[calc(100dvh-var(--demo-bar-height,0px))] bg-background px-5 py-12 sm:px-8 sm:py-16">
    <section className="mx-auto w-full max-w-5xl space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2 text-sm font-semibold text-indigo-600 dark:text-indigo-400"><FlaskConical className="h-5 w-5" />Launch demo</div>{operator ? <Button variant="outline" aria-expanded={manage} onClick={() => setManage(value => !value)}>{manage ? 'Close account management' : 'Manage demo accounts'}</Button> : <a href={adminUrl} className="text-sm text-muted-foreground underline underline-offset-4">Admin sign-in</a>}</div>
      <div><h1 className="text-3xl font-semibold tracking-tight sm:text-5xl">Choose your demo user.</h1><p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">{operator ? 'Prepare any account with the normal product editors, then publish the whole organization and cohort as one checkpoint.' : 'Explore the same prepared organization through a different account. Each visit gets a private copy, with live chat, badges and plans.'}</p></div>
      {operator && manage && state.settings && <DemoCohortManager key={state.settings.revision} members={state.members || []} revision={state.settings.revision} onSaved={() => { setNotice('Cohort saved. Publish a checkpoint to update visitor selection.'); void refresh() }} />}
      {operator && notice && <p role="status" className="text-sm text-muted-foreground">{notice}</p>}
      {!state && !failure && <p role="status" className="text-muted-foreground">Loading demo accounts…</p>}
      {state && !accounts.length && <div className="rounded-2xl border p-6 text-sm leading-6 text-muted-foreground">{operator ? 'Choose the fictional organization in Settings, then add its demo accounts here. At least one account must be pilotable before publication.' : 'No demo accounts are available yet. Please try again later.'}</div>}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{accounts.map(account => <article key={account.user_id} data-testid={`demo-account-${account.user_id}`} className="flex min-w-0 flex-col rounded-2xl border bg-card p-6">
        <div className="mb-5 flex h-14 w-14 items-center justify-center overflow-hidden rounded-full bg-muted">{account.avatar_url ? <Image src={account.avatar_url} width={56} height={56} unoptimized alt="" className="h-full w-full object-cover" /> : <UserRound aria-hidden className="h-6 w-6 text-muted-foreground" />}</div>
        <h2 className="break-words text-lg font-semibold">{demoAccountName(account)}</h2>
        {operator && <p className="mt-1 text-xs text-muted-foreground">{'pilotable' in account && account.pilotable ? 'Pilotable after publication' : 'Cohort member · setup only'}</p>}
        <p className="mb-6 mt-3 flex-1 whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">{account.description}</p>
        <Button disabled={busy} onClick={() => operator ? void enter(account.user_id) : onStart(account.user_id)}>{operator ? 'Edit live account' : busy ? 'Preparing…' : 'Start demo'}<ArrowRight className="ml-2 h-4 w-4" /></Button>
      </article>)}</div>
      {busy && <div role="status" className="flex flex-wrap items-center gap-3"><p className="text-sm text-muted-foreground">Preparing your private demo…</p><Button variant="outline" onClick={onCancel}>Cancel</Button></div>}
      {(error || failure) && <p role="alert" className="text-sm text-destructive">{error || failure}</p>}
      <p className="max-w-3xl text-xs leading-5 text-muted-foreground">Changes are temporary and private to your session. Back to demo users discards your work. Emails are simulated; payments and external publishing are unavailable. Live AI chat has a demo allowance, shared when you reset or choose another account.</p>
    </section>
  </div>
}
