'use client'

import React from 'react'
import { isCardError, type CaptureAttachment, type CardOutcome, type DashboardCard } from '@services/insights/insights'
import EvidenceAttachment from './EvidenceAttachment'
import InsightCard from './InsightCard'

// A capture's cards as they were: the stored results, drawn by the same cards, with nothing to click into
// (the people behind a number today aren't the ones it counted then).

const noDrill = () => {}
const noLink = () => null

/** The results without drill keys or links, so every chart draws them as plain marks. */
export function frozen(outcome: CardOutcome | undefined): CardOutcome | undefined {
  if (!outcome || isCardError(outcome)) return outcome
  const plain = <T extends object>(cell: T): T => ({ ...cell, drill: null, ...('link' in cell ? { link: null } : {}) })
  return {
    ...outcome, drill: null, value: plain(outcome.value), more: outcome.more ? plain(outcome.more) : null,
    rows: outcome.rows.map((row) => ({ ...plain(row), cells: row.cells?.map(plain) })),
    series: outcome.series ? { ...outcome.series, points: outcome.series.points.map(plain) } : null,
  }
}

export default function CapturedCards({ cards, results }: { cards: DashboardCard[]; results: Record<string, CardOutcome> }) {
  if (!cards.length) return <p className="rounded-2xl bg-muted px-4 py-10 text-center text-sm text-muted-foreground">This dashboard had no cards when it was captured.</p>
  return <div className="grid grid-cols-12 gap-4">
    {cards.map((card) => <InsightCard key={card.key} card={card} outcome={frozen(results[card.key])} drill={noDrill} linkFor={noLink} />)}
  </div>
}

const fmtDay = (iso: string, year = true) => new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: year ? 'numeric' : undefined, timeZone: 'UTC' })

/** "Aug 1 – Oct 26, 2026", or "Up to Oct 26, 2026" for all time. */
export function rangeText(range: { start: string | null; end: string }) {
  if (!range.start) return `Up to ${fmtDay(range.end)}`
  return `${fmtDay(range.start, range.start.slice(0, 4) !== range.end.slice(0, 4))} – ${fmtDay(range.end)}`
}

export const capturedOn = (iso: string) => new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })

/**
 * Material captured with the dashboard. Each kind can register how it reads (`ATTACHMENT_VIEWS`); any other
 * kind shows its name and how many rows it holds.
 */
export const ATTACHMENT_VIEWS: Record<string, React.ComponentType<{ attachment: CaptureAttachment }>> = {
  requirement_evidence: EvidenceAttachment,
}

export function Attachments({ attachments }: { attachments: CaptureAttachment[] }) {
  if (!attachments.length) return null
  return <section className="space-y-3" aria-label="Captured with it">
    {attachments.map((attachment, index) => {
      const View = ATTACHMENT_VIEWS[attachment.kind]
      return <div key={`${attachment.kind}-${index}`} className="rounded-[18px] border border-border bg-card p-4 nice-shadow">
        <h2 className="mb-2 text-[15px] font-bold">{attachment.label || attachment.kind}</h2>
        {View ? <View attachment={attachment} /> : <p className="text-[13px] text-muted-foreground">
          {Array.isArray(attachment.rows) ? `${attachment.rows.length} row${attachment.rows.length === 1 ? '' : 's'}` : 'Captured with this dashboard.'}
        </p>}
      </div>
    })}
  </section>
}
