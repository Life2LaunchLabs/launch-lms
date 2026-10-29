'use client'

import { useState } from 'react'
import { Plus, Trash2, Users } from 'lucide-react'
import toast from 'react-hot-toast'

import { useLHSession } from '@components/Contexts/LHSessionContext'
import { Button } from '@components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@components/ui/dialog'
import { DropdownMenuItem } from '@components/ui/dropdown-menu'
import { Input } from '@components/ui/input'
import { Label } from '@components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@components/ui/select'
import { Switch } from '@components/ui/switch'
import { Textarea } from '@components/ui/textarea'
import { getUriWithOrg } from '@services/config/config'
import { getMyPortfolio } from '@services/portfolio/portfolio'
import { contacts as contactsApi, quotes as quotesApi } from '@services/portfolio/records'
import { DetailHeader, Row, RowControls } from './PortfolioDetail'
import { EmptyAdd, PersonDot, type OpenChange } from './parts'
import type { Contact, Quote, Shell } from '../portfolioTypes'

// My people: the people in your corner. They don't need an account; their contact details and your notes are
// only ever yours. Quotes you add show on your portfolio unless you hide them.

const NONE = 'none'
type Draft = { name: string; role_label: string; email: string; phone: string; note: string; is_reference: boolean; timeline_uuid: string; quote: string }

function ContactDialog({ open, onOpenChange, contact, quote, shell, token, onSaved }: { open: boolean; onOpenChange: OpenChange; contact?: Contact; quote?: Quote; shell: Shell; token?: string; onSaved: () => void }) {
  const initial = (): Draft => ({ name: contact?.name || '', role_label: contact?.role_label || '', email: contact?.email || '', phone: contact?.phone || '', note: contact?.note || '', is_reference: Boolean(contact?.is_reference), timeline_uuid: contact?.timeline_uuid || NONE, quote: quote?.body || '' })
  const [draft, setDraft] = useState<Draft>(initial)
  const [busy, setBusy] = useState(false)
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((current) => ({ ...current, [key]: value }))

  async function save() {
    if (!token) return
    if (!draft.name.trim()) return toast.error('Add their name')
    setBusy(true)
    try {
      const payload = { name: draft.name, role_label: draft.role_label, email: draft.email, phone: draft.phone, note: draft.note, is_reference: draft.is_reference, timeline_uuid: draft.timeline_uuid === NONE ? null : draft.timeline_uuid }
      const saved = contact ? await contactsApi.update(contact.contact_uuid, payload, token) : await contactsApi.create(payload, token)
      const body = draft.quote.trim()
      if (quote && !body) await quotesApi.remove(quote.quote_uuid, token)
      else if (quote && body !== quote.body) await quotesApi.update(quote.quote_uuid, { body }, token)
      else if (!quote && body) await quotesApi.create({ contact_uuid: saved.contact_uuid, body, timeline_uuid: payload.timeline_uuid }, token)
      onSaved()
    } catch (error: any) { toast.error(error?.message || 'Could not save this') } finally { setBusy(false) }
  }

  async function remove() {
    if (!token || !contact || !window.confirm(`Remove ${contact.name} and their quotes?`)) return
    setBusy(true)
    try { await contactsApi.remove(contact.contact_uuid, token); onSaved() } catch (error: any) { toast.error(error?.message || 'Could not remove this') } finally { setBusy(false) }
  }

  return <Dialog open={open} onOpenChange={(next) => { if (next) setDraft(initial()); onOpenChange(next) }}>
    <DialogContent className="max-h-[90dvh] max-w-lg overflow-y-auto">
      <DialogHeader><DialogTitle>{contact ? contact.name : 'Add someone'}</DialogTitle><DialogDescription>A boss, coach, teacher or mentor. They don’t need an account, and only you see their contact details.</DialogDescription></DialogHeader>
      <div className="grid gap-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5"><Label htmlFor="pp-name">Name</Label><Input id="pp-name" value={draft.name} maxLength={160} onChange={(event) => set('name', event.target.value)} placeholder="Jordan Lee" /></div>
          <div className="grid gap-1.5"><Label htmlFor="pp-role">Who they are to you</Label><Input id="pp-role" value={draft.role_label} maxLength={200} onChange={(event) => set('role_label', event.target.value)} placeholder="Owner, Tacos La Estrella" /></div>
        </div>
        <div className="grid gap-1.5"><Label htmlFor="pp-quote">Something they said about you <span className="font-normal text-muted-foreground">(optional)</span></Label><Textarea id="pp-quote" value={draft.quote} maxLength={2000} rows={3} onChange={(event) => set('quote', event.target.value)} placeholder="“Shows up early and makes the new folks feel at home.”" /><p className="text-xs text-muted-foreground">Shown on your portfolio as something they said. Only add words they really said.</p></div>
        {shell.timeline?.length ? <div className="grid gap-1.5"><Label>Where you know them from <span className="font-normal text-muted-foreground">(optional)</span></Label><Select value={draft.timeline_uuid} onValueChange={(value) => set('timeline_uuid', value)}><SelectTrigger aria-label="Where you know them from"><SelectValue /></SelectTrigger><SelectContent><SelectItem value={NONE}>Not one of my experiences</SelectItem>{shell.timeline.map((entry) => <SelectItem key={entry.timeline_uuid} value={entry.timeline_uuid}>{[entry.title, entry.organization].filter(Boolean).join(', ')}</SelectItem>)}</SelectContent></Select></div> : null}
        <label className="flex items-center justify-between gap-3 rounded-2xl bg-muted px-4 py-3"><span><b className="block text-sm font-extrabold">They’re a reference</b><small className="block text-xs text-muted-foreground">Someone who said you can list them.</small></span><Switch checked={draft.is_reference} onCheckedChange={(value) => set('is_reference', value)} aria-label="They’re a reference" /></label>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5"><Label htmlFor="pp-email">Email <span className="font-normal text-muted-foreground">(only you)</span></Label><Input id="pp-email" type="email" value={draft.email} maxLength={320} onChange={(event) => set('email', event.target.value)} /></div>
          <div className="grid gap-1.5"><Label htmlFor="pp-phone">Phone <span className="font-normal text-muted-foreground">(only you)</span></Label><Input id="pp-phone" type="tel" value={draft.phone} maxLength={40} onChange={(event) => set('phone', event.target.value)} /></div>
        </div>
        <div className="grid gap-1.5"><Label htmlFor="pp-note">Notes <span className="font-normal text-muted-foreground">(only you)</span></Label><Textarea id="pp-note" value={draft.note} maxLength={2000} rows={2} onChange={(event) => set('note', event.target.value)} placeholder="Ask before listing them for a summer job" /></div>
      </div>
      <DialogFooter className="gap-2 sm:justify-between">
        {contact ? <Button type="button" variant="ghost" className="text-red-600" onClick={remove} disabled={busy}><Trash2 className="h-4 w-4" />Remove</Button> : <span />}
        <div className="flex gap-2"><Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button><Button type="button" variant="brand" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</Button></div>
      </DialogFooter>
    </DialogContent>
  </Dialog>
}

export function PortfolioPeoplePage({ initialShell, orgslug }: { initialShell: Shell; orgslug: string }) {
  const session = useLHSession() as any
  const token = session?.data?.tokens?.access_token
  const [shell, setShell] = useState(initialShell)
  const [editing, setEditing] = useState<{ contact?: Contact } | null>(null)
  const people = shell.contacts || []
  const quotesFor = (contact: Contact) => (shell.quotes || []).filter((quote) => quote.contact_uuid === contact.contact_uuid)
  const refresh = async () => { setEditing(null); if (token) setShell(await getMyPortfolio(token)) }
  const changeQuote = async (quote: Quote, payload: Record<string, unknown>) => {
    if (!token) return
    try { await quotesApi.update(quote.quote_uuid, payload, token); setShell(await getMyPortfolio(token)) } catch (error: any) { toast.error(error?.message || 'Could not change this quote') }
  }

  return <main className="min-h-screen bg-background pb-20 text-foreground" data-portfolio-v2="people">
    <div className="mx-auto max-w-[960px] px-4 pt-4 sm:px-6 sm:pt-6">
      <DetailHeader href={getUriWithOrg(orgslug, '/portfolio')} owner color="orange" icon={Users} title="My people"><Button type="button" variant="brand" className="h-10" onClick={() => setEditing({})}><Plus className="h-4 w-4" />Add</Button></DetailHeader>
      <p className="mb-4 px-2 text-[15px] text-muted-foreground">The people in your corner. Visitors see the quotes you show, never anyone’s contact details or your notes.</p>
      {people.length ? <ul className="grid grid-cols-[minmax(0,1fr)] gap-1">{people.map((person) => {
        const quotes = quotesFor(person)
        return <li key={person.contact_uuid} className="min-w-0 rounded-2xl">
          <ul className="grid grid-cols-[minmax(0,1fr)]">
            <Row controls={<Button type="button" variant="ghost" size="sm" className="relative z-[1]" onClick={() => setEditing({ contact: person })}>Edit</Button>}>
              <PersonDot name={person.name} className="h-11 w-11 text-[15px]" />
              <span className="min-w-0"><b className="block truncate text-[15px] font-extrabold">{person.name}{person.is_reference ? <span className="ml-2 rounded-full bg-muted px-2 py-0.5 align-middle text-[11px] font-bold text-muted-foreground">Reference</span> : null}</b><small className="block truncate text-[13px] font-semibold text-muted-foreground">{person.role_label || person.email}</small></span>
            </Row>
            {quotes.map((quote) => <Row key={quote.quote_uuid} dim={quote.visibility === 'private'} controls={<RowControls name="this quote" featured={quote.featured} hidden={quote.visibility === 'private'} onFeature={() => changeQuote(quote, { featured: !quote.featured })} onHide={() => changeQuote(quote, { visibility: quote.visibility === 'private' ? 'public' : 'private' })} menu={<DropdownMenuItem onSelect={() => setEditing({ contact: person })} className="rounded-xl px-3 py-2">Edit</DropdownMenuItem>} />}>
              <span className="w-11 shrink-0" />
              <blockquote className="min-w-0 text-[15px] font-semibold leading-normal">“{quote.body}”{quote.confirmed ? <small className="ml-2 text-xs font-bold text-[#0B7D73]">Confirmed</small> : null}</blockquote>
            </Row>)}
          </ul>
        </li>
      })}</ul> : <EmptyAdd title="Add someone in your corner" hint="A boss, coach or teacher. They don’t need an account." onClick={() => setEditing({})} />}
    </div>
    <ContactDialog key={editing?.contact?.contact_uuid || 'new'} open={Boolean(editing)} onOpenChange={(open) => { if (!open) setEditing(null) }} contact={editing?.contact} quote={editing?.contact ? quotesFor(editing.contact)[0] : undefined} shell={shell} token={token} onSaved={refresh} />
  </main>
}
