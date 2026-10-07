'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
import DemoSelection from '@components/Demo/DemoSelection'
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
      const tokens = await waitForDemo(controller.signal)
      if (!controller.signal.aborted) window.location.assign(`/orgs/${encodeURIComponent(tokens.entry_org_slug)}/hub`)
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
  async function start(userId: number) {
    cancelled.current = false; admitting.current = true
    setBusy(true); setError('')
    try {
      await demoRequest('start', 'POST', { user_id: userId })
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
  return <DemoSelection busy={busy} error={error} onStart={userId => void start(userId)} onCancel={() => void cancel()} />
}
