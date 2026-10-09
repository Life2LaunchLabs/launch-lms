'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { Copy, Download, Pencil, Trash2 } from 'lucide-react'
import { Button } from '@components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@components/ui/dialog'
import { Input } from '@components/ui/input'
import { Label } from '@components/ui/label'
import { Switch } from '@components/ui/switch'
import { Textarea } from '@components/ui/textarea'
import { getUriWithOrg } from '@services/config/config'
import { announceDemoSetupChange, demoAccountName, demoRequest, type DemoMember, type DemoTokens } from '@services/demo/demo'
import StudioGuideEditor from './StudioGuideEditor'
import StudioShell, { demoLink, MemberAvatar, useDemoStudio, useStudioHref } from './StudioShell'
import { START_PAGES } from './StudioNewUser'

type Tab = 'profile' | 'guide' | 'link'
type SaveRequest = { patch: Record<string, unknown>; message?: string; before?: () => Promise<unknown> }

export default function StudioUserDetail({ userId }: { userId: number }) {
  const { data, mutate } = useDemoStudio()
  const href = useStudioHref()
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('profile')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [removing, setRemoving] = useState(false)
  const member = data?.members?.find((item) => item.user_id === userId)

  async function save({ patch, message = 'Saved.', before }: SaveRequest) {
    setBusy(true); setError(''); setNotice('')
    try { if (before) await before(); await demoRequest(`users/${userId}`, 'PATCH', patch); announceDemoSetupChange(); await mutate(); setNotice(message) }
    catch (failure) { setError((failure as Error).message) }
    finally { setBusy(false) }
  }
  async function setUp() {
    setBusy(true); setError('')
    try {
      const result = await demoRequest<{ tokens: DemoTokens }>('admin/enter', 'POST', { user_id: userId })
      const org = result.tokens.start_org_slug || data?.main_org_slug || ''
      window.location.assign(getUriWithOrg(org, result.tokens.start_path || '/hub'))
    } catch (failure) { setError((failure as Error).message); setBusy(false) }
  }
  async function remove() {
    setBusy(true); setError('')
    try { await demoRequest(`users/${userId}`, 'DELETE'); announceDemoSetupChange(); router.push(href()) }
    catch (failure) { setError((failure as Error).message); setBusy(false) }
  }

  return <StudioShell active="users">
    {data && !member ? <p className="text-sm text-muted-foreground">This person is no longer a demo user. <Link href={href()} className="underline">Back to demo users</Link></p> : null}
    {member ? <div className="space-y-5">
      <Link href={href()} className="text-sm text-muted-foreground hover:text-foreground">← Demo users</Link>
      <div className="flex flex-wrap items-center gap-4">
        <MemberAvatar member={member} size={56} />
        <div className="min-w-0 flex-1"><h2 className="truncate text-2xl font-semibold tracking-tight">{demoAccountName(member)}</h2><p className="truncate text-sm text-muted-foreground">{member.role_line || member.user_email}</p></div>
        {member.pilotable && member.handle && data?.checkpoint_id ? <Button asChild variant="outline"><a href={demoLink(member.handle)} target="_blank" rel="noreferrer">Try as a visitor</a></Button> : null}
        <Button disabled={busy} onClick={() => void setUp()}><Pencil className="mr-1.5 h-4 w-4" />Set up {member.first_name || 'account'}</Button>
      </div>
      <p className="text-sm text-muted-foreground">Set up signs you in as this account on the live site. Edit their portfolio, badges and plans with the normal product, then publish.</p>
      <div role="tablist" className="flex gap-1 border-b">{([['profile', 'Profile'], ['guide', 'Guide'], ['link', 'Link & QR']] as const).map(([id, label]) => <button key={id} role="tab" type="button" aria-selected={tab === id} onClick={() => { setTab(id); setNotice(''); setError('') }} className={`-mb-px border-b-2 px-3 py-2 text-sm font-semibold ${tab === id ? 'border-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>{label}</button>)}</div>
      {tab === 'profile' ? <ProfileTab key={`p-${member.user_id}`} member={member} busy={busy} onSave={(request) => void save(request)} /> : null}
      {tab === 'guide' ? <StudioGuideEditor key={`g-${member.user_id}`} member={member} busy={busy} onSave={({ pages, shared }) => void save({ patch: { guide: { pages } }, before: shared ? () => demoRequest('guide/shared', 'PUT', { pages: shared }) : undefined, message: shared ? 'Guide saved, including shared pages. Visitors see it right away.' : 'Guide saved. Visitors see it right away.' })} /> : null}
      {tab === 'link' ? <LinkTab key={`l-${member.user_id}`} member={member} busy={busy} published={Boolean(data?.checkpoint_id)} onSave={(request) => void save(request)} /> : null}
      {notice ? <p role="status" className="text-sm text-emerald-700">{notice}</p> : null}
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      <div className="border-t pt-5"><Button variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setRemoving(true)}><Trash2 className="mr-1.5 h-4 w-4" />Remove from demo</Button></div>
      <Dialog open={removing} onOpenChange={setRemoving}><DialogContent className="max-w-[calc(100dvw-2rem)] sm:max-w-lg"><DialogHeader><DialogTitle>Remove {member.first_name} from the demo?</DialogTitle><DialogDescription>The account itself stays. Visitors can still use the published version until you publish again.</DialogDescription></DialogHeader><DialogFooter className="mt-5 gap-2"><Button variant="outline" onClick={() => setRemoving(false)}>Cancel</Button><Button variant="destructive" disabled={busy} onClick={() => void remove()}>Remove</Button></DialogFooter></DialogContent></Dialog>
    </div> : null}
  </StudioShell>
}

function ProfileTab({ member, busy, onSave }: { member: DemoMember; busy: boolean; onSave: React.Dispatch<SaveRequest> }) {
  const [draft, setDraft] = useState({ first_name: member.first_name, last_name: member.last_name, role_line: member.role_line || '', description: member.description, start_path: member.start_path || '/hub', start_org_slug: member.start_org_slug, pilotable: member.pilotable })
  const set = (patch: Partial<typeof draft>) => setDraft((current) => ({ ...current, ...patch }))
  return <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
    <form onSubmit={(event) => { event.preventDefault(); onSave({ patch: { ...draft, start_org_slug: draft.start_path === '/admin' ? draft.start_org_slug : '' } }) }} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2"><div className="space-y-1.5"><Label htmlFor="pf-first">First name</Label><Input id="pf-first" required value={draft.first_name} onChange={(event) => set({ first_name: event.target.value })} /></div><div className="space-y-1.5"><Label htmlFor="pf-last">Last name</Label><Input id="pf-last" value={draft.last_name} onChange={(event) => set({ last_name: event.target.value })} /></div></div>
      <div className="space-y-1.5"><Label htmlFor="pf-role">Role line</Label><Input id="pf-role" value={draft.role_line} onChange={(event) => set({ role_line: event.target.value })} /></div>
      <div className="space-y-1.5"><Label htmlFor="pf-description">Who they are</Label><Textarea id="pf-description" maxLength={1000} value={draft.description} onChange={(event) => set({ description: event.target.value })} /></div>
      <div className="grid gap-3 sm:grid-cols-2"><div className="space-y-1.5"><Label htmlFor="pf-start">Starts on</Label><select id="pf-start" value={draft.start_path} onChange={(event) => set({ start_path: event.target.value })} className="h-9 w-full rounded-md border bg-background px-3 text-sm">{START_PAGES.map(([path, label]) => <option key={path} value={path}>{label}</option>)}{START_PAGES.some(([path]) => path === draft.start_path) ? null : <option value={draft.start_path}>{draft.start_path}</option>}</select></div>
        {draft.start_path === '/admin' ? <div className="space-y-1.5"><Label htmlFor="pf-start-org">Organization they administer</Label><select id="pf-start-org" required value={draft.start_org_slug} onChange={(event) => set({ start_org_slug: event.target.value })} className="h-9 w-full rounded-md border bg-background px-3 text-sm"><option value="">Choose…</option>{member.orgs.map((org) => <option key={org.slug} value={org.slug}>{org.name}</option>)}</select></div> : null}</div>
      <div className="space-y-1"><p className="text-sm font-semibold">Belongs to</p><p className="text-sm text-muted-foreground">{member.orgs.map((org) => org.name).join(', ') || 'No organizations'}. Change memberships in setup mode or in the organization&apos;s admin.</p></div>
      <label className="flex items-center gap-2 text-sm"><Switch checked={draft.pilotable} onCheckedChange={(pilotable) => set({ pilotable })} />Show on the picker</label>
      <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save profile'}</Button>
      <p className="text-xs text-muted-foreground">Card text, start page and picker visibility apply right away. Name changes reach visitors after you publish.</p>
    </form>
    <div className="space-y-2"><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Picker card</p><article className="flex flex-col gap-3 rounded-2xl border bg-card p-5"><MemberAvatar member={member} size={56} /><div><p className="text-lg font-semibold">{`${draft.first_name} ${draft.last_name}`.trim()}</p>{draft.role_line ? <p className="text-sm font-medium text-indigo-600">{draft.role_line}</p> : null}</div><p className="whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{draft.description || 'Add a sentence or two about who they are.'}</p><span className="rounded-md bg-indigo-600 px-3 py-2 text-center text-sm font-semibold text-white">Explore as {draft.first_name || '…'}</span></article></div>
  </div>
}

function LinkTab({ member, busy, published, onSave }: { member: DemoMember; busy: boolean; published: boolean; onSave: React.Dispatch<SaveRequest> }) {
  const [handle, setHandle] = useState(member.handle || '')
  const [tag, setTag] = useState('')
  const [qr, setQr] = useState('')
  const [copied, setCopied] = useState(false)
  const cleanTag = tag.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40)
  const url = demoLink(member.handle, cleanTag || undefined)
  useEffect(() => { void QRCode.toDataURL(url, { width: 1024, margin: 2, errorCorrectionLevel: 'M' }).then(setQr).catch(() => setQr('')) }, [url])
  async function copy() {
    try { await navigator.clipboard.writeText(url); setCopied(true); window.setTimeout(() => setCopied(false), 1500) } catch { setCopied(false) }
  }
  return <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_17rem]">
    <div className="space-y-4">
      {!member.pilotable || !published ? <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{!published ? 'Publish the demo before sharing this link.' : `${member.first_name} isn't on the picker, so this link won't start a demo yet.`}</p> : null}
      <div className="space-y-1.5"><Label htmlFor="ln-url">Direct link</Label><div className="flex gap-2"><Input id="ln-url" readOnly value={url} onFocus={(event) => event.currentTarget.select()} className="font-mono text-xs" /><Button type="button" variant="outline" onClick={() => void copy()}><Copy className="mr-1.5 h-4 w-4" />{copied ? 'Copied' : 'Copy'}</Button></div></div>
      <form onSubmit={(event) => { event.preventDefault(); onSave({ patch: { handle }, message: 'Link name saved.' }) }} className="space-y-1.5"><Label htmlFor="ln-handle">Link name</Label><div className="flex gap-2"><Input id="ln-handle" value={handle} maxLength={40} onChange={(event) => setHandle(event.target.value.toLowerCase())} /><Button type="submit" variant="outline" disabled={busy || handle === member.handle}>Save</Button></div><p className="text-xs text-muted-foreground">Lowercase letters, numbers and dashes. Changing it breaks links and QR codes already shared.</p></form>
      <div className="space-y-1.5"><Label htmlFor="ln-tag">Tag (optional)</Label><Input id="ln-tag" value={tag} maxLength={40} placeholder="oct-career-fair" onChange={(event) => setTag(event.target.value)} /><p className="text-xs text-muted-foreground">Added to the link. Feedback from people who use it is labeled with the tag on the board, so one event or test session stays together.</p></div>
    </div>
    <div className="flex flex-col items-center gap-3 rounded-xl border bg-card p-4">
      {qr ? <img src={qr} alt={`QR code for ${url}`} className="h-56 w-56 rounded-md bg-white" /> : <div className="h-56 w-56 rounded-md bg-muted" />}
      <p className="break-all text-center text-xs text-muted-foreground">{url.replace(/^https?:\/\//, '')}</p>
      <Button asChild variant="outline" size="sm" disabled={!qr}><a href={qr} download={`demo-${member.handle || member.user_id}${cleanTag ? `-${cleanTag}` : ''}.png`}><Download className="mr-1.5 h-4 w-4" />Download QR code</a></Button>
    </div>
  </div>
}
