'use client'

import { FormEvent, useState } from 'react'
import { Camera, Plus, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'

import { Button } from '@components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@components/ui/dialog'
import { Input } from '@components/ui/input'
import { Label } from '@components/ui/label'
import { getMyPortfolio, updateMyPortfolio } from '@services/portfolio/portfolio'
import { updateMyHighlights, updateMyIdentity } from '@services/portfolio/records'
import type { OpenChange } from './parts'
import type { Highlight, SetShell, Shell } from '../portfolioTypes'

// The two editors the new front page opens itself: who you are, and the highlights band.

/** Your name (legal, for rosters and reports), the name you go by, a one-line intro and where you are. */
export function ProfileDialog({ open, onOpenChange, shell, setShell, token, avatar, onAvatarClick }: { open: boolean; onOpenChange: OpenChange; shell: Shell; setShell: SetShell; token?: string; avatar: React.ReactNode; onAvatarClick: () => void }) {
  const [busy, setBusy] = useState(false)
  const identity = shell.identity
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!token) return
    const form = new FormData(event.currentTarget)
    const text = (name: string) => String(form.get(name) || '').trim()
    if (!text('first_name')) return toast.error('Add your first name')
    setBusy(true)
    try {
      await updateMyIdentity({ first_name: text('first_name'), last_name: text('last_name'), preferred_name: text('preferred_name') }, token)
      // The identity save bumps the revision, so read it back before saving the rest.
      const current = await getMyPortfolio(token)
      setShell(await updateMyPortfolio({ revision: current.portfolio.revision, headline: text('headline'), location_label: text('location_label') }, token))
      onOpenChange(false)
      toast.success('Profile updated')
    } catch (error: any) { toast.error(error?.message || 'Could not update your profile') } finally { setBusy(false) }
  }
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[90dvh] max-w-lg overflow-y-auto">
      <DialogHeader><DialogTitle>Your profile</DialogTitle><DialogDescription>This is you everywhere in the app. Your teachers’ rosters and reports use your legal name.</DialogDescription></DialogHeader>
      <form id="portfolio-profile" onSubmit={save} className="grid gap-4">
        <button type="button" onClick={onAvatarClick} className="group relative w-fit rounded-full" aria-label="Change your photo">{avatar}<span className="absolute bottom-0 right-0 grid h-8 w-8 place-items-center rounded-full border-2 border-card bg-foreground text-background"><Camera className="h-4 w-4" /></span></button>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5"><Label htmlFor="pf-first">First name</Label><Input id="pf-first" name="first_name" defaultValue={identity?.first_name || ''} maxLength={80} required autoComplete="given-name" /></div>
          <div className="grid gap-1.5"><Label htmlFor="pf-last">Last name</Label><Input id="pf-last" name="last_name" defaultValue={identity?.last_name || ''} maxLength={80} autoComplete="family-name" /></div>
        </div>
        <div className="grid gap-1.5"><Label htmlFor="pf-preferred">Name you go by <span className="font-normal text-muted-foreground">(optional)</span></Label><Input id="pf-preferred" name="preferred_name" defaultValue={identity?.preferred_name || ''} maxLength={80} placeholder={identity?.legal_name || ''} autoComplete="nickname" /><p className="text-xs text-muted-foreground">The whole name you want people to see, like “Mya Rivera”. It’s shown on your portfolio and around the app instead of your legal name.</p></div>
        <div className="grid gap-1.5"><Label htmlFor="pf-headline">One-line intro <span className="font-normal text-muted-foreground">(optional)</span></Label><Input id="pf-headline" name="headline" defaultValue={shell.portfolio.headline || ''} maxLength={140} placeholder="Artist and future UX designer" /></div>
        <div className="grid gap-1.5"><Label htmlFor="pf-location">Where you are <span className="font-normal text-muted-foreground">(optional)</span></Label><Input id="pf-location" name="location_label" defaultValue={shell.portfolio.location_label || ''} maxLength={80} placeholder="Eugene, OR" /></div>
      </form>
      <DialogFooter><Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button><Button type="submit" form="portfolio-profile" variant="brand" disabled={busy}>{busy ? 'Saving…' : 'Save'}</Button></DialogFooter>
    </DialogContent>
  </Dialog>
}

const EXAMPLES: Highlight[] = [{ value: '300+', label: 'hours worked' }, { value: '3.8', label: 'GPA' }, { value: '1st', label: 'place, regional art show' }]

/** Up to four numbers people notice first. */
export function HighlightsDialog({ open, onOpenChange, shell, setShell, token }: { open: boolean; onOpenChange: OpenChange; shell: Shell; setShell: SetShell; token?: string }) {
  const [rows, setRows] = useState<Highlight[]>(() => shell.highlights?.length ? shell.highlights : [{ value: '', label: '' }])
  const [busy, setBusy] = useState(false)
  const change = (index: number, key: keyof Highlight, value: string) => setRows((current) => current.map((row, at) => at === index ? { ...row, [key]: value } : row))
  async function save() {
    if (!token) return
    const filled = rows.map((row) => ({ value: row.value.trim(), label: row.label.trim() })).filter((row) => row.value || row.label)
    if (filled.some((row) => !row.value || !row.label)) return toast.error('Each highlight needs a number and what it means')
    setBusy(true)
    try {
      const saved = await updateMyHighlights(filled, token)
      setShell({ ...shell, highlights: saved.highlights })
      onOpenChange(false)
    } catch (error: any) { toast.error(error?.message || 'Could not save your highlights') } finally { setBusy(false) }
  }
  return <Dialog open={open} onOpenChange={(next) => { if (next) setRows(shell.highlights?.length ? shell.highlights : [{ value: '', label: '' }]); onOpenChange(next) }}>
    <DialogContent className="max-w-lg">
      <DialogHeader><DialogTitle>Highlights</DialogTitle><DialogDescription>The numbers people notice first, like hours worked, a GPA or a win. Up to four.</DialogDescription></DialogHeader>
      <div className="grid gap-2.5">
        {rows.map((row, index) => <div key={index} className="grid grid-cols-[6.5rem_minmax(0,1fr)_auto] items-center gap-2">
          <Input aria-label={`Highlight ${index + 1} number`} value={row.value} maxLength={24} placeholder={EXAMPLES[index % 3].value} onChange={(event) => change(index, 'value', event.target.value)} className="font-extrabold" />
          <Input aria-label={`Highlight ${index + 1} meaning`} value={row.label} maxLength={60} placeholder={EXAMPLES[index % 3].label} onChange={(event) => change(index, 'label', event.target.value)} />
          <Button type="button" variant="ghost" size="icon" aria-label={`Remove highlight ${index + 1}`} onClick={() => setRows((current) => current.filter((_, at) => at !== index))}><Trash2 className="h-4 w-4" /></Button>
        </div>)}
        {rows.length < 4 ? <Button type="button" variant="surface" size="sm" className="w-fit" onClick={() => setRows((current) => [...current, { value: '', label: '' }])}><Plus className="h-4 w-4" />Add a highlight</Button> : null}
      </div>
      <DialogFooter><Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button><Button type="button" variant="brand" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</Button></DialogFooter>
    </DialogContent>
  </Dialog>
}
