'use client'

import React from 'react'
import useSWR from 'swr'
import toast from 'react-hot-toast'
import { Loader2, Trash2, Users } from 'lucide-react'
import { Button } from '@components/ui/button'
import EditSheet from '@components/Goals/edit/EditSheet'
import { PersonAvatar } from '@components/Goals/share/PersonAvatar'
import { portfolioPeopleApi, portfolioPeopleKey, type PortfolioPeople, type PortfolioRole } from '@services/portfolio/people'

const SHEET_COLOR = '#7cc4ff'

/** The owner's People button: who can see the portfolio while it's private, and who can comment on it. */
export function PortfolioPeopleButton({ token }: { token?: string }) {
  const [open, setOpen] = React.useState(false)
  const { data, mutate } = useSWR<PortfolioPeople>(token ? portfolioPeopleKey() : null, () => portfolioPeopleApi.list(token))
  const [handle, setHandle] = React.useState('')
  const [role, setRole] = React.useState<PortfolioRole>('viewer')
  const [busy, setBusy] = React.useState(false)
  const people = data?.people || []
  const choices = data?.choices || []

  const run = async (work: () => Promise<PortfolioPeople>, done?: string) => {
    setBusy(true)
    try {
      await mutate(work(), { revalidate: false })
      if (done) toast.success(done)
      return true
    } catch (error: any) {
      toast.error(error?.message || 'That didn’t save')
      return false
    } finally {
      setBusy(false)
    }
  }
  const add = async (event: React.FormEvent) => {
    event.preventDefault()
    const target = handle.trim()
    if (!target) return
    if (await run(() => portfolioPeopleApi.add(target, role, token), `Added ${target.startsWith('@') ? target : `@${target}`}`)) setHandle('')
  }

  return <>
    <Button variant="surface" size="sm" onClick={() => setOpen(true)}><Users className="h-4 w-4" />People{people.length ? ` · ${people.length}` : ''}</Button>
    <EditSheet open={open} onOpenChange={setOpen} color={SHEET_COLOR} title="People on your portfolio"
      description="They can see your portfolio even while it’s private. Commenters can also comment on it. Items you’ve marked private stay hidden.">
      <form onSubmit={add} className="flex flex-wrap gap-2">
        <input value={handle} onChange={(event) => setHandle(event.target.value)} placeholder="@handle or email" aria-label="Add someone by @handle or email"
          className="h-10 min-w-0 flex-1 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-[var(--org-primary-color)]" />
        <select value={role} onChange={(event) => setRole(event.target.value as PortfolioRole)} aria-label="Role for the person you add" className="h-10 rounded-xl border border-border bg-background px-2 text-sm">
          {choices.map((choice) => <option key={choice.key} value={choice.key}>{choice.name}</option>)}
        </select>
        <Button type="submit" disabled={busy || !handle.trim()}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Add'}</Button>
      </form>
      {people.length ? <ul className="flex flex-col gap-2">{people.map((item) => <li key={item.user.id} className="flex items-center gap-3 rounded-2xl border border-border p-2.5">
        <PersonAvatar user={item.user as any} size="md" />
        <span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold">{item.user.name}</span><span className="block truncate text-xs text-muted-foreground">@{item.user.username}</span></span>
        <select value={item.role} disabled={busy} aria-label={`Role for ${item.user.name}`} onChange={(event) => item.user.user_uuid && run(() => portfolioPeopleApi.update(item.user.user_uuid!, event.target.value as PortfolioRole, token))}
          className="h-9 rounded-lg border border-border bg-background px-2 text-sm">
          {choices.map((choice) => <option key={choice.key} value={choice.key}>{choice.name}</option>)}
        </select>
        <button type="button" disabled={busy} aria-label={`Remove ${item.user.name}`} onClick={() => item.user.user_uuid && run(() => portfolioPeopleApi.remove(item.user.user_uuid!, token))}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground"><Trash2 className="h-4 w-4" /></button>
      </li>)}</ul> : <p className="text-sm text-muted-foreground">No one yet. Add a parent, coach or counselor by their @handle.</p>}
      {choices.length ? <ul className="space-y-1 text-xs text-muted-foreground">{choices.map((choice) => <li key={choice.key}><b className="text-foreground">{choice.name}</b>: {choice.hint}</li>)}</ul> : null}
    </EditSheet>
  </>
}
