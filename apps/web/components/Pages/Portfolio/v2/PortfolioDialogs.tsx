'use client'

import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'

import { Button } from '@components/ui/button'
import { Marked } from './inplace'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@components/ui/dialog'
import { Input } from '@components/ui/input'
import { Label } from '@components/ui/label'
import { updateMyPortfolio } from '@services/portfolio/portfolio'
import { updateMyHighlights } from '@services/portfolio/records'
import { SOCIAL_OPTIONS, normalizeSocialInput, shellSocials, socialHandle } from '../PortfolioHeaderParts'
import type { OpenChange } from './parts'
import type { Highlight, SetShell, Shell } from '../portfolioTypes'

import { tr } from '@/lib/tr'
// The editors the new front page opens itself: the highlights band and your links. Who you are is edited in place
// on the header (InlineProfile.tsx, PO-3).

const EXAMPLES: Highlight[] = [{ value: '300+', get label() { return tr('portfolio.portfolio_dialogs.hours_worked', 'hours worked') } }, { value: '3.8', get label() { return tr('portfolio.portfolio_dialogs.gpa', 'GPA') } }, { value: '1st', get label() { return tr('portfolio.portfolio_dialogs.place_regional_art_show', 'place, regional art show') } }]

/** Up to four numbers people notice first. */
export function HighlightsDialog({ open, onOpenChange, shell, setShell, token }: { open: boolean; onOpenChange: OpenChange; shell: Shell; setShell: SetShell; token?: string }) {
  const [rows, setRows] = useState<Highlight[]>(() => shell.highlights?.length ? shell.highlights : [{ value: '', label: '' }])
  const [busy, setBusy] = useState(false)
  const change = (index: number, key: keyof Highlight, value: string) => setRows((current) => current.map((row, at) => at === index ? { ...row, [key]: value } : row))
  async function save() {
    if (!token) return
    const filled = rows.map((row) => ({ value: row.value.trim(), label: row.label.trim() })).filter((row) => row.value || row.label)
    if (filled.some((row) => !row.value || !row.label)) return toast.error(tr('portfolio.portfolio_dialogs.each_highlight_needs_a_number', 'Each highlight needs a number and what it means'))
    setBusy(true)
    try {
      const saved = await updateMyHighlights(filled, token)
      setShell({ ...shell, highlights: saved.highlights })
      onOpenChange(false)
    } catch (error: any) { toast.error(error?.message || tr('portfolio.portfolio_dialogs.could_not_save_your_highlights', 'Could not save your highlights')) } finally { setBusy(false) }
  }
  return <Dialog open={open} onOpenChange={(next) => { if (next) setRows(shell.highlights?.length ? shell.highlights : [{ value: '', label: '' }]); onOpenChange(next) }}>
    <DialogContent className="max-w-lg">
      <DialogHeader><DialogTitle>{tr('portfolio.portfolio_dialogs.highlights', 'Highlights')}</DialogTitle><DialogDescription>{tr('portfolio.portfolio_dialogs.the_numbers_people_notice_first', 'The numbers people notice first, like hours worked, a GPA or a win. Up to four.')}</DialogDescription></DialogHeader>
      <div className="grid gap-2.5">
        {rows.map((row, index) => <div key={index} className="grid grid-cols-[6.5rem_minmax(0,1fr)_auto] items-center gap-2">
          <Input aria-label={tr('portfolio.portfolio_dialogs.highlight_value_number', 'Highlight {{value}} number', { value: index + 1 })} value={row.value} maxLength={24} placeholder={EXAMPLES[index % 3].value} onChange={(event) => change(index, 'value', event.target.value)} className="font-extrabold" />
          <Input aria-label={tr('portfolio.portfolio_dialogs.highlight_value_meaning', 'Highlight {{value}} meaning', { value: index + 1 })} value={row.label} maxLength={60} placeholder={EXAMPLES[index % 3].label} onChange={(event) => change(index, 'label', event.target.value)} />
          <Button type="button" variant="ghost" size="icon" aria-label={tr('portfolio.portfolio_dialogs.remove_highlight_value', 'Remove highlight {{value}}', { value: index + 1 })} onClick={() => setRows((current) => current.filter((_, at) => at !== index))}><Trash2 className="h-4 w-4" /></Button>
        </div>)}
        {rows.length < 4 ? <Button type="button" variant="surface" size="sm" className="w-fit" onClick={() => setRows((current) => [...current, { value: '', label: '' }])}><Plus className="h-4 w-4" />{tr('portfolio.portfolio_dialogs.add_a_highlight', 'Add a highlight')}</Button> : null}
      </div>
      <DialogFooter><Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>{tr('portfolio.connect_request.cancel', 'Cancel')}</Button><Button type="button" variant="brand" onClick={save} disabled={busy}>{busy ? tr('portfolio.portfolio_header_parts.saving', 'Saving…') : tr('portfolio.resume_builder.save', 'Save')}</Button></DialogFooter>
    </DialogContent>
  </Dialog>
}

/** Your links, one per site. */
export function LinksDialog({ open, onOpenChange, shell, setShell, token, mark }: { mark?: string; open: boolean; onOpenChange: OpenChange; shell: Shell; setShell: SetShell; token?: string }) {
  const initial = () => Object.fromEntries(SOCIAL_OPTIONS.map((option) => [option.type, socialHandle(option.type, shellSocials(shell).find((social) => social.type === option.type)?.url || '')]))
  const [values, setValues] = useState<Record<string, string>>(initial)
  const [busy, setBusy] = useState(false)
  async function save() {
    if (!token) return
    setBusy(true)
    try {
      const socials = SOCIAL_OPTIONS.map((option) => ({ type: option.type, url: normalizeSocialInput(option.type, values[option.type] || '') })).filter((social) => social.url)
      setShell(await updateMyPortfolio({ revision: shell.portfolio.revision, socials }, token))
      onOpenChange(false)
    } catch (error: any) { toast.error(error?.message || tr('portfolio.portfolio_dialogs.could_not_save_your_links', 'Could not save your links')) } finally { setBusy(false) }
  }
  return <Dialog open={open} onOpenChange={(next) => { if (next) setValues(initial()); onOpenChange(next) }}>
    <DialogContent className="max-w-lg">
      <DialogHeader><DialogTitle>{tr('portfolio.portfolio_dialogs.your_links', 'Your links')}</DialogTitle><DialogDescription>{tr('portfolio.portfolio_dialogs.a_handle_or_a_link', 'A handle or a link for each. Leave one empty to take it off.')}</DialogDescription></DialogHeader>
      <div className="grid gap-3">{SOCIAL_OPTIONS.map((option) => <div key={option.type} className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-2">
        <Label htmlFor={`ln-${option.type}`}>{option.label}</Label>
        <Input id={`ln-${option.type}`} value={values[option.type] || ''} maxLength={300} onChange={(event) => setValues((current) => ({ ...current, [option.type]: event.target.value }))} placeholder={option.type === 'website' ? 'yourname.com' : tr('portfolio.portfolio_dialogs.handle', '@handle')} />
      </div>)}</div>
      <DialogFooter><Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>{tr('portfolio.connect_request.cancel', 'Cancel')}</Button><Marked mark={mark}><Button type="button" variant="brand" onClick={save} disabled={busy}>{busy ? tr('portfolio.portfolio_header_parts.saving', 'Saving…') : tr('portfolio.resume_builder.save', 'Save')}</Button></Marked></DialogFooter>
    </DialogContent>
  </Dialog>
}
