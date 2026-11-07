'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Hourglass, MessageSquareQuote, X } from 'lucide-react'
import toast from 'react-hot-toast'

import { Button } from '@components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@components/ui/dialog'
import { askForQuote, takeBackAsk } from '@services/portfolio/records'
import type { Contact, Quote } from '../portfolioTypes'
import { ItemSection } from './inplace'
import { PersonDot, type OpenChange } from './parts'

import { tr } from '@/lib/tr'
// "What they said" on an experience or project: the quotes people sent about it, the asks still waiting, and
// a ghost card to ask someone. A learner never types a quote; the person writes it from the emailed link.

const NEW = 'new'
const input = 'h-11 w-full rounded-xl border-2 border-border bg-card px-3 text-sm font-semibold outline-none focus:border-[#8B5CF6]'

function AskDialog({ open, onOpenChange, contacts, item, token, onSent }: { open: boolean; onOpenChange: OpenChange; contacts: Contact[]; item: { kind: 'experience' | 'project'; uuid: string; title: string }; token?: string; onSent: () => void }) {
  const [who, setWho] = useState(contacts[0]?.contact_uuid || NEW)
  const [busy, setBusy] = useState(false)
  const picked = contacts.find((contact) => contact.contact_uuid === who)

  async function send(form: HTMLFormElement) {
    if (!token) return
    const data = new FormData(form)
    const text = (key: string) => String(data.get(key) || '').trim()
    setBusy(true)
    try {
      await askForQuote({ ...(picked ? { contact_uuid: picked.contact_uuid, email: picked.email ? undefined : text('email') } : { name: text('name'), role_label: text('role_label'), email: text('email') }), [item.kind === 'experience' ? 'timeline_uuid' : 'project_uuid']: item.uuid, note: text('note') }, token)
      toast.success(`Asked ${picked?.name || text('name')}`)
      onSent()
    } catch (error: any) { toast.error(error?.message || tr('portfolio.ask_quote.could_not_send_the_ask', 'Could not send the ask')) } finally { setBusy(false) }
  }

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-w-lg">
      <form onSubmit={(event) => { event.preventDefault(); void send(event.currentTarget) }} className="grid gap-4">
        <DialogHeader><DialogTitle>{tr('portfolio.ask_quote.ask_for_a_quote', 'Ask for a quote')}</DialogTitle><DialogDescription>{tr('portfolio.ask_quote.about_title_they_get_an', 'About {{title}}. They get an email with a link and don’t need an account.', { title: item.title })}</DialogDescription></DialogHeader>
        <label className="grid gap-1.5 text-sm font-extrabold">{tr('portfolio.ask_quote.who', 'Who')}
          <select value={who} onChange={(event) => setWho(event.target.value)} className={input}>
            {contacts.map((contact) => <option key={contact.contact_uuid} value={contact.contact_uuid}>{contact.name}{contact.role_label ? `, ${contact.role_label}` : ''}</option>)}
            <option value={NEW}>{tr('portfolio.ask_quote.someone_new', 'Someone new')}</option>
          </select>
        </label>
        {!picked ? <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1.5 text-sm font-extrabold">{tr('portfolio.portfolio_header_parts.name', 'Name')}<input name="name" required maxLength={160} placeholder={tr('portfolio.ask_quote.dana_lee', 'Dana Lee')} className={input} /></label>
          <label className="grid gap-1.5 text-sm font-extrabold">{tr('portfolio.ask_quote.their_role', 'Their role')}<input name="role_label" maxLength={200} placeholder={tr('portfolio.ask_quote.shift_lead', 'Shift lead')} className={input} /></label>
        </div> : null}
        {!picked || !picked.email ? <label className="grid gap-1.5 text-sm font-extrabold">{tr('portfolio.ask_quote.their_email', 'Their email')}<input name="email" type="email" required maxLength={320} className={input} /><small className="font-semibold text-muted-foreground">{tr('portfolio.ask_quote.only_you_see_it', 'Only you see it.')}</small></label> : null}
        <label className="grid gap-1.5 text-sm font-extrabold"><span>{tr('portfolio.ask_quote.a_note', 'A note')}{' '}<span className="font-semibold text-muted-foreground">{tr('portfolio.ask_quote.optional', '(optional)')}</span></span><textarea name="note" rows={3} maxLength={1000} placeholder={tr('portfolio.ask_quote.hi_could_you_say_a', 'Hi! Could you say a line about my time at {{title}}? It’s for my portfolio.', { title: item.title })} className="w-full rounded-xl border-2 border-border bg-card p-3 text-sm font-semibold outline-none focus:border-[#8B5CF6]" /></label>
        <DialogFooter><Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>{tr('portfolio.connect_request.cancel', 'Cancel')}</Button><Button type="submit" variant="brand" disabled={busy}>{busy ? tr('portfolio.portfolio_header_parts.sending', 'Sending…') : tr('portfolio.ask_quote.send_the_ask', 'Send the ask')}</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
}

export function ItemQuotes({ item, quotes, contacts, token }: { item: { kind: 'experience' | 'project'; uuid: string; title: string }; quotes: Quote[]; contacts: Contact[]; token?: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const said = quotes.filter((quote) => quote.status !== 'requested')
  const waiting = quotes.filter((quote) => quote.status === 'requested')

  async function takeBack(quote: Quote) {
    if (!token) return
    try { await takeBackAsk(quote.quote_uuid, token); router.refresh() } catch (error: any) { toast.error(error?.message || tr('portfolio.ask_quote.could_not_take_that_back', 'Could not take that back')) }
  }

  return <ItemSection title={tr('portfolio.ask_quote.what_they_said', 'What they said')}>
    <div className="grid gap-3 sm:grid-cols-2">
      {said.map((quote) => <figure key={quote.quote_uuid} className="grid content-start gap-3 rounded-2xl border-2 border-border bg-card p-4 shadow-[0_4px_0_hsl(var(--border))]">
        <blockquote className="text-[15px] font-semibold leading-relaxed">“{quote.body}”</blockquote>
        <figcaption className="flex items-center gap-2"><PersonDot name={quote.name} /><span className="min-w-0"><b className="block truncate text-sm font-extrabold">{quote.name}</b><small className="block truncate text-xs font-semibold text-muted-foreground">{quote.role_label}{quote.confirmed ? tr('portfolio.ask_quote.confirmed_by_email', ' · Confirmed by email') : ''}</small></span></figcaption>
      </figure>)}
      {waiting.map((quote) => <div key={quote.quote_uuid} className="flex items-center gap-3 rounded-2xl border-2 border-dashed border-border p-4">
        <Hourglass className="h-5 w-5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1"><b className="block truncate text-sm font-extrabold">{tr('portfolio.ask_quote.waiting_on_name', 'Waiting on {{name}}', { name: quote.name })}</b><small className="block text-xs font-semibold text-muted-foreground">{tr('portfolio.ask_quote.they_got_an_email_with', 'They got an email with a link.')}</small></span>
        <button type="button" onClick={() => void takeBack(quote)} aria-label={tr('portfolio.ask_quote.take_back_the_ask_to', 'Take back the ask to {{name}}', { name: quote.name })} title={tr('portfolio.ask_quote.take_it_back', 'Take it back')} className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"><X className="h-4 w-4" /></button>
      </div>)}
      <button type="button" onClick={() => setOpen(true)} className="flex min-h-[7rem] flex-col items-start justify-center gap-1.5 rounded-2xl border-2 border-dashed border-border p-4 text-left text-muted-foreground transition hover:border-[#8B5CF6] hover:text-foreground">
        <MessageSquareQuote className="h-6 w-6" /><b className="text-[15px] font-extrabold">{tr('portfolio.ask_quote.ask_someone_about_this', 'Ask someone about this')}</b><small className="text-xs font-semibold">{tr('portfolio.ask_quote.a_boss_coach_or_teacher', 'A boss, coach or teacher who saw your work here.')}</small>
      </button>
    </div>
    <AskDialog key={String(open)} open={open} onOpenChange={setOpen} contacts={contacts} item={item} token={token} onSent={() => { setOpen(false); router.refresh() }} />
  </ItemSection>
}
