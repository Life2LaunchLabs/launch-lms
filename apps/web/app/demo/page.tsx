'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
import { FlaskConical, ArrowRight, RotateCcw, MessageCircle, Layers } from 'lucide-react'
import { Button } from '@components/ui/button'
import { demoRequest, waitForDemo, type DemoStatus } from '@services/demo/demo'

export default function DemoEntry() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const waiting = useRef<AbortController | null>(null)
  const admitting = useRef(false)
  const cancelled = useRef(false)
  const resume = useCallback(async () => {
    const controller = new AbortController()
    waiting.current = controller
    setBusy(true); setError('')
    try {
      await waitForDemo(controller.signal)
      if (!controller.signal.aborted) window.location.assign('/')
    } catch (failure) {
      if (!controller.signal.aborted) setError((failure as Error).message)
    } finally {
      if (waiting.current === controller) { waiting.current = null; setBusy(false) }
    }
  }, [])
  useEffect(() => {
    let mounted = true
    void demoRequest<DemoStatus>('status').then((state) => { if (mounted && state.preparing) void resume() }).catch(() => {})
    return () => { mounted = false; waiting.current?.abort() }
  }, [resume])
  async function start() {
    cancelled.current = false; admitting.current = true
    setBusy(true); setError('')
    try {
      await demoRequest('start', 'POST')
      admitting.current = false
      if (cancelled.current) { await demoRequest('end', 'POST'); setBusy(false); return }
      await resume()
    }
    catch (failure) { if (!cancelled.current) setError((failure as Error).message); setBusy(false) }
    finally { admitting.current = false }
  }
  async function cancel() {
    cancelled.current = true
    // Finish admission so its signed ticket can revoke the copy, even when the
    // visitor cancels before the quick admission response arrives.
    if (admitting.current) return
    waiting.current?.abort()
    waiting.current = null; setBusy(false)
    try { await demoRequest('end', 'POST') }
    catch (failure) { setError((failure as Error).message) }
  }
  return <div className="flex min-h-[calc(100dvh-var(--demo-bar-height,0px))] items-center justify-center bg-background px-6 py-12">
    <section className="w-full max-w-xl">
      <div className="mb-8 flex items-center gap-2 text-sm font-semibold text-indigo-600 dark:text-indigo-400"><FlaskConical className="h-5 w-5" />Launch demo</div>
      <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Make yourself at home.</h1>
      <p className="mt-5 text-lg leading-8 text-muted-foreground">Explore Launch with an account that’s ready to go. Start a badge, shape a plan, or talk things through with your companion.</p>
      <div className="my-8 space-y-4 text-sm"><p className="flex gap-3"><Layers className="h-5 w-5 shrink-0 text-muted-foreground" />Real resources and organization-assigned plans, prepared by our team.</p><p className="flex gap-3"><MessageCircle className="h-5 w-5 shrink-0 text-muted-foreground" />Live AI chat, with a demo allowance.</p><p className="flex gap-3"><RotateCcw className="h-5 w-5 shrink-0 text-muted-foreground" />Your own space to experiment. Reset or leave whenever you like.</p></div>
      <Button size="lg" disabled={busy} onClick={() => void start()} className="w-full sm:w-auto">{busy ? 'Preparing your demo…' : 'Start demo'}<ArrowRight className="ml-2 h-4 w-4" /></Button>
      {busy && <Button variant="ghost" className="mt-2 w-full sm:ml-3 sm:mt-0 sm:w-auto" onClick={() => void cancel()}>Cancel</Button>}
      {error && <p role="alert" className="mt-4 text-sm text-destructive">{error}</p>}
      <p className="mt-6 text-xs leading-5 text-muted-foreground">Changes are temporary and private to your session. Emails are simulated; payments and external publishing are unavailable. Limits are explained when you reach them. Please use example information.</p>
    </section>
  </div>
}
