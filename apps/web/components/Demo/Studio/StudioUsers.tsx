'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@components/ui/button'
import { Input } from '@components/ui/input'
import { Label } from '@components/ui/label'
import { Switch } from '@components/ui/switch'
import { announceDemoSetupChange, demoAccountName, demoRequest, type DemoMember } from '@services/demo/demo'
import StudioShell, { MemberAvatar, PublishStrip, useDemoStudio, useStudioHref } from './StudioShell'

function orgSummary(member: DemoMember) {
  return member.orgs.map((org) => `${org.name}${org.role_id === 1 ? ' (admin)' : org.role_id === 2 ? ' (staff)' : ''}`).join(', ')
}

export default function StudioUsers() {
  const { data, mutate } = useDemoStudio()
  const href = useStudioHref()
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const members = data?.members || []
  const pickable = members.filter((member) => member.pilotable)
  const cast = members.filter((member) => !member.pilotable)

  async function toggle(member: DemoMember, pilotable: boolean) {
    setError('')
    try { await demoRequest(`users/${member.user_id}`, 'PATCH', { pilotable }); announceDemoSetupChange(); await mutate() }
    catch (failure) { setError((failure as Error).message) }
  }
  async function addExisting(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError('')
    try { await demoRequest('users/existing', 'POST', { user_email: email.trim() }); setEmail(''); announceDemoSetupChange(); await mutate() }
    catch (failure) { setError((failure as Error).message) }
    finally { setBusy(false) }
  }

  const table = (rows: DemoMember[]) => <div className="overflow-x-auto rounded-xl border bg-card"><table className="w-full text-sm">
    <thead><tr className="border-b text-left text-[11px] uppercase tracking-wider text-muted-foreground"><th className="px-4 py-2.5 font-bold">Demo user</th><th className="px-4 py-2.5 font-bold">Belongs to</th><th className="px-4 py-2.5 font-bold">Guide</th><th className="px-4 py-2.5 font-bold">Status</th><th className="px-4 py-2.5 font-bold">On picker</th></tr></thead>
    <tbody>{rows.map((member) => <tr key={member.user_id} className="cursor-pointer border-b last:border-0 hover:bg-muted/50" onClick={() => router.push(href(`/${member.user_id}`))}>
      <td className="px-4 py-3"><Link href={href(`/${member.user_id}`)} onClick={(event) => event.stopPropagation()} className="flex min-w-0 items-center gap-3"><MemberAvatar member={member} /><span className="min-w-0"><span className="block truncate font-semibold">{demoAccountName(member)}</span><span className="block truncate text-xs text-muted-foreground">{member.role_line || member.user_email}</span></span></Link></td>
      <td className="max-w-56 px-4 py-3 text-xs text-muted-foreground">{orgSummary(member)}</td>
      <td className="px-4 py-3 text-xs text-muted-foreground">{member.guide?.pages?.length ? `${member.guide.pages.length} page${member.guide.pages.length === 1 ? '' : 's'}` : 'Not written'}</td>
      <td className="px-4 py-3">{member.changed ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800">Set up since publishing</span> : <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800">Published</span>}</td>
      <td className="px-4 py-3" onClick={(event) => event.stopPropagation()}><Switch aria-label={`Show ${demoAccountName(member)} on the picker`} checked={member.pilotable} onCheckedChange={(value) => void toggle(member, value)} /></td>
    </tr>)}</tbody>
  </table></div>

  return <StudioShell active="users" actions={<Button asChild size="sm"><Link href={href('/new')}><Plus className="mr-1 h-4 w-4" />New demo user</Link></Button>}>
    {data ? <div className="space-y-6">
      <PublishStrip status={data} />
      <section className="space-y-3">
        <div><h2 className="text-lg font-semibold">On the picker</h2><p className="text-sm text-muted-foreground">Visitors choose one of these people. Picker changes apply right away; account changes reach visitors after you publish.</p></div>
        {pickable.length ? table(pickable) : <div className="rounded-xl border border-dashed bg-card p-6 text-sm text-muted-foreground">No one is on the picker yet. <Link href={href('/new')} className="font-semibold text-foreground underline underline-offset-4">Create a demo user</Link> to get started.</div>}
      </section>
      <section className="space-y-3">
        <div><h2 className="text-lg font-semibold">Supporting cast</h2><p className="text-sm text-muted-foreground">People who exist in the demo, like a counselor&apos;s students, but whom visitors can&apos;t pick. Turn on &ldquo;On picker&rdquo; to make someone pickable.</p></div>
        {cast.length ? table(cast) : null}
        <form onSubmit={addExisting} className="flex flex-col gap-2 rounded-xl border bg-card p-4 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-1.5"><Label htmlFor="demo-existing">Add an existing fake account by email</Label><Input id="demo-existing" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="student01@demo.example.com" /></div>
          <Button type="submit" variant="outline" disabled={busy || !email.trim()}>{busy ? 'Adding…' : 'Add to demo'}</Button>
        </form>
      </section>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    </div> : null}
  </StudioShell>
}
