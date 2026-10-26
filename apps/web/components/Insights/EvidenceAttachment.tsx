'use client'

import React from 'react'
import { Download } from 'lucide-react'
import type { CaptureAttachment } from '@services/insights/insights'

type Column = { key: string; label: string }
type Row = Record<string, string>

const SHOWN = 25

function csv(columns: Column[], rows: Row[]): string {
  const cell = (value: string) => /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
  return [columns.map((column) => cell(column.label)), ...rows.map((row) => columns.map((column) => cell(row[column.key] || '')))].map((line) => line.join(',')).join('\n')
}

/** Requirement evidence captured with a dashboard: one row per credit, so a requirement two steps credited shows both. */
export default function EvidenceAttachment({ attachment }: { attachment: CaptureAttachment }) {
  const columns = (attachment.columns as Column[] | undefined) || []
  const rows = (attachment.rows as Row[] | undefined) || []
  const [all, setAll] = React.useState(false)
  const learners = new Set(rows.map((row) => row.learner)).size
  const download = () => {
    const url = URL.createObjectURL(new Blob([csv(columns, rows)], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = 'requirement-evidence.csv'
    link.click()
    URL.revokeObjectURL(url)
  }
  if (!rows.length) return <p className="text-[13px] text-muted-foreground">No requirements had been credited for these learners yet.</p>
  return <div className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-[13px] text-muted-foreground">{rows.length} credit{rows.length === 1 ? '' : 's'} for {learners} learner{learners === 1 ? '' : 's'}. Every step that counts is listed, so a requirement two plans credit shows twice.</p>
      <button type="button" onClick={download} className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-card px-3 text-[13px] font-semibold hover:bg-muted print:hidden"><Download size={14} aria-hidden="true" />Download CSV</button>
    </div>
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full min-w-[720px] text-left text-[12.5px]">
        <thead className="bg-muted text-muted-foreground"><tr>{columns.map((column) => <th key={column.key} scope="col" className="px-2.5 py-2 font-semibold">{column.label}</th>)}</tr></thead>
        <tbody className="divide-y divide-border">{(all ? rows : rows.slice(0, SHOWN)).map((row, index) => <tr key={index}>
          {columns.map((column) => <td key={column.key} className="px-2.5 py-1.5 align-top">{row[column.key]}</td>)}
        </tr>)}</tbody>
      </table>
    </div>
    {rows.length > SHOWN ? <button type="button" onClick={() => setAll((current) => !current)} className="text-[13px] font-semibold text-muted-foreground hover:text-foreground hover:underline print:hidden">
      {all ? 'Show fewer' : `Show all ${rows.length}`}
    </button> : null}
  </div>
}
