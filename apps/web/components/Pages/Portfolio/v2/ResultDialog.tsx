'use client'

import { useState } from 'react'
import { ArrowLeft, ChevronRight, ExternalLink, FileText, Paperclip, Trash2, X } from 'lucide-react'
import toast from 'react-hot-toast'

import { useLHSession } from '@components/Contexts/LHSessionContext'
import MediaPickerDialog from '@components/Objects/Media/MediaPickerDialog'
import { Button } from '@components/ui/button'
import { useAsk } from '@components/ui/ask-dialog'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@components/ui/dialog'
import { Input } from '@components/ui/input'
import { Label } from '@components/ui/label'
import { Switch } from '@components/ui/switch'
import { normalizeMediaUrl } from '@services/media/media'
import { results as resultsApi } from '@services/portfolio/records'
import type { PortfolioResult } from '../portfolioTypes'
import type { OpenChange } from './parts'
import type { Setter } from './inplace'
import { ResultPicture } from './ResultView'
import { RESULT_TEMPLATES, filled, summaryFor, templateOf, type ResultTemplate } from './resultTemplates'

// Adding or changing one of "What I'm like". A result follows one of the known assessments (pick it, then
// set the sliders, the type or the top picks, and attach the PDF if there is one), or is "something else":
// a name and a line. Skills are a list. Results a plan wrote can be hidden or removed here too.

export const RESULT_KINDS = [
  { value: 'interests', label: 'Interests', example: 'Artistic · Social · Investigative' },
  { value: 'personality', label: 'Personality', example: 'INFJ' },
  { value: 'strengths', label: 'Strengths', example: 'Curious, patient, a good listener' },
  { value: 'values', label: 'Work values', example: 'Creativity, helping others' },
  { value: 'skills', label: 'Skills', example: 'Spanish, Figma, customer service' },
  { value: 'other', label: 'Something else', example: '' },
] as const

type Draft = { kind: PortfolioResult['kind']; name: string; summary: string; taken_on: string; visible: boolean; data: Record<string, any> }
type Step = { template?: ResultTemplate; custom?: PortfolioResult['kind'] } | null

/** The form for one assessment: sliders, a type to tap, or picks in order. */
function TemplateFields({ template, data, setData }: { template: ResultTemplate; data: Record<string, any>; setData: Setter<Record<string, any>> }) {
  if (template.input === 'scores') {
    const max = Number(data.max || template.max)
    return <div className="grid gap-2.5">{template.scores.map((item) => { const value = Number(data.scores?.[item.key] || 0); return <label key={item.key} className="grid grid-cols-[minmax(0,8.5rem)_minmax(0,1fr)_2.5rem] items-center gap-3 text-sm font-bold">
      <span className="truncate">{item.label}</span>
      <input type="range" min={0} max={max} value={value} aria-label={item.label} onChange={(event) => setData({ ...data, max, scores: { ...data.scores, [item.key]: Number(event.target.value) } })} className="w-full accent-[#8B5CF6]" />
      <span className="text-right tabular-nums text-muted-foreground">{value}</span>
    </label> })}<p className="text-xs text-muted-foreground">Copy your scores from your results. Each one goes from 0 to {max}.</p></div>
  }
  if (template.input === 'type') return <div role="radiogroup" aria-label={template.name} className="grid grid-cols-4 gap-1.5 sm:grid-cols-4">{template.options.map((option) => <button key={option.value} type="button" role="radio" aria-checked={data.type === option.value} onClick={() => setData({ ...data, type: option.value })} className={`h-10 truncate rounded-xl border-2 px-2 text-[13px] font-extrabold ${data.type === option.value ? 'border-[#6539D8] bg-[#8B5CF6] text-white' : 'border-border bg-card'} ${template.id === 'enneagram' ? 'col-span-2 text-left' : ''}`}>{option.label}</button>)}</div>
  const top: string[] = data.top || []
  return <div className="grid gap-2">
    <p className="text-xs font-bold text-muted-foreground">{top.length < template.count ? `Tap your top ${template.count} in order (${top.length} of ${template.count})` : 'Tap one to take it off.'}</p>
    <div className="flex max-h-56 flex-wrap gap-1.5 overflow-y-auto">{template.options.map((option) => { const at = top.indexOf(option); return <button key={option} type="button" aria-pressed={at >= 0} disabled={at < 0 && top.length >= template.count} onClick={() => setData({ ...data, top: at >= 0 ? top.filter((item) => item !== option) : [...top, option] })} className={`inline-flex h-8 items-center gap-1 rounded-full border-2 px-2.5 text-[12.5px] font-bold disabled:opacity-40 ${at >= 0 ? 'border-[#6539D8] bg-[#8B5CF6] text-white' : 'border-border bg-card'}`}>{at >= 0 ? <b>{at + 1}</b> : null}{option}</button> })}</div>
  </div>
}

export function ResultDialog({ open, onOpenChange, result, kind: startKind, token, onSaved }: { open: boolean; onOpenChange: OpenChange; result?: PortfolioResult | null; kind?: PortfolioResult['kind']; token?: string; onSaved: () => void }) {
  const session = useLHSession() as any
  const userId = Number(session?.data?.user?.id || 0)
  const firstStep = (): Step => result ? (templateOf(result) ? { template: templateOf(result) } : { custom: result.kind }) : startKind ? { custom: startKind } : null
  const initial = (): Draft => ({ kind: result?.kind || startKind || 'interests', name: result?.name || '', summary: result?.summary || '', taken_on: result?.taken_on || '', visible: result ? result.visibility !== 'private' : true, data: result?.data || {} })
  const [step, setStep] = useState<Step>(firstStep)
  const [draft, setDraft] = useState<Draft>(initial)
  const [busy, setBusy] = useState(false)
  const [picker, setPicker] = useState(false)
  const ask = useAsk()
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((current) => ({ ...current, [key]: value }))
  const template = step?.template
  const kind = RESULT_KINDS.find((item) => item.value === draft.kind)
  const pdf = draft.data.pdf as { asset_uuid: string; url: string; title?: string } | undefined

  function choose(next: ResultTemplate) { setStep({ template: next }); setDraft((current) => ({ ...current, kind: next.kind, name: next.name, data: { ...current.data, template: next.id } })) }

  async function save() {
    if (!token) return
    if (template && !filled(template, draft.data)) return toast.error(template.input === 'pick' ? `Pick your top ${template.count}` : template.input === 'type' ? 'Pick your type' : 'Set at least one score')
    const name = draft.name.trim() || template?.name || kind?.label || ''
    if (!name) return toast.error('Give it a name')
    setBusy(true)
    const payload = { kind: template?.kind || draft.kind, name, summary: template ? summaryFor(template, draft.data) : draft.summary.trim(), data: template ? draft.data : { ...draft.data, template: undefined }, taken_on: draft.taken_on || null, visibility: draft.visible ? 'public' : 'private' }
    try {
      if (result) await resultsApi.update(result.result_uuid, payload, token)
      else await resultsApi.create(payload, token)
      onSaved()
    } catch (error: any) { toast.error(error?.message || 'Could not save this') } finally { setBusy(false) }
  }

  async function remove() {
    if (!token || !result || !(await ask.confirm({ title: `Remove ${result.name}?`, action: 'Remove', danger: true }))) return
    setBusy(true)
    try { await resultsApi.remove(result.result_uuid, token); onSaved() } catch (error: any) { toast.error(error?.message || 'Could not remove this') } finally { setBusy(false) }
  }

  const back = !result && step ? <button type="button" onClick={() => setStep(null)} className="mb-1 inline-flex w-fit items-center gap-1 text-sm font-bold text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" />All results</button> : null
  const title = result ? result.name : template ? template.name : step ? (kind?.value === 'skills' ? 'Your skills' : 'Something else') : 'Add a result'
  const description = !step ? 'Pick the test you took. You’ll copy your result in, and can add the PDF too.' : template ? template.blurb : draft.kind === 'skills' ? 'Things you can do. Separate them with commas; each one counts.' : 'Something a quiz or a person helped you learn about yourself.'

  return <Dialog open={open} onOpenChange={(next) => { if (next) { setDraft(initial()); setStep(firstStep()) } onOpenChange(next) }}>
    {ask.dialog}
    <DialogContent className="max-h-[92dvh] max-w-lg overflow-y-auto">
      <DialogHeader>{back}<DialogTitle>{title}</DialogTitle><DialogDescription>{description}</DialogDescription></DialogHeader>
      {!step ? <div className="grid gap-2">
        {RESULT_TEMPLATES.map((item) => <button key={item.id} type="button" onClick={() => choose(item)} className="flex items-center gap-3 rounded-2xl border-2 border-border bg-card p-3 text-left hover:border-[#8B5CF6]"><span className="min-w-0 flex-1"><b className="block text-[15px] font-extrabold">{item.name}</b><small className="block text-[13px] font-semibold text-muted-foreground">{item.blurb}</small></span><ChevronRight className="h-5 w-5 text-muted-foreground" /></button>)}
        <button type="button" onClick={() => { setStep({ custom: 'other' }); set('kind', 'other') }} className="rounded-2xl border-2 border-dashed border-border p-3 text-left text-[14px] font-bold text-muted-foreground hover:text-foreground">Something else: a name and a line</button>
      </div> : <div className="grid gap-4">
        {template ? <>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] font-bold"><span className="text-muted-foreground">Haven’t taken it?</span>{template.take.map((place) => <a key={place.url} href={place.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[#6539D8] hover:underline dark:text-[#b9a2ff]">{place.label}<span className="text-muted-foreground">({place.free ? 'free' : 'paid'})</span><ExternalLink className="h-3.5 w-3.5" /></a>)}</div>
          <TemplateFields template={template} data={draft.data} setData={(data) => set('data', data)} />
          {filled(template, draft.data) ? <div className="grid justify-items-center gap-2 rounded-2xl bg-muted/60 p-4 text-foreground"><ResultPicture result={{ data: draft.data }} /><b className="text-center text-[15px] font-extrabold">{summaryFor(template, draft.data)}</b></div> : null}
        </> : <>
          <div className="grid gap-1.5"><Label htmlFor="rs-name">Name</Label><Input id="rs-name" value={draft.name} maxLength={160} onChange={(event) => set('name', event.target.value)} placeholder={kind?.label} /></div>
          <div className="grid gap-1.5"><Label htmlFor="rs-summary">In a line</Label><Input id="rs-summary" value={draft.summary} maxLength={300} onChange={(event) => set('summary', event.target.value)} placeholder={kind?.example} /></div>
        </>}
        <div className="grid gap-1.5"><Label htmlFor="rs-taken">When <span className="font-normal text-muted-foreground">(optional)</span></Label><Input id="rs-taken" type="month" value={draft.taken_on} onChange={(event) => set('taken_on', event.target.value)} /></div>
        {draft.kind !== 'skills' ? <div className="grid gap-1.5"><Label>The report <span className="font-normal text-muted-foreground">(optional, only you see it)</span></Label>
          {pdf ? <div className="flex items-center gap-2 rounded-xl border-2 border-border p-2.5 text-sm font-bold"><FileText className="h-4 w-4 shrink-0" /><a href={normalizeMediaUrl(pdf.url)} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate hover:underline">{pdf.title || 'Your report'}</a><button type="button" aria-label="Remove the report" onClick={() => set('data', { ...draft.data, pdf: undefined })} className="grid h-7 w-7 place-items-center rounded-full hover:bg-muted"><X className="h-4 w-4" /></button></div>
            : <Button type="button" variant="surface" size="sm" className="w-fit" onClick={() => setPicker(true)}><Paperclip className="h-4 w-4" />Attach the PDF</Button>}
        </div> : null}
        <label className="flex items-center justify-between gap-3 rounded-2xl bg-muted px-4 py-3"><b className="text-sm font-extrabold">Show to visitors</b><Switch checked={draft.visible} onCheckedChange={(value) => set('visible', value)} aria-label="Show to visitors" /></label>
      </div>}
      {step ? <DialogFooter className="gap-2 sm:justify-between">
        {result ? <Button type="button" variant="ghost" className="text-red-600" onClick={remove} disabled={busy}><Trash2 className="h-4 w-4" />Remove</Button> : <span />}
        <div className="flex gap-2"><Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button><Button type="button" variant="brand" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</Button></div>
      </DialogFooter> : null}
      <MediaPickerDialog open={picker} onOpenChange={setPicker} title="Your report" description="Upload the PDF of your results." owner={{ type: 'user', id: userId }} mediaType="document" accessToken={token} onSave={(asset) => { set('data', { ...draft.data, pdf: { asset_uuid: asset.asset_uuid, url: asset.url, title: asset.title } }); setPicker(false) }} />
    </DialogContent>
  </Dialog>
}
