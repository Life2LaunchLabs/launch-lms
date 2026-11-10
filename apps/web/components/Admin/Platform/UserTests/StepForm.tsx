'use client'
import { useState } from 'react'
import { Button } from '@components/ui/button'
import { Label } from '@components/ui/label'
import { Textarea } from '@components/ui/textarea'
import { logMyStep, type MyRun, type NewStep } from '@services/userTests/userTests'

/** One interaction for the story map, logged as it happens, including what went fine. */
export default function StepForm({ run }: { run: MyRun }) {
  const [step, setStep] = useState<NewStep>({ did: '', outcome: 'worked', wanted: '' })
  const [state, setState] = useState<'idle' | 'busy' | 'sent'>('idle')
  const [error, setError] = useState('')
  async function send(event: React.FormEvent) {
    event.preventDefault(); setState('busy'); setError('')
    try {
      await logMyStep({ ...step, page: window.location.pathname + window.location.search })
      setStep({ ...step, did: '', wanted: '', outcome: 'worked' }); setState('sent')
    } catch (failure) { setError((failure as Error).message); setState('idle') }
  }
  const field = 'w-full rounded-md border bg-background px-2 py-1.5 text-sm'
  return <form onSubmit={send} className="space-y-3">
    <Label className="block space-y-1 text-xs">What you did or tried<Textarea required rows={2} value={step.did} onChange={(e) => { setStep({ ...step, did: e.target.value }); setState('idle') }} /></Label>
    <div className="grid grid-cols-2 gap-2">
      <Label className="space-y-1 text-xs">How it went<select className={field} value={step.outcome} onChange={(e) => setStep({ ...step, outcome: e.target.value as NewStep['outcome'] })}><option value="worked">It worked</option><option value="struggled">Took some figuring out</option><option value="couldnt">I couldn&apos;t</option></select></Label>
      {run.stages.length ? <Label className="space-y-1 text-xs">During<select className={field} value={step.stage_key ?? ''} onChange={(e) => setStep({ ...step, stage_key: e.target.value || null })}><option value="">No particular stage</option>{run.stages.map((stage) => <option key={stage.key} value={stage.key}>{stage.title}</option>)}</select></Label> : null}
    </div>
    <Label className="block space-y-1 text-xs">What you wanted to do or see (even if it isn&apos;t possible)<Textarea rows={2} value={step.wanted} onChange={(e) => setStep({ ...step, wanted: e.target.value })} /></Label>
    <p className="text-xs text-muted-foreground">Log the steps that went fine too. This page&apos;s address is saved with it.</p>
    {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    <Button type="submit" size="sm" disabled={state === 'busy' || !step.did.trim()}>{state === 'sent' ? 'Logged. Next step?' : state === 'busy' ? 'Logging…' : 'Log step'}</Button>
  </form>
}
