'use client'

import { type KeyboardEvent, useState } from 'react'
import { Check, X } from 'lucide-react'
import toast from 'react-hot-toast'

import { Input } from '@components/ui/input'
import { getMyPortfolio, updateMyPortfolio } from '@services/portfolio/portfolio'
import { updateMyIdentity } from '@services/portfolio/records'
import type { Identity, SetShell, Shell } from '../portfolioTypes'

import { tr } from '@/lib/tr'
// Who you are, edited right on the portfolio (PO-3): the name with a switch between your legal name and the name you go
// by, and the one-line intro. Each has a tick that saves and a cross that puts the old text back. Rosters and reports
// keep the legal name; the name you go by shows everywhere else, and for staff it's also what learners call them.

type Done = () => void

function TickCross({ busy, onSave, onCancel }: { busy: boolean; onSave: Done; onCancel: Done }) {
  const round = 'grid h-10 w-10 shrink-0 place-items-center rounded-full border-2 transition disabled:opacity-50'
  return <span className="flex shrink-0 gap-1.5">
    <button type="button" onClick={onCancel} disabled={busy} aria-label={tr('portfolio.inline_profile.cancel', 'Cancel')} title={tr('portfolio.inline_profile.cancel', 'Cancel')} className={`${round} border-border bg-card text-muted-foreground hover:text-foreground`}><X className="h-4 w-4" /></button>
    <button type="button" onClick={onSave} disabled={busy} aria-label={tr('portfolio.inline_profile.save', 'Save')} title={tr('portfolio.inline_profile.save', 'Save')} className={`${round} border-foreground bg-foreground text-background hover:opacity-90`}><Check className="h-4 w-4" /></button>
  </span>
}

const keys = (onSave: Done, onCancel: Done) => (event: KeyboardEvent) => {
  if (event.key === 'Enter') { event.preventDefault(); onSave() }
  if (event.key === 'Escape') { event.preventDefault(); onCancel() }
}

/** The name: legal (first and last) or the name you go by, picked with a switch; each saves with the tick. */
export function NameEditor({ identity, token, onSaved, onCancel }: { identity?: Identity | null; token?: string; onSaved: (identity: Identity) => void; onCancel: Done }) { // eslint-disable-line no-unused-vars
  const [mode, setMode] = useState<'legal' | 'preferred'>(identity?.preferred_name ? 'preferred' : 'legal')
  const [first, setFirst] = useState(identity?.first_name || '')
  const [last, setLast] = useState(identity?.last_name || '')
  const [preferred, setPreferred] = useState(identity?.preferred_name || '')
  const [busy, setBusy] = useState(false)
  async function save() {
    if (!token) return
    if (!first.trim()) { setMode('legal'); return void toast.error(tr('portfolio.portfolio_dialogs.add_your_first_name', 'Add your first name')) }
    setBusy(true)
    try {
      onSaved(await updateMyIdentity({ first_name: first.trim(), last_name: last.trim(), preferred_name: preferred.trim() }, token))
    } catch (error: any) { toast.error(error?.message || tr('portfolio.inline_profile.could_not_save_your_name', 'Could not save your name')) } finally { setBusy(false) }
  }
  const onKey = keys(() => void save(), onCancel)
  const tab = (value: typeof mode, label: string) => <button type="button" role="radio" aria-checked={mode === value} onClick={() => setMode(value)}
    className={`rounded-full px-3 py-1.5 text-[13px] font-bold transition ${mode === value ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>{label}</button>
  return <div data-pf-name-editor className="grid w-full max-w-[560px] gap-2 text-left text-base font-normal normal-case tracking-normal">
    <div role="radiogroup" aria-label={tr('portfolio.inline_profile.which_name', 'Which name')} className="flex w-fit gap-0.5 rounded-full bg-muted p-1">
      {tab('legal', tr('portfolio.inline_profile.legal_name', 'Legal name'))}
      {tab('preferred', tr('portfolio.inline_profile.name_you_go_by', 'Name you go by'))}
    </div>
    <div className="flex flex-wrap items-center gap-2">
      {mode === 'legal' ? <div className="grid min-w-0 flex-1 basis-60 grid-cols-2 gap-2">
        <Input aria-label={tr('portfolio.portfolio_dialogs.first_name', 'First name')} placeholder={tr('portfolio.portfolio_dialogs.first_name', 'First name')} value={first} maxLength={80} autoComplete="given-name" autoFocus onChange={(event) => setFirst(event.target.value)} onKeyDown={onKey} className="h-11" />
        <Input aria-label={tr('portfolio.portfolio_dialogs.last_name', 'Last name')} placeholder={tr('portfolio.portfolio_dialogs.last_name', 'Last name')} value={last} maxLength={80} autoComplete="family-name" onChange={(event) => setLast(event.target.value)} onKeyDown={onKey} className="h-11" />
      </div> : <Input aria-label={tr('portfolio.inline_profile.name_you_go_by', 'Name you go by')} placeholder={[first, last].filter(Boolean).join(' ') || tr('portfolio.inline_profile.like_mya_rivera', 'Like “Mya Rivera”')} value={preferred} maxLength={80} autoComplete="nickname" autoFocus onChange={(event) => setPreferred(event.target.value)} onKeyDown={onKey} className="h-11 min-w-0 flex-1 basis-60" />}
      <TickCross busy={busy} onSave={() => void save()} onCancel={onCancel} />
    </div>
    <p className="text-xs text-muted-foreground">{mode === 'legal'
      ? tr('portfolio.inline_profile.legal_help', 'As on official records. Rosters and reports use it.')
      : tr('portfolio.inline_profile.preferred_help', 'Shown on your portfolio and around the app instead of your legal name. If you’re staff, it’s what learners see too. Leave it empty to use your legal name.')}</p>
  </div>
}

/** The one-line intro, typed in place. */
export function IntroEditor({ shell, setShell, token, onDone }: { shell: Shell; setShell: SetShell; token?: string; onDone: Done }) {
  const [value, setValue] = useState(shell.portfolio.headline || '')
  const [busy, setBusy] = useState(false)
  async function save() {
    if (!token) return
    setBusy(true)
    try {
      const current = await getMyPortfolio(token)
      setShell(await updateMyPortfolio({ revision: current.portfolio.revision, headline: value.trim() }, token))
      onDone()
    } catch (error: any) { toast.error(error?.message || tr('portfolio.inline_profile.could_not_save_your_intro', 'Could not save your intro')) } finally { setBusy(false) }
  }
  return <div data-pf-intro-editor className="flex w-full max-w-[560px] flex-wrap items-center gap-2 text-left text-base font-normal normal-case tracking-normal">
    <Input aria-label={tr('portfolio.portfolio_dialogs.one_line_intro', 'One-line intro')} value={value} maxLength={140} autoFocus placeholder={tr('portfolio.portfolio_dialogs.artist_and_future_ux_designer', 'Artist and future UX designer')}
      onChange={(event) => setValue(event.target.value)} onKeyDown={keys(() => void save(), onDone)} className="h-11 min-w-0 flex-1 basis-60" />
    <TickCross busy={busy} onSave={() => void save()} onCancel={onDone} />
  </div>
}
