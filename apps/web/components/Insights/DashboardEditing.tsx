'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import { mutate } from 'swr'
import toast from 'react-hot-toast'
import { ArrowLeft, ArrowRight, Check, Loader2, Pencil, Plus, Trash2 } from 'lucide-react'
import { VISIBILITY_LABELS, insightKeys, insightsApi, type Dashboard, type DashboardCard, type Visibility } from '@services/insights/insights'
import { cn } from '@/lib/utils'
import { spanClass } from './InsightCard'
import { dashboardHref } from './NewDashboardModal'
import { SIZES } from './CardEditor'
import { useInsightsContext } from './shared'

// Editing a dashboard: its cards move, resize, change and go in a local draft, and Done saves the whole
// document at the revision it was opened at. Someone who can't save over it gets their own copy instead.

export type EditDraft = { cards: DashboardCard[]; title: string; description: string; visibility: Visibility; revision: number; stale?: string }

export const draftFrom = (dashboard: Dashboard): EditDraft => ({
  cards: dashboard.document.cards, title: dashboard.title, description: dashboard.description, visibility: dashboard.visibility, revision: dashboard.revision,
})

export function moveCard(cards: DashboardCard[], key: string, by: number): DashboardCard[] {
  const from = cards.findIndex((card) => card.key === key)
  const to = from + by
  if (from < 0 || to < 0 || to >= cards.length) return cards
  const next = [...cards]
  const [card] = next.splice(from, 1)
  next.splice(to, 0, card)
  return next
}

/** The bar that replaces the date bar while editing: name, who sees it, Cancel and Done. */
export function EditBar({ dashboard, draft, setDraft, onDone }: { dashboard: Dashboard; draft: EditDraft; setDraft: (draft: EditDraft | null) => void; onDone: () => void }) { // eslint-disable-line no-unused-vars
  const router = useRouter()
  const { orgId, orgslug, token } = useInsightsContext()
  const [saving, setSaving] = React.useState(false)
  const save = async () => {
    setSaving(true)
    try {
      const saved = await insightsApi.save(orgId, dashboard.dashboard_uuid, {
        // A copy keeps the API's "(my copy)" name unless it was renamed.
        revision: draft.revision, title: dashboard.editable || draft.title !== dashboard.title ? draft.title : undefined, description: draft.description,
        visibility: dashboard.editable && draft.visibility !== dashboard.visibility ? draft.visibility : undefined,
        document: { cards: draft.cards, range: dashboard.document.range },
      }, token)
      await mutate(insightKeys.dashboards(orgId))
      if (saved.copied) {
        toast.success('Saved as your own copy')
        router.push(dashboardHref(orgslug, saved.scope, saved.dashboard_uuid))
      } else {
        await mutate(insightKeys.dashboard(orgId, dashboard.dashboard_uuid), saved, { revalidate: false })
      }
      onDone()
    } catch (error: any) {
      if (error?.status === 409 && error.detail?.current) {
        // Keep this draft; the next Done saves over the newer version, and Cancel shows it.
        setDraft({ ...draft, revision: error.detail.current.revision, stale: error.detail.message })
      } else {
        toast.error(error?.message || "Couldn't save the dashboard")
      }
    } finally {
      setSaving(false)
    }
  }
  return <div className="space-y-2 rounded-2xl border border-foreground/15 bg-card p-3 nice-shadow">
    <div className="flex flex-wrap items-center gap-2">
      <label className="min-w-[220px] flex-1">
        <span className="sr-only">Dashboard name</span>
        <input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} maxLength={120} aria-label="Dashboard name"
          className="h-9 w-full rounded-xl border border-border bg-card px-3 text-[14px] font-bold" />
      </label>
      {dashboard.editable ? <div className="inline-flex rounded-full border border-border bg-card p-0.5" role="group" aria-label="Who sees it">
        {(Object.keys(VISIBILITY_LABELS) as Visibility[]).map((key) => <button key={key} type="button" onClick={() => setDraft({ ...draft, visibility: key })} aria-pressed={draft.visibility === key}
          className={cn('h-8 rounded-full px-3 text-[13px] font-semibold', draft.visibility === key ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground')}>{VISIBILITY_LABELS[key]}</button>)}
      </div> : null}
      <button type="button" onClick={() => { if (draft.stale) mutate(insightKeys.dashboard(orgId, dashboard.dashboard_uuid)); setDraft(null) }} className="inline-flex h-9 items-center rounded-full border border-border bg-card px-3.5 text-[13px] font-semibold hover:bg-muted">Cancel</button>
      <button type="button" onClick={save} disabled={saving} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-foreground px-3.5 text-[13px] font-semibold text-background disabled:opacity-60">
        {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}{dashboard.editable ? 'Done' : 'Save as my copy'}
      </button>
    </div>
    <input value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} maxLength={500} aria-label="Description" placeholder="What is this dashboard for?"
      className="h-8 w-full rounded-lg bg-transparent px-1 text-[13px] text-muted-foreground outline-none focus:bg-muted" />
    <p className={cn('px-1 text-[12.5px]', draft.stale ? 'font-semibold text-amber-700' : 'text-muted-foreground')}>
      {draft.stale ? `${draft.stale}. Done saves your version over theirs; Cancel shows theirs.`
        : dashboard.editable ? 'Move, resize, change or remove cards, then Done.' : 'This dashboard isn’t yours, so saving makes your own copy and leaves it as it is.'}
    </p>
  </div>
}

/** The controls laid over a card while editing. */
export function CardControls({ card, index, count, onMove, onSize, onEdit, onRemove }: {
  card: DashboardCard; index: number; count: number
  onMove: (by: number) => void; onSize: (span: number) => void; onEdit: () => void; onRemove: () => void // eslint-disable-line no-unused-vars
}) {
  const icon = 'inline-flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30'
  return <div className="flex flex-wrap items-center gap-1 rounded-xl border border-border bg-card px-1.5 py-1 shadow-sm">
    <button type="button" className={icon} onClick={() => onMove(-1)} disabled={index === 0} aria-label="Move earlier"><ArrowLeft size={14} /></button>
    <button type="button" className={icon} onClick={() => onMove(1)} disabled={index === count - 1} aria-label="Move later"><ArrowRight size={14} /></button>
    <select aria-label="Card size" value={SIZES.some((size) => size.span === card.span) ? card.span : 6} onChange={(event) => onSize(Number(event.target.value))}
      className="h-7 rounded-full border border-border bg-card px-2 text-[12px] font-semibold">
      {SIZES.map((size) => <option key={size.span} value={size.span}>{size.label}</option>)}
    </select>
    <span className="flex-1" />
    <button type="button" className={icon} onClick={onEdit} aria-label="Edit card"><Pencil size={14} /></button>
    <button type="button" className={icon} onClick={onRemove} aria-label="Remove card"><Trash2 size={14} /></button>
  </div>
}

export function AddCardTile({ onClick }: { onClick: () => void }) {
  return <button type="button" onClick={onClick} className={cn(spanClass(12), 'flex min-h-[96px] items-center justify-center gap-2 rounded-[18px] border-[1.5px] border-dashed border-border text-[14px] font-bold text-muted-foreground hover:bg-card hover:text-foreground')}>
    <Plus size={16} aria-hidden="true" />Add a card<span className="font-medium">from the question library, or blank</span>
  </button>
}
