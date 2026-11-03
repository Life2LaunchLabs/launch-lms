'use client'

import { useState } from 'react'
import { AtSign, BookUser, Map as MapIcon } from 'lucide-react'
import toast from 'react-hot-toast'

import { Button } from '@components/ui/button'
import { Input } from '@components/ui/input'
import { Switch } from '@components/ui/switch'
import { peopleAccess } from '@services/portfolio/records'
import type { Contact } from '../portfolioTypes'
import type { Setter } from './inplace'

// What someone in My people may see. Anyone can be in My people, but only someone with an account can be let in:
// first say which account is theirs, then two switches with no time limit. Plans include the budget.

function HandleField({ label, action, busy, onSubmit }: { label: string; action: string; busy: boolean; onSubmit: Setter<string> }) {
  const [handle, setHandle] = useState('')
  return <form onSubmit={(event) => { event.preventDefault(); if (handle.trim()) onSubmit(handle.trim()) }} className="grid gap-1.5">
    <label htmlFor="pp-handle" className="text-sm font-extrabold">{label}</label>
    <div className="flex gap-2">
      <div className="relative min-w-0 flex-1"><AtSign className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input id="pp-handle" value={handle} maxLength={320} onChange={(event) => setHandle(event.target.value)} placeholder="username or email" className="pl-9" autoComplete="off" /></div>
      <Button type="submit" variant="outline" disabled={busy || !handle.trim()}>{busy ? '…' : action}</Button>
    </div>
  </form>
}

/** For a new person: add someone who already has an account, instead of typing them in. */
export function AddByAccount({ token, onAdded }: { token?: string; onAdded: Setter<Contact> }) {
  const [busy, setBusy] = useState(false)
  async function add(handle: string) {
    if (!token) return
    setBusy(true)
    try { onAdded(await peopleAccess.add(handle, token)) } catch (error: any) { toast.error(error?.message || 'Could not find them') } finally { setBusy(false) }
  }
  return <div className="rounded-2xl bg-muted p-4"><HandleField label="Do they have an account here?" action="Add" busy={busy} onSubmit={add} /><small className="mt-1.5 block text-xs text-muted-foreground">Then you can let them see your portfolio or plans. Otherwise, fill in their details below.</small></div>
}

function AccessSwitch({ icon: Icon, title, hint, checked, disabled, onChange }: { icon: typeof MapIcon; title: string; hint: string; checked: boolean; disabled: boolean; onChange: Setter<boolean> }) {
  return <label className="flex items-center justify-between gap-3 rounded-2xl border-2 border-border px-4 py-3">
    <Icon className="h-5 w-5 shrink-0 text-muted-foreground" />
    <span className="min-w-0 flex-1"><b className="block text-sm font-extrabold">{title}</b><small className="block text-xs text-muted-foreground">{hint}</small></span>
    <Switch checked={checked} disabled={disabled} onCheckedChange={onChange} aria-label={title} />
  </label>
}

/** For someone already in My people: link their account, then the two switches. Changes save straight away. */
export function PersonAccess({ contact, token, onChange }: { contact: Contact; token?: string; onChange: Setter<Contact> }) {
  const [busy, setBusy] = useState(false)
  const account = contact.account

  async function run(work: () => Promise<Contact>, failure: string) {
    setBusy(true)
    try { onChange(await work()) } catch (error: any) { toast.error(error?.message || failure) } finally { setBusy(false) }
  }

  if (!token) return null
  if (!account) return <div className="rounded-2xl bg-muted p-4"><HandleField label="Do they have an account here?" action="Link" busy={busy} onSubmit={(handle) => run(() => peopleAccess.link(contact.contact_uuid, handle, token), 'Could not find them')} /><small className="mt-1.5 block text-xs text-muted-foreground">Link it to let them see your portfolio or plans.</small></div>

  const first = contact.name.split(' ')[0] || contact.name
  const set = (next: { portfolio: boolean; plans: boolean }) => run(() => peopleAccess.set(contact.contact_uuid, next, token), 'Could not change that')
  return <section aria-label={`What ${first} can see`} className="grid gap-2">
    <h3 className="text-sm font-extrabold">What {first} can see <span className="font-semibold text-muted-foreground">· @{account.username}</span></h3>
    <AccessSwitch icon={BookUser} title="My portfolio" hint="See it even while it’s private, and comment on it." checked={account.portfolio} disabled={busy} onChange={(value) => set({ portfolio: value, plans: account.plans })} />
    <AccessSwitch icon={MapIcon} title="My plans" hint="See your life plan, budget included." checked={account.plans} disabled={busy} onChange={(value) => set({ portfolio: account.portfolio, plans: value })} />
    <small className="text-xs text-muted-foreground">This lasts until you switch it off.</small>
  </section>
}
