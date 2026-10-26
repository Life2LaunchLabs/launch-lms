'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import { mutate } from 'swr'
import toast from 'react-hot-toast'
import { Camera, Loader2 } from 'lucide-react'
import Modal from '@components/Objects/StyledElements/Modal/Modal'
import { Label } from '@components/ui/label'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { RANGE_LABELS, insightsApi, type Dashboard, type DateRange } from '@services/insights/insights'
import { useInsightsContext } from './shared'

/** Capture: freeze the dashboard as it shows now (these dates, this plan or group), with a note. */
export default function CaptureButton({ dashboard, scopeKey, objectLabel, range, className }: {
  dashboard: Dashboard; scopeKey: string | null; objectLabel: string | null; range: DateRange; className: string
}) {
  const [open, setOpen] = React.useState(false)
  return <>
    <button type="button" onClick={() => setOpen(true)} className={className}><Camera size={14} aria-hidden="true" />Capture</button>
    <Modal isDialogOpen={open} onOpenChange={setOpen} minHeight="no-min" minWidth="sm" dialogTitle="Capture this dashboard"
      dialogDescription="Keeps every card exactly as it shows now, for the record, to print, or to share with a link. The numbers never change after."
      dialogContent={open ? <CaptureForm dashboard={dashboard} scopeKey={scopeKey} objectLabel={objectLabel} range={range} close={() => setOpen(false)} /> : null} />
  </>
}

function CaptureForm({ dashboard, scopeKey, objectLabel, range, close }: { dashboard: Dashboard; scopeKey: string | null; objectLabel: string | null; range: DateRange; close: () => void }) {
  const router = useRouter()
  const { orgId, orgslug, token, ready } = useInsightsContext()
  const [note, setNote] = React.useState('')
  const [saving, setSaving] = React.useState(false)
  const dates = typeof range === 'string' ? RANGE_LABELS[range] : `${range.start} to ${range.end}`
  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setSaving(true)
    try {
      const made = await insightsApi.capture(orgId, dashboard.dashboard_uuid, { key: scopeKey, range, note }, token)
      await mutate((key) => Array.isArray(key) && key[0] === 'insights' && key[2] === 'captures')
      close()
      toast.success('Captured')
      router.push(getUriWithOrg(orgslug, routePaths.org.admin.insightsCapture(made.capture_uuid)))
    } catch (error: any) {
      toast.error(error?.message || "Couldn't capture it")
    } finally {
      setSaving(false)
    }
  }
  return <form onSubmit={submit} className="space-y-4">
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-xl bg-muted px-3 py-2.5 text-[13px]">
      <dt className="text-muted-foreground">Dashboard</dt><dd className="font-semibold">{dashboard.title}</dd>
      {objectLabel ? <><dt className="text-muted-foreground">For</dt><dd className="font-semibold">{objectLabel}</dd></> : null}
      <dt className="text-muted-foreground">Dates</dt><dd className="font-semibold">{dates}</dd>
      <dt className="text-muted-foreground">Cards</dt><dd className="font-semibold">{dashboard.document.cards.length}</dd>
    </dl>
    <div className="space-y-1.5">
      <Label htmlFor="capture-note">Note</Label>
      <textarea id="capture-note" value={note} onChange={(event) => setNote(event.target.value)} maxLength={2000} rows={3}
        placeholder="What is this for? End of term, the board meeting…"
        className="w-full rounded-xl border border-border bg-card px-3 py-2 text-[14px] outline-none focus:border-foreground" />
    </div>
    <p className="text-[12px] text-muted-foreground">It counts the learners you can see. Unsaved edits to the dashboard aren&apos;t included.</p>
    <div className="flex justify-end gap-2">
      <button type="button" onClick={close} className="inline-flex h-10 items-center rounded-full border border-border bg-card px-4 text-sm font-semibold hover:bg-muted">Cancel</button>
      <button type="submit" disabled={saving || !ready} className="inline-flex h-10 items-center gap-1.5 rounded-full bg-foreground px-4 text-sm font-semibold text-background hover:opacity-90 disabled:opacity-60">
        {saving ? <Loader2 size={15} className="animate-spin" /> : null}Capture
      </button>
    </div>
  </form>
}
