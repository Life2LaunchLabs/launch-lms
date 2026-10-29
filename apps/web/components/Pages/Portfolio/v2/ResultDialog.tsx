'use client'

import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'

import { Button } from '@components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@components/ui/dialog'
import { Input } from '@components/ui/input'
import { Label } from '@components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@components/ui/select'
import { Switch } from '@components/ui/switch'
import { results as resultsApi } from '@services/portfolio/records'
import type { PortfolioResult } from '../portfolioTypes'
import type { OpenChange } from './parts'

// Adding or changing one of "What I'm like". Results a plan wrote can be hidden or removed here too.

export const RESULT_KINDS = [
  { value: 'interests', label: 'Interests', example: 'Artistic · Social · Investigative' },
  { value: 'strengths', label: 'Strengths', example: 'Curious, patient, a good listener' },
  { value: 'values', label: 'Work values', example: 'Creativity, helping others' },
  { value: 'skills', label: 'Skills', example: 'Spanish, Figma, customer service' },
  { value: 'other', label: 'Something else', example: '' },
] as const

type Draft = { kind: PortfolioResult['kind']; name: string; summary: string; taken_on: string; visible: boolean }

export function ResultDialog({ open, onOpenChange, result, token, onSaved }: { open: boolean; onOpenChange: OpenChange; result?: PortfolioResult | null; token?: string; onSaved: () => void }) {
  const initial = (): Draft => ({ kind: result?.kind || 'interests', name: result?.name || '', summary: result?.summary || '', taken_on: result?.taken_on || '', visible: result ? result.visibility !== 'private' : true })
  const [draft, setDraft] = useState<Draft>(initial)
  const [busy, setBusy] = useState(false)
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((current) => ({ ...current, [key]: value }))
  const kind = RESULT_KINDS.find((item) => item.value === draft.kind)

  async function save() {
    if (!token) return
    const name = draft.name.trim() || kind?.label || ''
    if (!name) return toast.error('Give it a name')
    setBusy(true)
    const payload = { kind: draft.kind, name, summary: draft.summary.trim(), taken_on: draft.taken_on || null, visibility: draft.visible ? 'public' : 'private' }
    try {
      if (result) await resultsApi.update(result.result_uuid, payload, token)
      else await resultsApi.create(payload, token)
      onSaved()
    } catch (error: any) { toast.error(error?.message || 'Could not save this') } finally { setBusy(false) }
  }

  async function remove() {
    if (!token || !result || !window.confirm(`Remove ${result.name}?`)) return
    setBusy(true)
    try { await resultsApi.remove(result.result_uuid, token); onSaved() } catch (error: any) { toast.error(error?.message || 'Could not remove this') } finally { setBusy(false) }
  }

  return <Dialog open={open} onOpenChange={(next) => { if (next) setDraft(initial()); onOpenChange(next) }}>
    <DialogContent className="max-w-lg">
      <DialogHeader><DialogTitle>{result ? result.name : 'Add to What I’m like'}</DialogTitle><DialogDescription>{result && result.source !== 'manual' ? 'This came from an activity you did. You can hide it or change how it reads.' : 'Something a quiz or a person helped you learn about yourself.'}</DialogDescription></DialogHeader>
      <div className="grid gap-4">
        <div className="grid gap-1.5"><Label>What it’s about</Label><Select value={draft.kind} onValueChange={(value) => set('kind', value as Draft['kind'])}><SelectTrigger aria-label="What it’s about"><SelectValue /></SelectTrigger><SelectContent>{RESULT_KINDS.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select></div>
        <div className="grid gap-1.5"><Label htmlFor="rs-name">Name</Label><Input id="rs-name" value={draft.name} maxLength={160} onChange={(event) => set('name', event.target.value)} placeholder={kind?.value === 'interests' ? 'Interest type' : kind?.label} /></div>
        <div className="grid gap-1.5"><Label htmlFor="rs-summary">In a line</Label><Input id="rs-summary" value={draft.summary} maxLength={300} onChange={(event) => set('summary', event.target.value)} placeholder={kind?.example} /></div>
        <div className="grid gap-1.5"><Label htmlFor="rs-taken">When <span className="font-normal text-muted-foreground">(optional)</span></Label><Input id="rs-taken" type="month" value={draft.taken_on} onChange={(event) => set('taken_on', event.target.value)} /></div>
        <label className="flex items-center justify-between gap-3 rounded-2xl bg-muted px-4 py-3"><b className="text-sm font-extrabold">Show to visitors</b><Switch checked={draft.visible} onCheckedChange={(value) => set('visible', value)} aria-label="Show to visitors" /></label>
      </div>
      <DialogFooter className="gap-2 sm:justify-between">
        {result ? <Button type="button" variant="ghost" className="text-red-600" onClick={remove} disabled={busy}><Trash2 className="h-4 w-4" />Remove</Button> : <span />}
        <div className="flex gap-2"><Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button><Button type="button" variant="brand" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</Button></div>
      </DialogFooter>
    </DialogContent>
  </Dialog>
}
