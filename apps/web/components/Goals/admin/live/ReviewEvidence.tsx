'use client'

import React from 'react'
import DOMPurify from 'dompurify'
import { CheckCircle2, Download, ExternalLink, FileText } from 'lucide-react'
import type { ReviewEntry, ReviewItem } from '@services/goals/admin'
import { cn } from '@/lib/utils'
import { personName } from './ui'

const isPdf = (entry: ReviewEntry) => String(entry.mime_type || '').includes('pdf') || /\.pdf($|\?)/i.test(entry.url || entry.filename || '')
const isImage = (entry: ReviewEntry) => String(entry.mime_type || '').startsWith('image') || /\.(png|jpe?g|gif|webp|avif)($|\?)/i.test(entry.url || '')
const isVideo = (entry: ReviewEntry) => String(entry.mime_type || '').startsWith('video') || /\.(mp4|webm|mov)($|\?)/i.test(entry.url || '')

type Part = { key: string; title: string; render: () => React.ReactNode; url?: string }

/** What the learner handed in for a step: files one at a time, their writing, links, list items or their choice. */
export default function ReviewEvidence({ item, confirmOnly }: { item: ReviewItem; confirmOnly: boolean }) {
  const parts = React.useMemo(() => evidenceParts(item), [item])
  const [active, setActive] = React.useState(0)
  if (confirmOnly || !parts.length) return <div className="flex h-full items-center justify-center p-8"><div className="max-w-sm rounded-xl bg-white p-6 text-center"><CheckCircle2 className="mx-auto text-gray-300" size={32} /><p className="mt-3 text-sm font-black text-gray-900">Nothing to hand in</p><p className="mt-1 text-xs leading-5 text-gray-500">{confirmOnly ? `Confirm this step if ${personName(item.user)} did it.` : `${personName(item.user)} marked this done. Approve it if they did it.`}</p></div></div>
  const part = parts[Math.min(active, parts.length - 1)]
  return <div className="flex h-full min-h-[420px] flex-col">
    <div className="flex min-h-11 flex-wrap items-center gap-2 border-b border-gray-200 bg-white px-3 py-1.5 text-xs">
      {parts.length > 1 ? parts.map((entry, index) => <button key={entry.key} type="button" onClick={() => setActive(index)} className={cn('max-w-48 truncate rounded-md px-2.5 py-1.5 font-semibold', index === active ? 'bg-black text-white' : 'text-gray-600 hover:bg-gray-100')}>{entry.title}</button>) : <span className="px-1 font-bold text-gray-900">{part.title}</span>}
      <span className="flex-1" />
      {part.url ? <a href={part.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-bold text-gray-900 hover:text-blue-700"><Download size={13} />Open</a> : null}
    </div>
    <div className="min-h-0 flex-1 overflow-auto p-4">{part.render()}</div>
  </div>
}

function evidenceParts(item: ReviewItem): Part[] {
  const parts: Part[] = []
  for (const entry of item.entries.filter((row) => row.kind === 'file')) {
    parts.push({ key: entry.entry_uuid, title: entry.title || entry.filename || entry.slot || 'File', url: entry.url, render: () => <FileView entry={entry} /> })
  }
  const links = item.entries.filter((row) => row.kind === 'link')
  if (links.length) parts.push({ key: 'links', title: links.length === 1 ? 'Link' : `${links.length} links`, render: () => <ul className="mx-auto max-w-2xl space-y-2">{links.map((link) => <li key={link.entry_uuid}><a href={link.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 rounded-xl bg-white p-4 text-sm font-bold text-blue-700"><ExternalLink size={14} /><span className="truncate">{link.title || link.url}</span></a></li>)}</ul> })
  const items = item.entries.filter((row) => row.kind === 'item')
  if (items.length) parts.push({ key: 'items', title: 'List', render: () => <ul className="mx-auto max-w-2xl space-y-1.5">{items.map((row) => <li key={row.entry_uuid} className="flex items-center gap-2 rounded-lg bg-white px-4 py-3 text-sm"><span className={cn('h-2.5 w-2.5 rounded-full', row.done ? 'bg-green-600' : 'bg-gray-300')} />{row.url ? <a href={row.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-blue-700">{row.title || row.url}</a> : <span>{row.title}</span>}{row.note ? <span className="text-xs text-gray-500">{row.note}</span> : null}</li>)}</ul> })
  const text = item.answer || (item.result?.kind === 'text' ? item.result.text : '') || String(item.submission?.text || '')
  if (text) parts.push({ key: 'text', title: 'Writing', render: () => <article className="mx-auto max-w-2xl rounded-xl bg-white p-7 text-[15px] leading-7 text-gray-900">{text.includes('<') ? <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(text) }} /> : <p className="whitespace-pre-wrap">{text}</p>}</article> })
  if (item.result?.kind === 'choice') {
    const choice = item.result
    parts.push({ key: 'choice', title: 'Choice', render: () => <div className="mx-auto max-w-xl rounded-xl bg-white p-6"><p className="text-sm font-black">{choice.choices.join(', ') || 'No choice yet'}</p>{choice.reason ? <p className="mt-2 whitespace-pre-wrap text-sm text-gray-700">{choice.reason}</p> : null}</div> })
  }
  if (item.result?.kind === 'rsvp') {
    const rsvp = item.result.rsvp
    parts.push({ key: 'rsvp', title: 'RSVP', render: () => <div className="mx-auto max-w-md rounded-xl bg-white p-6 text-center text-sm font-bold">Replied “{rsvp}”</div> })
  }
  return parts
}

function FileView({ entry }: { entry: ReviewEntry }) {
  if (!entry.url) return <div className="mx-auto max-w-md rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center text-xs text-gray-500">Nothing handed in here.</div>
  if (isPdf(entry)) return <iframe title={entry.title || entry.filename || 'Submitted document'} src={entry.url} className="h-full min-h-[560px] w-full rounded-md bg-white shadow" />
  if (isImage(entry)) return <img src={entry.url} alt={entry.title || 'Submitted image'} className="mx-auto max-h-[75vh] rounded-md bg-white object-contain shadow" />
  if (isVideo(entry)) return <video src={entry.url} controls className="mx-auto max-h-[75vh] w-full rounded-md bg-black" />
  return <div className="mx-auto max-w-md rounded-xl bg-white p-6 text-center"><FileText className="mx-auto text-gray-400" size={30} /><p className="mt-2 text-sm font-bold">{entry.title || entry.filename || 'Submitted file'}</p><a href={entry.url} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-blue-700"><Download size={13} />Download</a></div>
}
