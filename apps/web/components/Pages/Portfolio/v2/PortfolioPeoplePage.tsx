'use client'

import { useState } from 'react'
import { Plus, Trash2, Users } from 'lucide-react'
import toast from 'react-hot-toast'

import { useLHSession } from '@components/Contexts/LHSessionContext'
import { Button } from '@components/ui/button'
import { useAsk } from '@components/ui/ask-dialog'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@components/ui/dialog'
import { DropdownMenuItem } from '@components/ui/dropdown-menu'
import { Input } from '@components/ui/input'
import { Label } from '@components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@components/ui/select'
import { Switch } from '@components/ui/switch'
import { Textarea } from '@components/ui/textarea'
import { getUriWithOrg } from '@services/config/config'
import { getMyPortfolio } from '@services/portfolio/portfolio'
import { contacts as contactsApi, quotes as quotesApi, takeBackAsk } from '@services/portfolio/records'
import type { Setter } from './inplace'
import { AddByAccount, PersonAccess } from './PeopleAccess'
import { DetailHeader, Row, RowControls } from './PortfolioDetail'
import { EmptyAdd, PersonDot, type OpenChange } from './parts'
import type { Contact, Quote, Shell } from '../portfolioTypes'

import { tr } from '@/lib/tr'
// My people: the people in your corner. They don't need an account; their contact details and your notes are
// only ever yours. Their quotes are never typed in here: you ask for one from an experience or project, they
// write it from an emailed link, and it shows on your portfolio unless you hide it.

const NONE = 'none'
const sees = (person: Contact) => {
  const what = [person.account?.portfolio && 'portfolio', person.account?.plans && 'plans'].filter(Boolean)
  return what.length ? `Sees your ${what.join(' and ')}` : ''
}
type Draft = { name: string; role_label: string; email: string; phone: string; note: string; is_reference: boolean; timeline_uuid: string }

function ContactDialog({ open, onOpenChange, contact, shell, token, onSaved, onContact }: { open: boolean; onOpenChange: OpenChange; contact?: Contact; shell: Shell; token?: string; onSaved: () => void; onContact: Setter<Contact> }) {
  const initial = (): Draft => ({ name: contact?.name || '', role_label: contact?.role_label || '', email: contact?.email || '', phone: contact?.phone || '', note: contact?.note || '', is_reference: Boolean(contact?.is_reference), timeline_uuid: contact?.timeline_uuid || NONE })
  const [draft, setDraft] = useState<Draft>(initial)
  const [busy, setBusy] = useState(false)
  const ask = useAsk()
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((current) => ({ ...current, [key]: value }))

  async function save() {
    if (!token) return
    if (!draft.name.trim()) return toast.error(tr('portfolio.portfolio_people_page.add_their_name', 'Add their name'))
    setBusy(true)
    try {
      const payload = { name: draft.name, role_label: draft.role_label, email: draft.email, phone: draft.phone, note: draft.note, is_reference: draft.is_reference, timeline_uuid: draft.timeline_uuid === NONE ? null : draft.timeline_uuid }
      if (contact) await contactsApi.update(contact.contact_uuid, payload, token)
      else await contactsApi.create(payload, token)
      onSaved()
    } catch (error: any) { toast.error(error?.message || tr('portfolio.portfolio_people_page.could_not_save_this', 'Could not save this')) } finally { setBusy(false) }
  }

  async function remove() {
    if (!token || !contact || !(await ask.confirm({ title: tr('portfolio.portfolio_people_page.remove_name', 'Remove {{name}}?', { name: contact.name }), body: tr('lit.portfolio_people_page.their_quotes_come_off_your', 'Their quotes come off your portfolio too.'), action: tr('lit.portfolio_people_page.remove', 'Remove'), danger: true }))) return
    setBusy(true)
    try { await contactsApi.remove(contact.contact_uuid, token); onSaved() } catch (error: any) { toast.error(error?.message || tr('portfolio.portfolio_people_page.could_not_remove_this', 'Could not remove this')) } finally { setBusy(false) }
  }

  return <Dialog open={open} onOpenChange={(next) => { if (next) setDraft(initial()); onOpenChange(next) }}>
    {ask.dialog}
    <DialogContent className="max-h-[90dvh] max-w-lg overflow-y-auto">
      <DialogHeader><DialogTitle>{contact ? contact.name : tr('portfolio.portfolio_people_page.add_someone', 'Add someone')}</DialogTitle><DialogDescription>{contact?.account ? tr('portfolio.portfolio_people_page.only_you_see_their_contact', 'Only you see their contact details and your notes.') : tr('portfolio.portfolio_people_page.a_boss_coach_teacher_or', 'A boss, coach, teacher or mentor. They don’t need an account, and only you see their contact details.')}</DialogDescription></DialogHeader>
      <div className="grid gap-4 pt-1">
        {contact ? <PersonAccess contact={contact} token={token} onChange={onContact} /> : <AddByAccount token={token} onAdded={onContact} />}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5"><Label htmlFor="pp-name">{tr('portfolio.portfolio_header_parts.name', 'Name')}</Label><Input id="pp-name" value={draft.name} maxLength={160} onChange={(event) => set('name', event.target.value)} placeholder={tr('portfolio.portfolio_people_page.jordan_lee', 'Jordan Lee')} /></div>
          <div className="grid gap-1.5"><Label htmlFor="pp-role">{tr('portfolio.portfolio_people_page.who_they_are_to_you', 'Who they are to you')}</Label><Input id="pp-role" value={draft.role_label} maxLength={200} onChange={(event) => set('role_label', event.target.value)} placeholder={tr('portfolio.portfolio_people_page.owner_tacos_la_estrella', 'Owner, Tacos La Estrella')} /></div>
        </div>
        {shell.timeline?.length ? <div className="grid gap-1.5"><Label>{tr('portfolio.portfolio_people_page.where_you_know_them_from', 'Where you know them from')}{' '}<span className="font-normal text-muted-foreground">{tr('portfolio.ask_quote.optional', '(optional)')}</span></Label><Select value={draft.timeline_uuid} onValueChange={(value) => set('timeline_uuid', value)}><SelectTrigger aria-label={tr('portfolio.portfolio_people_page.where_you_know_them_from', 'Where you know them from')}><SelectValue /></SelectTrigger><SelectContent><SelectItem value={NONE}>{tr('portfolio.portfolio_people_page.not_one_of_my_experiences', 'Not one of my experiences')}</SelectItem>{shell.timeline.map((entry) => <SelectItem key={entry.timeline_uuid} value={entry.timeline_uuid}>{[entry.title, entry.organization].filter(Boolean).join(', ')}</SelectItem>)}</SelectContent></Select></div> : null}
        <label className="flex items-center justify-between gap-3 rounded-2xl bg-muted px-4 py-3"><span><b className="block text-sm font-extrabold">{tr('portfolio.portfolio_people_page.they_re_a_reference', 'They’re a reference')}</b><small className="block text-xs text-muted-foreground">{tr('portfolio.portfolio_people_page.someone_who_said_you_can', 'Someone who said you can list them.')}</small></span><Switch checked={draft.is_reference} onCheckedChange={(value) => set('is_reference', value)} aria-label={tr('portfolio.portfolio_people_page.they_re_a_reference', 'They’re a reference')} /></label>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5"><Label htmlFor="pp-email">{tr('portfolio.resume_builder.email', 'Email')}{' '}<span className="font-normal text-muted-foreground">{tr('portfolio.portfolio_people_page.only_you', '(only you)')}</span></Label><Input id="pp-email" type="email" value={draft.email} maxLength={320} onChange={(event) => set('email', event.target.value)} /></div>
          <div className="grid gap-1.5"><Label htmlFor="pp-phone">{tr('portfolio.resume_builder.phone', 'Phone')}{' '}<span className="font-normal text-muted-foreground">{tr('portfolio.portfolio_people_page.only_you', '(only you)')}</span></Label><Input id="pp-phone" type="tel" value={draft.phone} maxLength={40} onChange={(event) => set('phone', event.target.value)} /></div>
        </div>
        <div className="grid gap-1.5"><Label htmlFor="pp-note">{tr('portfolio.portfolio_people_page.notes', 'Notes')}{' '}<span className="font-normal text-muted-foreground">{tr('portfolio.portfolio_people_page.only_you', '(only you)')}</span></Label><Textarea id="pp-note" value={draft.note} maxLength={2000} rows={2} onChange={(event) => set('note', event.target.value)} placeholder={tr('portfolio.portfolio_people_page.ask_before_listing_them_for', 'Ask before listing them for a summer job')} /></div>
      </div>
      <DialogFooter className="gap-2 sm:justify-between">
        {contact ? <Button type="button" variant="ghost" className="text-red-600" onClick={remove} disabled={busy}><Trash2 className="h-4 w-4" />{tr('portfolio.month_date_range_field.remove', 'Remove')}</Button> : <span />}
        <div className="flex gap-2"><Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>{tr('portfolio.connect_request.cancel', 'Cancel')}</Button><Button type="button" variant="brand" onClick={save} disabled={busy}>{busy ? tr('portfolio.portfolio_header_parts.saving', 'Saving…') : tr('portfolio.resume_builder.save', 'Save')}</Button></div>
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
  // Access changes save on their own: keep the dialog open on that person and the list in step.
  const showContact = (contact: Contact) => {
    setShell((current) => ({ ...current, contacts: (current.contacts || []).some((item) => item.contact_uuid === contact.contact_uuid) ? (current.contacts || []).map((item) => item.contact_uuid === contact.contact_uuid ? contact : item) : [...(current.contacts || []), contact] }))
    setEditing({ contact })
  }
  const refresh = async () => { setEditing(null); if (token) setShell(await getMyPortfolio(token)) }
  const about = (quote: Quote) => shell.timeline?.find((entry) => entry.timeline_uuid === quote.timeline_uuid)?.title || shell.projects?.find((project) => project.project_uuid === quote.project_uuid)?.title || 'you'
  const takeBack = async (quote: Quote) => {
    if (!token) return
    try { await takeBackAsk(quote.quote_uuid, token); setShell(await getMyPortfolio(token)) } catch (error: any) { toast.error(error?.message || tr('portfolio.ask_quote.could_not_take_that_back', 'Could not take that back')) }
  }
  const changeQuote = async (quote: Quote, payload: Record<string, unknown>) => {
    if (!token) return
    try { await quotesApi.update(quote.quote_uuid, payload, token); setShell(await getMyPortfolio(token)) } catch (error: any) { toast.error(error?.message || tr('portfolio.portfolio_people_page.could_not_change_this_quote', 'Could not change this quote')) }
  }

  return <main className="min-h-screen bg-background pb-20 text-foreground" data-portfolio-v2="people">
    <div className="mx-auto max-w-[960px] px-4 pt-4 sm:px-6 sm:pt-6">
      <DetailHeader href={getUriWithOrg(orgslug, '/portfolio')} owner color="orange" icon={Users} title={tr('portfolio.portfolio_tiles.my_people', 'My people')}><Button type="button" variant="brand" className="h-10" onClick={() => setEditing({})}><Plus className="h-4 w-4" />{tr('portfolio.portfolio_header_parts.add', 'Add')}</Button></DetailHeader>
      <p className="mb-4 px-2 text-[15px] text-muted-foreground">{tr('portfolio.portfolio_people_page.the_people_in_your_corner', 'The people in your corner. To get a quote, open an experience or project and ask someone about it. Visitors see the quotes you show, never anyone’s contact details or your notes.')}</p>
      {people.length ? <ul className="grid grid-cols-[minmax(0,1fr)] gap-1">{people.map((person) => {
        const quotes = quotesFor(person)
        return <li key={person.contact_uuid} className="min-w-0 rounded-2xl">
          <ul className="grid grid-cols-[minmax(0,1fr)]">
            <Row controls={<Button type="button" variant="ghost" size="sm" className="relative z-[1]" onClick={() => setEditing({ contact: person })}>{tr('portfolio.portfolio_projects.edit', 'Edit')}</Button>}>
              <PersonDot name={person.name} className="h-11 w-11 text-[15px]" />
              <span className="min-w-0"><b className="block truncate text-[15px] font-extrabold">{person.name}{person.is_reference ? <span className="ml-2 rounded-full bg-muted px-2 py-0.5 align-middle text-[11px] font-bold text-muted-foreground">{tr('portfolio.portfolio_people_page.reference', 'Reference')}</span> : null}</b><small className="block truncate text-[13px] font-semibold text-muted-foreground">{[person.role_label || person.email, sees(person)].filter(Boolean).join(' · ')}</small></span>
            </Row>
            {quotes.map((quote) => <Row key={quote.quote_uuid} dim={quote.visibility === 'private'} controls={<RowControls name="this quote" featured={quote.featured} hidden={quote.visibility === 'private'} onFeature={() => changeQuote(quote, { featured: !quote.featured })} onHide={() => changeQuote(quote, { visibility: quote.visibility === 'private' ? 'public' : 'private' })} menu={quote.status === 'requested' ? <DropdownMenuItem onSelect={() => void takeBack(quote)} className="rounded-xl px-3 py-2">{tr('portfolio.portfolio_people_page.take_back_the_ask', 'Take back the ask')}</DropdownMenuItem> : undefined} />}>
              <span className="w-11 shrink-0" />
              {quote.status === 'requested' ? <span className="min-w-0 text-[14px] font-semibold text-muted-foreground">{tr('portfolio.portfolio_people_page.asked_about_about_waiting_for', 'Asked about {{about}}. Waiting for their answer.', { about: about(quote) })}</span>
                : <blockquote className="min-w-0 text-[15px] font-semibold leading-normal">“{quote.body}”<small className="mt-1 block text-xs font-bold text-muted-foreground">{about(quote)}{quote.confirmed ? tr('portfolio.ask_quote.confirmed_by_email', ' · Confirmed by email') : ''}</small></blockquote>}
            </Row>)}
          </ul>
        </li>
      })}</ul> : <EmptyAdd title={tr('portfolio.portfolio_people_page.add_someone_in_your_corner', 'Add someone in your corner')} hint={tr('portfolio.portfolio_tiles.a_boss_coach_or_teacher', 'A boss, coach or teacher. They don’t need an account.')} onClick={() => setEditing({})} />}
    </div>
    <ContactDialog key={editing?.contact?.contact_uuid || 'new'} open={Boolean(editing)} onOpenChange={(open) => { if (!open) setEditing(null) }} contact={editing?.contact} shell={shell} token={token} onSaved={refresh} onContact={showContact} />
  </main>
}
