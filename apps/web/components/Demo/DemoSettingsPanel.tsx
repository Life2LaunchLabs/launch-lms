'use client'
import { useState } from 'react'
import { Button } from '@components/ui/button'
import { Input } from '@components/ui/input'
import { Label } from '@components/ui/label'
import { Switch } from '@components/ui/switch'
import { demoRequest, announceDemoSetupChange, type DemoSettings } from '@services/demo/demo'

const LIMITS = [
  ['capacity', 'Concurrent visitors', 1, 1000],
  ['session_minutes', 'Session length (minutes)', 10, 1440],
  ['extension_minutes', 'Extension length (minutes)', 10, 1440],
  ['ai_requests_per_minute', 'AI requests per minute per visitor', 1, 60],
  ['ai_tokens_per_visitor', 'AI token allowance per visitor per day', 1000, 1000000],
  ['ai_tokens_per_day', 'Total AI token allowance per day', 1000, 100000000],
] as const

export default function DemoSettingsPanel({ settings, readyWorkspaces = 0, onSaved }: { settings: DemoSettings; readyWorkspaces?: number; onSaved: () => void }) {
  const [draft, setDraft] = useState(settings)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function save(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true); setError('')
    try { await demoRequest('settings', 'PUT', draft); announceDemoSetupChange(); onSaved() }
    catch (failure) { setError((failure as Error).message) }
    finally { setBusy(false) }
  }
  return <form onSubmit={save} className="flex max-w-2xl flex-col rounded-xl border bg-card">
    <div className="space-y-5 p-5">
    <p className="text-sm text-muted-foreground">Ready copies: {readyWorkspaces} of {settings.capacity}. Clean copies prepare in the background after publishing and refill as visitors leave.</p>
    <div className="flex items-center justify-between gap-4"><Label htmlFor="demo-enabled">Accept new visitors</Label><Switch id="demo-enabled" checked={draft.enabled} onCheckedChange={(enabled) => setDraft({ ...draft, enabled })} /></div>
    <div className="space-y-2"><div className="flex items-center justify-between gap-4"><Label htmlFor="demo-auto-recapture">Publish again automatically after product updates</Label><Switch id="demo-auto-recapture" checked={draft.auto_recapture} onCheckedChange={(auto_recapture) => setDraft({ ...draft, auto_recapture })} /></div><p className="text-xs leading-5 text-muted-foreground">A product update outdates the published version, so new visits pause until it is replaced. This republishes the demo users as they are at that moment. Turn it off while you are mid-setup and publish yourself.</p>{settings.recapture_error && <p role="alert" className="text-xs leading-5 text-destructive">The last automatic publish failed: {settings.recapture_error} Fix this, then publish from the Publish tab.</p>}</div>
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{LIMITS.map(([key, label, min, max]) => <div className="space-y-2" key={key}><Label htmlFor={`demo-${key}`}>{label}</Label><Input id={`demo-${key}`} type="number" required min={min} max={max} step={1} value={draft[key]} onChange={(event) => setDraft({ ...draft, [key]: Number(event.target.value) })} /></div>)}</div>
    <p className="text-xs leading-5 text-muted-foreground">Visitors see a five-minute warning and can extend. AI allowances cover chat, AI generation and background memory processing. Starting over does not replenish the daily allowance.</p>
    </div>
    <div className="shrink-0 space-y-3 border-t p-4">
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save settings'}</Button>
    </div>
  </form>
}
