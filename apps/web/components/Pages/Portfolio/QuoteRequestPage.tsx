'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { BriefcaseBusiness, FolderOpen, Quote as QuoteIcon } from 'lucide-react'

import { Button } from '@components/ui/button'
import { answerQuoteRequest, getQuoteRequest, type QuoteRequestView } from '@services/portfolio/records'

import { tr } from '@/lib/tr'
// The page behind a quote request's email link. No account: the link is the permission, and it works once.
// It shows who asked and about what, their note, and the person's own name and role, prefilled and theirs to fix.

const field = 'h-12 w-full rounded-2xl border-2 border-border bg-card px-4 text-[15px] font-semibold outline-none focus:border-[#8B5CF6]'

export function QuoteRequestPage({ token }: { token: string }) {
  const [view, setView] = useState<QuoteRequestView | null>(null)
  const [state, setState] = useState<'loading' | 'open' | 'gone' | 'sent'>('loading')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    getQuoteRequest(token).then((next) => { setView(next); setState('open') }).catch(() => setState('gone'))
  }, [token])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const body = String(data.get('body') || '').trim(), name = String(data.get('name') || '').trim()
    if (!name || !body) return setError(!name ? tr('lit.quote_request_page.add_your_name', 'Add your name') : tr('lit.quote_request_page.write_your_quote', 'Write your quote'))
    setBusy(true); setError('')
    try {
      await answerQuoteRequest(token, { name, role_label: String(data.get('role_label') || '').trim(), body, reference: data.get('reference') === 'on' })
      setState('sent')
    } catch (failure: any) { setError(failure?.message || tr('lit.quote_request_page.that_didn_t_go_through', 'That didn’t go through. Try again.')) } finally { setBusy(false) }
  }

  const first = view?.learner.first_name || view?.learner.name || tr('lit.quote_request_page.they', 'They')
  const Icon = view?.item.kind === 'project' ? FolderOpen : BriefcaseBusiness
  return <main className="min-h-screen bg-background px-4 py-10 text-foreground sm:py-16" data-quote-request={state}>
    <div className="mx-auto grid max-w-[560px] gap-6">
      {state === 'loading' ? <p className="text-center text-muted-foreground">{tr('portfolio.quote_request_page.loading', 'Loading…')}</p> : null}
      {state === 'gone' ? <div className="grid gap-2 rounded-3xl border-2 border-border bg-card p-6 text-center"><h1 className="text-2xl font-extrabold">{tr('portfolio.quote_request_page.this_link_has_been_used', 'This link has been used')}</h1><p className="text-muted-foreground">{tr('portfolio.quote_request_page.either_the_quote_was_already', 'Either the quote was already sent, or the ask was taken back. Nothing more to do here.')}</p></div> : null}
      {state === 'sent' ? <div className="grid gap-2 rounded-3xl border-2 border-border bg-card p-6 text-center"><h1 className="text-2xl font-extrabold">{tr('portfolio.quote_request_page.thank_you', 'Thank you')}</h1><p className="text-muted-foreground">{tr('portfolio.quote_request_page.your_words_are_on_first', 'Your words are on {{first}}’s portfolio now. That means a lot to someone just starting out.', { first })}</p></div> : null}
      {state === 'open' && view ? <>
        <div className="grid gap-2">
          <p className="text-sm font-extrabold uppercase tracking-wide text-[#6539D8] dark:text-[#b9a2ff]">{tr('portfolio.quote_request_page.a_quote_for_name', 'A quote for {{name}}', { name: view.learner.name })}</p>
          <h1 className="text-[clamp(26px,5vw,34px)] font-extrabold leading-tight">{tr('portfolio.quote_request_page.first_asked_what_you_d', '{{first}} asked what you’d say about their time here', { first })}</h1>
        </div>
        <div className="flex items-center gap-3 rounded-3xl border-2 border-border bg-card p-4 shadow-[0_4px_0_hsl(var(--border))]">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[#13B3A4] text-white shadow-[0_3px_0_#0B7D73]"><Icon className="h-6 w-6" /></span>
          <span className="min-w-0"><b className="block truncate text-[17px] font-extrabold">{view.item.title}</b>{view.item.detail ? <small className="block truncate text-sm font-semibold text-muted-foreground">{view.item.detail}</small> : null}</span>
        </div>
        {view.note ? <blockquote className="rounded-3xl bg-muted/70 p-4 text-[15px] font-semibold leading-relaxed">“{view.note}”<small className="mt-1 block text-xs font-bold text-muted-foreground">{first}</small></blockquote> : null}
        <form onSubmit={submit} className="grid gap-3">
          <label className="grid gap-1.5 text-sm font-extrabold"><span className="flex items-center gap-1.5"><QuoteIcon className="h-4 w-4" />{tr('portfolio.quote_request_page.your_quote', 'Your quote')}</span><textarea name="body" required rows={4} maxLength={2000} autoFocus placeholder={tr('portfolio.quote_request_page.a_sentence_or_two_about', 'A sentence or two about {{first}}: what they did well, what you’d tell an employer.', { first })} className="w-full rounded-2xl border-2 border-border bg-card p-4 text-[15px] font-semibold leading-relaxed outline-none focus:border-[#8B5CF6]" /></label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1.5 text-sm font-extrabold">{tr('portfolio.quote_request_page.your_name', 'Your name')}<input name="name" required defaultValue={view.name} maxLength={160} className={field} /></label>
            <label className="grid gap-1.5 text-sm font-extrabold">{tr('portfolio.quote_request_page.your_role', 'Your role')}<input name="role_label" defaultValue={view.role_label} maxLength={200} placeholder={tr('portfolio.quote_request_page.shift_lead_lane_county_shelter', 'Shift lead, Lane County Shelter')} className={field} /></label>
          </div>
          <label className="flex items-center gap-2.5 rounded-2xl bg-muted/70 px-4 py-3 text-sm font-bold"><input type="checkbox" name="reference" className="h-4 w-4 accent-[#8B5CF6]" />{tr('portfolio.quote_request_page.first_can_list_me_as', '{{first}} can list me as a reference', { first })}</label>
          {error ? <p className="text-sm font-bold text-red-600" role="alert">{error}</p> : null}
          <Button type="submit" variant="brand" className="h-12" disabled={busy}>{busy ? tr('portfolio.portfolio_header_parts.sending', 'Sending…') : tr('portfolio.quote_request_page.send_my_quote', 'Send my quote')}</Button>
          <p className="text-center text-xs text-muted-foreground">{tr('portfolio.quote_request_page.your_name_and_role_show', 'Your name and role show with your quote. Your email is never shown.')}</p>
        </form>
      </> : null}
    </div>
  </main>
}
