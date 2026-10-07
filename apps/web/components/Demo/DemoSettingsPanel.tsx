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
  return <form onSubmit={save} className="flex max-h-[80dvh] flex-col">
    <div className="scrollbar-subtle min-h-0 space-y-5 overflow-y-auto p-5">
    <div><h2 className="text-lg font-semibold">Demo settings</h2><p className="mt-1 text-sm text-muted-foreground">Choose the fictional organization, prepare its cohort, then publish one shared checkpoint.</p></div>
    <p className="text-sm text-muted-foreground">Ready workspaces: {readyWorkspaces} of {settings.capacity}. Clean copies prepare in the background after publication and refill as visitors leave.</p>
    <div className="flex items-center justify-between gap-4"><Label htmlFor="demo-enabled">Accept new demo sessions</Label><Switch id="demo-enabled" checked={draft.enabled} onCheckedChange={(enabled) => setDraft({ ...draft, enabled })} /></div>
    <div className="space-y-2"><Label htmlFor="demo-org">Fictional scenario organization</Label><Input id="demo-org" required placeholder="Organization slug" value={draft.entry_org_slug || ''} onChange={(event) => setDraft({ ...draft, entry_org_slug: event.target.value })} /><p className="text-xs text-muted-foreground">Designated demo accounts must belong to this organization. Changing it clears the draft cohort and requires a new checkpoint.</p></div>
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{LIMITS.map(([key, label, min, max]) => <div className="space-y-2" key={key}><Label htmlFor={`demo-${key}`}>{label}</Label><Input id={`demo-${key}`} type="number" required min={min} max={max} step={1} value={draft[key]} onChange={(event) => setDraft({ ...draft, [key]: Number(event.target.value) })} /></div>)}</div>
    <p className="text-xs leading-5 text-muted-foreground">Visitors see a five-minute warning and can extend. AI allowances cover chat, AI generation and background memory processing. Starting over does not replenish the daily allowance.</p>
    </div>
    <div className="shrink-0 space-y-3 border-t p-4">
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <Button type="submit" disabled={busy} className="w-full">{busy ? 'Saving…' : 'Save settings'}</Button>
    </div>
  </form>
}
