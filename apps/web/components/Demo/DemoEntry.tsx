'use client'
import Image from 'next/image'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowRight, UserRound } from 'lucide-react'
import { Button } from '@components/ui/button'
import { getConfig } from '@services/config/config'
import {
  cleanDemoTag, demoAccountName, demoAvatarUrl, demoRequest, demoStartPath, rememberDemoTag, rememberedDemoTag, waitForDemo,
  type DemoAccount, type DemoStatus,
} from '@services/demo/demo'

function Portrait({ checkpointId, account, size }: { checkpointId?: string | null; account: DemoAccount; size: number }) {
  const url = demoAvatarUrl(checkpointId, account)
  return <div className="flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300" style={{ width: size, height: size }}>
    {url ? <Image src={url} width={size} height={size} unoptimized alt="" className="h-full w-full object-cover" /> : <UserRound aria-hidden style={{ width: size / 2.4, height: size / 2.4 }} />}
  </div>
}

/** Visitor entry: the picker at /demo, or a direct demo-user link at /demo/<handle>. */
export default function DemoEntry({ handle }: { handle?: string }) {
  const [state, setState] = useState<DemoStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const waiting = useRef<AbortController | null>(null)
  const admitting = useRef(false)
  const cancelled = useRef(false)
  const autoStarted = useRef(false)
  const [ended, setEnded] = useState(false)
  useEffect(() => { setEnded(new URLSearchParams(window.location.search).get('ended') === '1') }, [])

  const resume = useCallback(async () => {
    const controller = new AbortController()
    waiting.current = controller
    setBusy(true); setError('')
    try {
      const tokens = await waitForDemo(controller.signal)
      if (controller.signal.aborted) return
      // The guide opens on arrival; DemoExperience removes this flag.
      const destination = new URL(demoStartPath(tokens), window.location.origin)
      destination.searchParams.set('demo_guide', '1')
      window.location.assign(destination.toString())
    } catch (failure) {
      if (!controller.signal.aborted) setError((failure as Error).message)
    } finally {
      if (waiting.current === controller) { waiting.current = null; setBusy(false) }
    }
  }, [])

  const start = useCallback(async (userId: number) => {
    cancelled.current = false; admitting.current = true
    setBusy(true); setError('')
    const tag = cleanDemoTag(new URLSearchParams(window.location.search).get('tag')) || rememberedDemoTag()
    rememberDemoTag(tag || null)
    try {
      await demoRequest('start', 'POST', { user_id: userId, tag })
      admitting.current = false
      if (cancelled.current) { await demoRequest('end', 'POST'); setBusy(false); return }
      await resume()
    } catch (failure) { if (!cancelled.current) setError((failure as Error).message); setBusy(false) }
    finally { admitting.current = false }
  }, [resume])

  useEffect(() => {
    let mounted = true
    void demoRequest<DemoStatus>('status').then((status) => {
      if (!mounted) return
      setState(status)
      if (status.preparing) { void resume(); return }
      const target = handle ? status.accounts?.find((account) => account.handle === handle) : undefined
      if (status.mode === 'visitor' && (!handle || status.pilot_user_id === target?.user_id)) {
        window.location.assign(demoStartPath(status)); return
      }
      // A scanned link starts right away; the person can still back out.
      if (target && status.mode !== 'operator' && !autoStarted.current) { autoStarted.current = true; void start(target.user_id) }
    }).catch((failure) => { if (mounted) setError((failure as Error).message) })
    return () => { mounted = false; waiting.current?.abort() }
  }, [handle, resume, start])

  async function cancel() {
    cancelled.current = true
    // Finish admission so its signed ticket can revoke the copy.
    if (admitting.current) return
    waiting.current?.abort()
    waiting.current = null; setBusy(false)
    try { await demoRequest('end', 'POST') } catch (failure) { setError((failure as Error).message) }
  }

  const accounts = state?.accounts || []
  const selected = handle ? accounts.find((account) => account.handle === handle) : undefined
  const operator = state?.mode === 'operator' || state?.mode === 'admin'
  const liveDomain = getConfig('NEXT_PUBLIC_LAUNCHLMS_DOMAIN', 'life2launch.app')
  const studioUrl = `${getConfig('NEXT_PUBLIC_LAUNCHLMS_HTTPS', 'true') === 'true' ? 'https' : 'http'}://${liveDomain}/login?next=${encodeURIComponent('/admin/platform/demo')}`

  if (handle && (selected || !state)) {
    return <div className="flex min-h-[calc(100dvh-var(--demo-bar-height,0px))] items-center justify-center bg-background px-4 py-10">
      <section className="flex w-full max-w-sm flex-col items-center gap-5 rounded-2xl border bg-card p-7 text-center">
        {selected ? <>
          <Portrait checkpointId={state?.checkpoint_id} account={selected} size={88} />
          <div><p className="text-sm text-muted-foreground">You&apos;re about to explore as</p><h1 className="mt-1 text-2xl font-semibold tracking-tight">{demoAccountName(selected)}</h1>{selected.role_line ? <p className="mt-1 text-sm font-medium text-indigo-600 dark:text-indigo-400">{selected.role_line}</p> : null}</div>
          {selected.description ? <p className="text-sm leading-6 text-muted-foreground">{selected.description}</p> : null}
          {operator ? <p className="text-sm text-muted-foreground">You&apos;re signed in as a platform admin. Starting a demo here signs you out of that session.</p> : null}
          {busy ? <div role="status" className="w-full space-y-2"><div className="h-1.5 w-full overflow-hidden rounded-full bg-muted"><div className="h-full w-2/3 animate-pulse rounded-full bg-indigo-500" /></div><p className="text-xs text-muted-foreground">Getting {selected.first_name}&apos;s account ready…</p></div>
            : <Button className="w-full" onClick={() => void start(selected.user_id)}>Explore as {selected.first_name}<ArrowRight className="ml-2 h-4 w-4" /></Button>}
        </> : <p role="status" className="text-sm text-muted-foreground">Loading…</p>}
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        <button type="button" onClick={() => void (busy ? cancel() : Promise.resolve()).then(() => window.location.assign('/demo'))} className="text-sm text-muted-foreground underline underline-offset-4">Not {selected?.first_name || 'them'}? Choose someone else</button>
      </section>
    </div>
  }

  return <div className="min-h-[calc(100dvh-var(--demo-bar-height,0px))] bg-background px-4 py-10 sm:px-8 sm:py-14">
    <section className="mx-auto w-full max-w-5xl space-y-8">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-base font-semibold">Life2Launch</span>
        {state?.unstable ? <span className="rounded-md bg-amber-400 px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-amber-950">Unstable</span> : null}
        <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-bold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">Demo</span>
        <span className="flex-1" />
        {operator ? <a href="/admin/platform/demo" className="text-sm font-medium text-indigo-600 underline underline-offset-4 dark:text-indigo-400">Open Demo Studio</a>
          : <a href={studioUrl} className="text-xs text-muted-foreground underline underline-offset-4">Studio sign-in</a>}
      </div>
      <div className="max-w-2xl space-y-3"><h1 className="text-3xl font-semibold tracking-tight [text-wrap:balance] sm:text-5xl">Try Life2Launch as someone else.</h1><p className="text-base leading-7 text-muted-foreground">Pick a person. You get a private copy of their account to explore. Nothing you do affects anyone.</p></div>
      {ended && !busy ? <p role="status" className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">Your demo ended and its changes were discarded. Pick anyone to start again.</p> : null}
      {operator ? <p className="rounded-xl border bg-card p-4 text-sm leading-6 text-muted-foreground">You&apos;re signed in as a platform admin. Starting a demo here signs you out of that session. To set up demo users, open Demo Studio.</p> : null}
      {!state && !error ? <p role="status" className="text-muted-foreground">Loading demo users…</p> : null}
      {state && !accounts.length ? <div className="rounded-2xl border p-6 text-sm leading-6 text-muted-foreground">No demo users are available right now. Please try again later.</div> : null}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{accounts.map((account) => <article key={account.user_id} data-testid={`demo-account-${account.user_id}`} className="flex min-w-0 flex-col gap-3 rounded-2xl border bg-card p-5">
        <Portrait checkpointId={state?.checkpoint_id} account={account} size={64} />
        <div><h2 className="break-words text-lg font-semibold">{demoAccountName(account)}</h2>{account.role_line ? <p className="text-sm font-medium text-indigo-600 dark:text-indigo-400">{account.role_line}</p> : null}</div>
        <p className="whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">{account.description}</p>
        {account.journeys?.length ? <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">{account.journeys.slice(0, 2).map((title) => <li key={title}>{title}</li>)}</ul> : null}
        <span className="flex-1" />
        <Button disabled={busy} onClick={() => void start(account.user_id)}>{busy ? 'Preparing…' : `Explore as ${account.first_name || demoAccountName(account)}`}<ArrowRight className="ml-2 h-4 w-4" /></Button>
      </article>)}</div>
      {busy ? <div role="status" className="flex flex-wrap items-center gap-3"><p className="text-sm text-muted-foreground">Preparing your private demo…</p><Button variant="outline" onClick={() => void cancel()}>Cancel</Button></div> : null}
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      <p className="max-w-3xl text-xs leading-5 text-muted-foreground">Your copy is private and is discarded when you leave. Emails are simulated and payments are off. The AI coach is real and has a demo allowance.</p>
    </section>
  </div>
}
