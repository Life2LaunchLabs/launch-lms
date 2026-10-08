'use client'
import { useState } from 'react'
import { ArrowLeft, Bug, CheckCircle, Heart, Lifebuoy, Lightbulb, PaperPlaneTilt, PlusCircle } from '@phosphor-icons/react'
import { Button } from '@components/ui/button'
import { Textarea } from '@components/ui/textarea'
import { demoRequest } from '@services/demo/demo'

const INTENTS = [
  { value: 'stuck', label: "I'm stuck", placeholder: 'What were you trying to do, and where did you get stuck?', icon: Lifebuoy },
  { value: 'broken', label: 'Something is broken', placeholder: 'What happened, and what did you expect instead?', icon: Bug },
  { value: 'confusing', label: 'Something is confusing', placeholder: 'What felt unclear?', icon: Lightbulb },
  { value: 'missing', label: 'Something is missing', placeholder: 'What did you expect to find or do?', icon: PlusCircle },
  { value: 'love', label: 'I love this', placeholder: 'What worked well for you?', icon: Heart },
] as const

export function demoFeedbackContext() {
  return {
    routes: [window.location.pathname],
    viewport: { width: window.innerWidth, height: window.innerHeight },
    screen: { width: window.screen.width, height: window.screen.height },
    pixel_ratio: window.devicePixelRatio,
    user_agent: navigator.userAgent,
    platform: navigator.platform,
    color_scheme: window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
    touch: navigator.maxTouchPoints > 0,
  }
}

export async function sendDemoFeedback(body: { message: string; intent?: string | null; journey?: string | null; rating?: string | null }) {
  return demoRequest<{ key: string }>('feedback', 'POST', { ...body, context: demoFeedbackContext() })
}

/** Feedback from a demo visitor, posted to the same board as tester feedback. */
export default function DemoFeedback({ personName, journey, tag, configured }: { personName: string; journey?: string | null; tag?: string | null; configured: boolean }) {
  const [intent, setIntent] = useState<(typeof INTENTS)[number] | null>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  if (!configured) return <p className="text-sm text-muted-foreground">Feedback isn&apos;t connected on this build.</p>
  if (sent) return <div role="status" className="flex flex-col items-center py-6 text-center"><CheckCircle size={32} weight="fill" className="text-emerald-500" /><p className="mt-2 font-semibold">Thanks, the team has it.</p><Button className="mt-4" variant="outline" size="sm" onClick={() => { setSent(false); setIntent(null); setMessage('') }}>Send more</Button></div>
  async function send() {
    setBusy(true); setError('')
    try { await sendDemoFeedback({ message, intent: intent?.value, journey }); setSent(true) }
    catch (failure) { setError((failure as Error).message) }
    finally { setBusy(false) }
  }
  return <div className="space-y-3">
    {!intent ? <>
      <p className="text-sm font-semibold">What&apos;s on your mind?</p>
      <div className="grid grid-cols-2 gap-2">{INTENTS.map((option) => { const Icon = option.icon; return <button key={option.value} type="button" onClick={() => setIntent(option)} className="flex min-w-0 items-center gap-2 rounded-lg border bg-background px-3 py-2.5 text-left text-xs font-medium hover:bg-muted"><Icon size={16} className="shrink-0" />{option.label}</button> })}</div>
    </> : <>
      <div className="flex items-center justify-between gap-2"><button type="button" onClick={() => setIntent(null)} className="flex items-center gap-1 rounded-md p-1 text-sm font-semibold hover:bg-muted"><ArrowLeft size={16} />{intent.label}</button><Button size="sm" disabled={!message.trim() || busy} onClick={() => void send()}><PaperPlaneTilt weight="fill" />{busy ? 'Sending…' : 'Send'}</Button></div>
      <Textarea autoFocus aria-label="Feedback message" value={message} onChange={(event) => setMessage(event.target.value)} placeholder={intent.placeholder} className="min-h-28" />
    </>}
    <div><p className="mb-1.5 text-xs text-muted-foreground">Attached automatically</p><div className="flex flex-wrap gap-1.5 text-[11px] font-semibold">
      <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">{personName}</span>
      {journey ? <span className="rounded-full border px-2 py-0.5 text-muted-foreground">Trying: {journey}</span> : null}
      <span className="rounded-full border px-2 py-0.5 text-muted-foreground">This page and your device type</span>
      {tag ? <span className="rounded-full border px-2 py-0.5 text-muted-foreground">Tag: {tag}</span> : null}
    </div></div>
    {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
  </div>
}
