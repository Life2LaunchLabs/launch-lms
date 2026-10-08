'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import { Button } from '@components/ui/button'
import { Input } from '@components/ui/input'
import { Label } from '@components/ui/label'
import { Switch } from '@components/ui/switch'
import { Textarea } from '@components/ui/textarea'
import { announceDemoSetupChange, demoAccountName, demoRequest, type DemoMember } from '@services/demo/demo'
import StudioShell, { useDemoStudio, useStudioHref } from './StudioShell'

type StartFrom = 'blank' | 'copy' | 'duplicate'
type OrgRow = { slug: string; role: 'student' | 'staff' | 'admin' }
const START: { id: StartFrom; title: string; detail: string }[] = [
  { id: 'blank', title: 'A blank account', detail: 'Set them up yourself in setup mode.' },
  { id: 'copy', title: 'A copy of a real account', detail: 'Someone agreed to share their account as a starting point.' },
  { id: 'duplicate', title: 'Another demo user', detail: 'Same account and guide, new person.' },
]
export const START_PAGES = [['/hub', 'Hub'], ['/portfolio', 'Portfolio'], ['/badges', 'Badges'], ['/plans', 'Plans'], ['/admin', 'Organization admin']] as const

export default function StudioNewUser() {
  const { data } = useDemoStudio()
  const href = useStudioHref()
  const router = useRouter()
  const [from, setFrom] = useState<StartFrom>('blank')
  const [form, setForm] = useState({ first_name: '', last_name: '', role_line: '', description: '', start_path: '/hub', start_org_slug: '', pilotable: true, source_email: '', password: '', source_user_id: '', include_conversations: false })
  const [orgs, setOrgs] = useState<OrgRow[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = (patch: Partial<typeof form>) => setForm((current) => ({ ...current, ...patch }))

  async function create(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError('')
    try {
      const created = await demoRequest<DemoMember>('users', 'POST', {
        start_from: from,
        first_name: form.first_name.trim(), last_name: form.last_name.trim(), role_line: form.role_line, description: form.description,
        start_path: form.start_path, start_org_slug: form.start_path === '/admin' ? form.start_org_slug : '',
        pilotable: form.pilotable, orgs: orgs.filter((org) => org.slug.trim()).map((org) => ({ ...org, slug: org.slug.trim() })),
        include_conversations: form.include_conversations,
        ...(from === 'copy' ? { source_email: form.source_email.trim(), password: form.password } : {}),
        ...(from === 'duplicate' ? { source_user_id: Number(form.source_user_id) } : {}),
      })
      announceDemoSetupChange()
      router.push(href(`/${created.user_id}`))
    } catch (failure) { setError((failure as Error).message); setBusy(false) }
  }

  return <StudioShell active="users">
    <form onSubmit={create} className="max-w-3xl space-y-6">
      <div><Link href={href()} className="text-sm text-muted-foreground hover:text-foreground">← Demo users</Link><h2 className="mt-2 text-2xl font-semibold tracking-tight">New demo user</h2><p className="mt-1 text-sm text-muted-foreground">Creates a normal account with a reserved demo email. It can never sign in with a password; you set it up in setup mode.</p></div>
      <fieldset className="space-y-2"><legend className="mb-2 text-sm font-semibold">Start from</legend><div className="grid gap-2 sm:grid-cols-3">{START.map((option) => <label key={option.id} className={`flex cursor-pointer flex-col gap-1 rounded-xl border bg-card p-3.5 ${from === option.id ? 'border-indigo-600 ring-1 ring-indigo-600' : ''}`}><span className="flex items-center gap-2"><input type="radio" name="start-from" value={option.id} checked={from === option.id} onChange={() => setFrom(option.id)} className="accent-indigo-600" /><span className="text-sm font-semibold">{option.title}</span></span><span className="pl-5 text-xs text-muted-foreground">{option.detail}</span></label>)}</div></fieldset>
      {from === 'copy' ? <div className="space-y-3 rounded-xl border bg-muted/40 p-4">
        <p className="text-sm leading-6">Copies the whole account: profile and photo, portfolio, badge progress and badges, plans, saved resources and media. Inbox messages are never copied. The password only proves the owner agreed; it isn&apos;t stored.</p>
        <div className="grid gap-3 sm:grid-cols-2"><div className="space-y-1.5"><Label htmlFor="copy-email">Account to copy (email)</Label><Input id="copy-email" type="email" autoComplete="off" required value={form.source_email} onChange={(event) => set({ source_email: event.target.value })} /></div><div className="space-y-1.5"><Label htmlFor="copy-password">Their password</Label><Input id="copy-password" type="password" autoComplete="new-password" required value={form.password} onChange={(event) => set({ password: event.target.value })} /></div></div>
        <label className="flex items-center gap-2 text-sm"><Switch checked={form.include_conversations} onCheckedChange={(include_conversations) => set({ include_conversations })} />Include AI coach conversations</label>
      </div> : null}
      {from === 'duplicate' ? <div className="space-y-1.5"><Label htmlFor="dup-source">Demo user to duplicate</Label><select id="dup-source" required value={form.source_user_id} onChange={(event) => set({ source_user_id: event.target.value })} className="h-9 w-full rounded-md border bg-background px-3 text-sm"><option value="">Choose…</option>{(data?.members || []).map((member) => <option key={member.user_id} value={member.user_id}>{demoAccountName(member)}</option>)}</select></div> : null}
      <div className="grid gap-3 sm:grid-cols-2"><div className="space-y-1.5"><Label htmlFor="nu-first">First name</Label><Input id="nu-first" required value={form.first_name} onChange={(event) => set({ first_name: event.target.value })} /></div><div className="space-y-1.5"><Label htmlFor="nu-last">Last name</Label><Input id="nu-last" value={form.last_name} onChange={(event) => set({ last_name: event.target.value })} /></div></div>
      <div className="space-y-1.5"><Label htmlFor="nu-role">Role line</Label><Input id="nu-role" placeholder="Junior · Oregon High School" value={form.role_line} onChange={(event) => set({ role_line: event.target.value })} /></div>
      <div className="space-y-1.5"><Label htmlFor="nu-description">Who they are</Label><Textarea id="nu-description" maxLength={1000} placeholder="16, curious about healthcare. Halfway through her first badge pathway." value={form.description} onChange={(event) => set({ description: event.target.value })} /><p className="text-xs text-muted-foreground">One or two sentences for the picker card. Add a photo in setup mode, from their profile.</p></div>
      <fieldset className="space-y-2"><legend className="mb-1 text-sm font-semibold">Where they belong</legend>
        <p className="text-sm text-muted-foreground">Every demo user is a member of the main organization, like real learners. Add a school or issuer only if their story needs one.</p>
        {orgs.map((org, index) => <div key={index} className="flex gap-2"><Input aria-label="Organization slug" placeholder="organization-slug" value={org.slug} onChange={(event) => setOrgs((rows) => rows.map((row, position) => position === index ? { ...row, slug: event.target.value } : row))} /><select aria-label="Role" value={org.role} onChange={(event) => setOrgs((rows) => rows.map((row, position) => position === index ? { ...row, role: event.target.value as OrgRow['role'] } : row))} className="h-9 rounded-md border bg-background px-2 text-sm"><option value="student">Student</option><option value="staff">Staff</option><option value="admin">Admin</option></select><Button type="button" variant="ghost" size="icon" aria-label="Remove organization" onClick={() => setOrgs((rows) => rows.filter((_, position) => position !== index))}><X className="h-4 w-4" /></Button></div>)}
        <Button type="button" variant="ghost" size="sm" onClick={() => setOrgs((rows) => [...rows, { slug: '', role: 'student' }])}><Plus className="mr-1 h-4 w-4" />Add an organization</Button>
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-2"><div className="space-y-1.5"><Label htmlFor="nu-start">Starts on</Label><select id="nu-start" value={form.start_path} onChange={(event) => set({ start_path: event.target.value })} className="h-9 w-full rounded-md border bg-background px-3 text-sm">{START_PAGES.map(([path, label]) => <option key={path} value={path}>{label}</option>)}</select></div>
        {form.start_path === '/admin' ? <div className="space-y-1.5"><Label htmlFor="nu-start-org">Organization they administer</Label><Input id="nu-start-org" required placeholder="organization-slug" value={form.start_org_slug} onChange={(event) => set({ start_org_slug: event.target.value })} /></div> : null}</div>
      <label className="flex items-center gap-2 text-sm"><Switch checked={form.pilotable} onCheckedChange={(pilotable) => set({ pilotable })} />Show on the picker (otherwise supporting cast)</label>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      <div className="flex gap-2"><Button type="submit" disabled={busy}>{busy ? (from === 'blank' ? 'Creating…' : 'Copying…') : 'Create demo user'}</Button><Button asChild variant="ghost"><Link href={href()}>Cancel</Link></Button></div>
    </form>
  </StudioShell>
}
