'use client'

import { useState } from 'react'
import { Camera, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'

import MediaPickerDialog from '@components/Objects/Media/MediaPickerDialog'
import { Button } from '@components/ui/button'
import { useAsk } from '@components/ui/ask-dialog'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@components/ui/dialog'
import { Input } from '@components/ui/input'
import { Label } from '@components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@components/ui/select'
import { Switch } from '@components/ui/switch'
import { normalizeMediaUrl } from '@services/media/media'
import { credentials as credentialsApi } from '@services/portfolio/records'
import type { Credential, Shell } from '../portfolioTypes'
import type { OpenChange } from './parts'

import { tr } from '@/lib/tr'
// Adding or changing a card, certificate, diploma or test score.

const KINDS = [
  { value: 'card', get label() { return tr('portfolio.credential_dialog.card', 'Card') }, get hint() { return tr('portfolio.credential_dialog.food_handler_a_work_permit', 'Food handler, a work permit, a license') } },
  { value: 'certificate', get label() { return tr('portfolio.credential_dialog.certificate', 'Certificate') }, get hint() { return tr('portfolio.credential_dialog.cpr_a_course_a_program', 'CPR, a course, a program') } },
  { value: 'diploma', get label() { return tr('portfolio.credential_dialog.diploma', 'Diploma') }, get hint() { return tr('portfolio.credential_dialog.high_school_or_a_degree', 'High school or a degree, done or on the way') } },
  { value: 'test_score', get label() { return tr('portfolio.credential_dialog.test_score', 'Test score') }, get hint() { return tr('portfolio.credential_dialog.sat_act_ap_private_until', 'SAT, ACT, AP. Private until you show it.') } },
] as const
const NONE = 'none'

type Draft = { kind: Credential['kind']; name: string; issuer: string; issued_on: string; expires_on: string; expected_on: string; score: string; timeline_uuid: string; visible: boolean; photo?: { uuid: string | null; url: string } }

const draftFrom = (item?: Credential | null): Draft => ({ kind: item?.kind || 'card', name: item?.name || '', issuer: item?.issuer || '', issued_on: item?.issued_on || '', expires_on: item?.expires_on || '', expected_on: item?.expected_on || '', score: item?.score || '', timeline_uuid: item?.timeline_uuid || NONE, visible: item ? item.visibility !== 'private' : true })

export function CredentialDialog({ open, onOpenChange, credential, shell, token, userId, onSaved }: { open: boolean; onOpenChange: OpenChange; credential?: Credential | null; shell: Shell; token?: string; userId: number; onSaved: () => void }) {
  const [draft, setDraft] = useState<Draft>(() => draftFrom(credential))
  const [busy, setBusy] = useState(false)
  const ask = useAsk()
  const [picking, setPicking] = useState(false)
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((current) => ({ ...current, [key]: value }))
  const photoUrl = draft.photo ? draft.photo.url : credential?.photo_url ? normalizeMediaUrl(credential.photo_url) : ''
  const diploma = draft.kind === 'diploma'
  const score = draft.kind === 'test_score'

  async function save() {
    if (!token) return
    if (!draft.name.trim()) return toast.error(tr('portfolio.result_dialog.give_it_a_name', 'Give it a name'))
    setBusy(true)
    const payload: Record<string, unknown> = {
      kind: draft.kind, name: draft.name.trim(), issuer: draft.issuer.trim(), score: score ? draft.score.trim() : '',
      issued_on: draft.issued_on || null, expires_on: diploma || score ? null : draft.expires_on || null, expected_on: diploma ? draft.expected_on || null : null,
      timeline_uuid: draft.timeline_uuid === NONE ? null : draft.timeline_uuid,
    }
    // New test scores start private on the server; only send visibility when it's a real choice.
    if (credential || !score) payload.visibility = draft.visible ? 'public' : 'private'
    if (draft.photo) payload.photo_asset_uuid = draft.photo.uuid
    try {
      if (credential) await credentialsApi.update(credential.credential_uuid, payload, token)
      else await credentialsApi.create(payload, token)
      onSaved()
    } catch (error: any) { toast.error(error?.message || tr('portfolio.portfolio_people_page.could_not_save_this', 'Could not save this')) } finally { setBusy(false) }
  }

  async function remove() {
    if (!token || !credential || !(await ask.confirm({ title: tr('portfolio.portfolio_people_page.remove_name', 'Remove {{name}}?', { name: credential.name }), action: 'Remove', danger: true }))) return
    setBusy(true)
    try { await credentialsApi.remove(credential.credential_uuid, token); onSaved() } catch (error: any) { toast.error(error?.message || tr('portfolio.portfolio_people_page.could_not_remove_this', 'Could not remove this')) } finally { setBusy(false) }
  }

  return <>
    {ask.dialog}
    <Dialog open={open} onOpenChange={(next) => { if (next) setDraft(draftFrom(credential)); onOpenChange(next) }}>
      <DialogContent className="max-h-[90dvh] max-w-lg overflow-y-auto">
        <DialogHeader><DialogTitle>{credential ? tr('portfolio.portfolio_projects.edit', 'Edit') : tr('portfolio.portfolio_header_parts.add', 'Add')} {KINDS.find((kind) => kind.value === draft.kind)?.label.toLowerCase()}</DialogTitle><DialogDescription>{tr('portfolio.credential_dialog.something_you_ve_earned_that', 'Something you’ve earned that a school or a boss would want to see.')}</DialogDescription></DialogHeader>
        <div className="grid gap-4">
          <div role="radiogroup" aria-label={tr('portfolio.credential_dialog.what_kind', 'What kind')} className="grid grid-cols-2 gap-2">{KINDS.map((kind) => <button key={kind.value} type="button" role="radio" aria-checked={draft.kind === kind.value} onClick={() => set('kind', kind.value)} className={`rounded-2xl border-2 p-3 text-left transition ${draft.kind === kind.value ? 'border-[var(--org-primary-color)] bg-[color-mix(in_srgb,var(--org-primary-color)_10%,transparent)]' : 'border-border hover:bg-muted'}`}><b className="block text-sm font-extrabold">{kind.label}</b><small className="block text-xs text-muted-foreground">{kind.hint}</small></button>)}</div>
          <div className="grid gap-1.5"><Label htmlFor="cr-name">{tr('portfolio.portfolio_header_parts.name', 'Name')}</Label><Input id="cr-name" value={draft.name} maxLength={200} onChange={(event) => set('name', event.target.value)} placeholder={diploma ? tr('portfolio.credential_dialog.high_school_diploma', 'High school diploma') : score ? tr('portfolio.credential_dialog.sat', 'SAT') : tr('portfolio.credential_dialog.oregon_food_handler_card', 'Oregon Food Handler Card')} /></div>
          <div className="grid gap-1.5"><Label htmlFor="cr-issuer">{diploma ? tr('portfolio.credential_dialog.school', 'School') : tr('portfolio.credential_dialog.who_gave_it', 'Who gave it')} <span className="font-normal text-muted-foreground">{tr('portfolio.ask_quote.optional', '(optional)')}</span></Label><Input id="cr-issuer" value={draft.issuer} maxLength={200} onChange={(event) => set('issuer', event.target.value)} /></div>
          {score ? <div className="grid gap-1.5"><Label htmlFor="cr-score">{tr('portfolio.credential_dialog.score', 'Score')}</Label><Input id="cr-score" value={draft.score} maxLength={120} onChange={(event) => set('score', event.target.value)} placeholder="1280" /></div> : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5"><Label htmlFor="cr-issued">{diploma ? tr('portfolio.credential_dialog.finished', 'Finished') : score ? tr('portfolio.credential_dialog.taken', 'Taken') : tr('portfolio.credential_dialog.earned', 'Earned')} <span className="font-normal text-muted-foreground">{tr('portfolio.credential_dialog.month', '(month)')}</span></Label><Input id="cr-issued" type="month" value={draft.issued_on} onChange={(event) => set('issued_on', event.target.value)} /></div>
            {diploma ? <div className="grid gap-1.5"><Label htmlFor="cr-expected">{tr('portfolio.credential_dialog.expected', 'Expected')}{' '}<span className="font-normal text-muted-foreground">{tr('portfolio.credential_dialog.if_not_yet', '(if not yet)')}</span></Label><Input id="cr-expected" type="month" value={draft.expected_on} onChange={(event) => set('expected_on', event.target.value)} /></div>
              : !score ? <div className="grid gap-1.5"><Label htmlFor="cr-expires">{tr('portfolio.credential_dialog.expires', 'Expires')}{' '}<span className="font-normal text-muted-foreground">{tr('portfolio.ask_quote.optional', '(optional)')}</span></Label><Input id="cr-expires" type="month" value={draft.expires_on} onChange={(event) => set('expires_on', event.target.value)} /></div> : null}
          </div>
          {shell.timeline?.length ? <div className="grid gap-1.5"><Label>{tr('portfolio.credential_dialog.goes_with', 'Goes with')}{' '}<span className="font-normal text-muted-foreground">{tr('portfolio.ask_quote.optional', '(optional)')}</span></Label><Select value={draft.timeline_uuid} onValueChange={(value) => set('timeline_uuid', value)}><SelectTrigger aria-label={tr('portfolio.credential_dialog.goes_with', 'Goes with')}><SelectValue /></SelectTrigger><SelectContent><SelectItem value={NONE}>{tr('portfolio.credential_dialog.nothing_in_particular', 'Nothing in particular')}</SelectItem>{shell.timeline.map((entry) => <SelectItem key={entry.timeline_uuid} value={entry.timeline_uuid}>{[entry.title, entry.organization].filter(Boolean).join(', ')}</SelectItem>)}</SelectContent></Select></div> : null}
          <div className="grid gap-1.5"><span className="text-sm font-medium">{tr('portfolio.credential_dialog.photo', 'Photo')}{' '}<span className="font-normal text-muted-foreground">{tr('portfolio.credential_dialog.a_photo_of_the_card', '(a photo of the card counts as proof)')}</span></span>
            <div className="flex items-center gap-3">
              {photoUrl ? <img src={photoUrl} alt="" className="aspect-[1.586] w-28 rounded-[10px] object-cover" /> : null}
              <Button type="button" variant="surface" size="sm" onClick={() => setPicking(true)}><Camera className="h-4 w-4" />{photoUrl ? tr('portfolio.month_date_range_field.change', 'Change') : tr('portfolio.inplace.add_a_photo', 'Add a photo')}</Button>
              {photoUrl ? <Button type="button" variant="ghost" size="sm" onClick={() => set('photo', { uuid: null, url: '' })}>{tr('portfolio.month_date_range_field.remove', 'Remove')}</Button> : null}
            </div>
          </div>
          <label className="flex items-center justify-between gap-3 rounded-2xl bg-muted px-4 py-3"><span><b className="block text-sm font-extrabold">{tr('portfolio.result_dialog.show_to_visitors', 'Show to visitors')}</b><small className="block text-xs text-muted-foreground">{tr('portfolio.credential_dialog.off_keeps_it_for_you', 'Off keeps it for you and your résumé choices.')}</small></span><Switch checked={credential || !score ? draft.visible : false} onCheckedChange={(value) => set('visible', value)} disabled={!credential && score} aria-label={tr('portfolio.result_dialog.show_to_visitors', 'Show to visitors')} /></label>
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          {credential ? <Button type="button" variant="ghost" className="text-red-600" onClick={remove} disabled={busy}><Trash2 className="h-4 w-4" />{tr('portfolio.month_date_range_field.remove', 'Remove')}</Button> : <span />}
          <div className="flex gap-2"><Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>{tr('portfolio.connect_request.cancel', 'Cancel')}</Button><Button type="button" variant="brand" onClick={save} disabled={busy}>{busy ? tr('portfolio.portfolio_header_parts.saving', 'Saving…') : tr('portfolio.resume_builder.save', 'Save')}</Button></div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <MediaPickerDialog open={picking} onOpenChange={setPicking} title={tr('portfolio.credential_dialog.photo', 'Photo')} description={tr('portfolio.credential_dialog.upload_a_photo_or_choose', 'Upload a photo or choose one from your media library.')} owner={{ type: 'user', id: userId }} mediaType="image" accessToken={token} onSave={(asset) => { set('photo', { uuid: asset.asset_uuid, url: normalizeMediaUrl(asset.url) || asset.url }); setPicking(false) }} />
  </>
}
