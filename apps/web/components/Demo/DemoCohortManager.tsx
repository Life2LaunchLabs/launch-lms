'use client'
import { useState } from 'react'
import { Button } from '@components/ui/button'
import { Input } from '@components/ui/input'
import { Label } from '@components/ui/label'
import { Switch } from '@components/ui/switch'
import { Textarea } from '@components/ui/textarea'
import { demoRequest, demoAccountName, announceDemoSetupChange, type DemoMember } from '@services/demo/demo'

export default function DemoCohortManager({ members, revision, onSaved }: { members: DemoMember[]; revision: number; onSaved: () => void }) {
  const [draft, setDraft] = useState(members)
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function save(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError('')
    try {
      await demoRequest('cohort', 'PUT', { revision, members: draft.map(member => ({ user_email: member.user_email, pilotable: member.pilotable, description: member.description })) })
      announceDemoSetupChange(); onSaved()
    } catch (failure) { setError((failure as Error).message) }
    finally { setBusy(false) }
  }
  function update(index: number, patch: Partial<DemoMember>) { setDraft(current => current.map((member, position) => position === index ? { ...member, ...patch } : member)) }
  function add() {
    const value = email.trim()
    if (!value || draft.some(member => member.user_email.toLowerCase() === value.toLowerCase())) { setError('Enter a different existing demo account email.'); return }
    setDraft(current => [...current, { user_id: 0, user_email: value, first_name: '', last_name: '', username: value, pilotable: false, description: '' }]); setEmail(''); setError('')
  }
  return <form onSubmit={save} className="space-y-5 rounded-2xl border bg-card p-5 sm:p-6">
    <div><h2 className="text-lg font-semibold">Fictional demo cohort</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">Add existing fake accounts from the scenario organization. All designated accounts are captured together; only pilotable accounts appear to visitors. Create accounts and prepare programs through the normal product.</p></div>
    <div className="space-y-2"><Label htmlFor="demo-new-member">Existing demo account email</Label><div className="flex flex-col gap-2 sm:flex-row"><Input id="demo-new-member" type="email" value={email} onChange={event => setEmail(event.target.value)} /><Button type="button" variant="outline" disabled={busy || !email.trim()} onClick={add}>Add account</Button></div></div>
    <div className="space-y-4">{draft.map((member, index) => <section key={`${member.user_email}-${index}`} className="space-y-3 rounded-xl border p-4">
      <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="break-words font-medium">{demoAccountName(member)}</h3>{member.first_name && <p className="break-all text-xs text-muted-foreground">{member.user_email}</p>}</div><Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => setDraft(current => current.filter((_, position) => position !== index))}>Remove</Button></div>
      <div className="flex items-center justify-between gap-3"><Label htmlFor={`demo-pilot-${index}`}>Visitors can pilot this account</Label><Switch id={`demo-pilot-${index}`} checked={member.pilotable} onCheckedChange={pilotable => update(index, { pilotable })} /></div>
      <div className="space-y-2"><Label htmlFor={`demo-description-${index}`}>Description for visitors</Label><Textarea id={`demo-description-${index}`} maxLength={1000} value={member.description} onChange={event => update(index, { description: event.target.value })} /></div>
    </section>)}</div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <Button disabled={busy} type="submit">{busy ? 'Saving…' : 'Save cohort'}</Button>
  </form>
}
