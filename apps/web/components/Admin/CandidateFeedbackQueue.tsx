'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Megaphone, NotePencil, PaperPlaneTilt, Trash } from '@phosphor-icons/react'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { Badge } from '@components/ui/badge'
import { Button } from '@components/ui/button'
import { Input } from '@components/ui/input'
import { Textarea } from '@components/ui/textarea'
import { Alert, AlertDescription } from '@components/ui/alert'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@components/ui/select'
import {
  CandidateAnnouncement, CandidateFeedback, JiraColumn, JiraPriority, candidateAttachmentUrl,
  createCandidateAnnouncement, deleteCandidateAnnouncement, getCandidateAnnouncements,
  getCandidateFeedback, getCandidateWorkflow, replyToCandidateFeedback, updateCandidateFeedback,
} from '@services/candidate/candidate'

export default function CandidateFeedbackQueue() {
  const session = useLHSession() as any
  const token = session?.data?.tokens?.access_token as string | undefined
  const [items, setItems] = useState<CandidateFeedback[]>([])
  const [columns, setColumns] = useState<JiraColumn[]>([])
  const [priorities, setPriorities] = useState<JiraPriority[]>([])
  const [announcements, setAnnouncements] = useState<CandidateAnnouncement[]>([])
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [reply, setReply] = useState('')
  const [announcementTitle, setAnnouncementTitle] = useState('')
  const [announcementMessage, setAnnouncementMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (!token) return
    setError('')
    try {
      const [feedback, workflow, notes] = await Promise.all([
        getCandidateFeedback(undefined, token, true), getCandidateWorkflow(token), getCandidateAnnouncements(token),
      ])
      setItems(feedback); setColumns(workflow.columns); setPriorities(workflow.priorities); setAnnouncements(notes.items)
      setSelectedKey((current) => current || feedback[0]?.key || null)
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not load platform feedback') }
  }, [token])
  useEffect(() => { void load() }, [load])

  const boardColumns = useMemo(() => {
    const known = [...columns]
    for (const item of items) if (!known.some((column) => column.status_ids.includes(item.status_id))) known.push({ id: `status-${item.status_id}`, name: item.status, status_ids: [item.status_id] })
    return known
  }, [columns, items])
  const selected = items.find((item) => item.key === selectedKey) || null
  const replace = (item: CandidateFeedback) => setItems((current) => current.map((entry) => entry.key === item.key ? item : entry))

  const update = async (item: CandidateFeedback, change: { status_id?: string; priority_id?: string }) => {
    if (!token) return
    setBusy(true); setError('')
    try { replace(await updateCandidateFeedback(item.key, change, token)) }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not update Jira') }
    finally { setBusy(false) }
  }
  const sendReply = async (internal: boolean) => {
    if (!selected || !token || !reply.trim()) return
    setBusy(true); setError('')
    try { replace(await replyToCandidateFeedback(selected.key, reply, internal, token)); setReply('') }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not add the message') }
    finally { setBusy(false) }
  }
  const publishAnnouncement = async () => {
    if (!token || !announcementTitle.trim() || !announcementMessage.trim()) return
    setBusy(true); setError('')
    try {
      const created = await createCandidateAnnouncement(announcementTitle, announcementMessage, token)
      setAnnouncements((current) => [created, ...current]); setAnnouncementTitle(''); setAnnouncementMessage('')
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not publish announcement') }
    finally { setBusy(false) }
  }
  const removeAnnouncement = async (id: string) => {
    if (!token) return
    setBusy(true); setError('')
    try { await deleteCandidateAnnouncement(id, token); setAnnouncements((current) => current.filter((item) => item.id !== id)) }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not remove announcement') }
    finally { setBusy(false) }
  }
  const downloadAttachment = async (item: CandidateFeedback, attachmentId: string, filename: string) => {
    if (!token) return
    const response = await fetch(candidateAttachmentUrl(undefined, item.key, attachmentId), { headers: { Authorization: `Bearer ${token}` } })
    if (!response.ok) return setError('Could not open that screenshot')
    const url = URL.createObjectURL(await response.blob())
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return <div className="space-y-6">
    {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
    <details className="rounded-2xl border border-black/10 bg-white shadow-sm">
      <summary className="flex cursor-pointer list-none items-center gap-3 p-5 font-bold text-gray-950"><Megaphone className="text-amber-600" />Tester announcements <Badge variant="outline">{announcements.length}</Badge></summary>
      <div className="grid gap-5 border-t border-black/10 p-5 lg:grid-cols-2">
        <div><Input value={announcementTitle} onChange={(event) => setAnnouncementTitle(event.target.value)} placeholder="Announcement title" maxLength={120} /><Textarea className="mt-3 min-h-28" value={announcementMessage} onChange={(event) => setAnnouncementMessage(event.target.value)} placeholder="Short note for everyone testing the unstable build…" /><Button className="mt-3" disabled={busy || !announcementTitle.trim() || !announcementMessage.trim()} onClick={() => void publishAnnouncement()}>Publish announcement</Button></div>
        <div className="space-y-2">{announcements.map((item) => <article key={item.id} className="rounded-xl border border-gray-200 p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-bold text-gray-950">{item.title}</p><p className="mt-1 whitespace-pre-wrap text-sm text-gray-600">{item.message}</p><p className="mt-2 text-xs text-gray-400">{new Date(item.published_at).toLocaleDateString()}</p></div><Button variant="ghost" size="icon" aria-label={`Remove ${item.title}`} disabled={busy} onClick={() => void removeAnnouncement(item.id)}><Trash /></Button></div></article>)}{!announcements.length ? <p className="py-8 text-center text-sm text-gray-400">No active announcements.</p> : null}</div>
      </div>
    </details>

    <section aria-label="Jira feedback board" className="overflow-x-auto rounded-2xl border border-black/10 bg-gray-100 p-3 shadow-sm">
      <div className="grid min-w-max gap-3" style={{ gridTemplateColumns: `repeat(${Math.max(boardColumns.length, 1)}, minmax(17rem, 1fr))` }}>
        {boardColumns.map((column) => <div key={column.id} className="w-[17rem] rounded-xl bg-white/70 p-2"><div className="mb-2 flex items-center justify-between px-2 py-1"><h2 className="text-xs font-black uppercase tracking-wide text-gray-600">{column.name}</h2><Badge variant="outline">{items.filter((item) => column.status_ids.includes(item.status_id)).length}</Badge></div><div className="space-y-2">{items.filter((item) => column.status_ids.includes(item.status_id)).map((item) => <button key={item.key} onClick={() => { setSelectedKey(item.key); setReply('') }} className={`w-full rounded-xl border p-4 text-left transition ${selectedKey === item.key ? 'border-gray-950 bg-gray-950 text-white' : 'border-gray-200 bg-white hover:border-gray-400'}`}><div className="flex items-center justify-between gap-2"><span className="text-xs font-bold">{item.submitter || 'Tester'}</span><span className="text-[10px] opacity-50">{item.key}</span></div><p className="mt-2 line-clamp-3 text-sm leading-5">{item.message}</p><div className="mt-3 flex items-center gap-2"><Badge variant="outline">{item.priority}</Badge><span className="text-[10px] opacity-60">{item.status}</span></div></button>)}</div></div>)}
      </div>
    </section>

    {selected ? <section className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm md:p-7"><div className="mx-auto max-w-4xl">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-wide text-gray-400">{selected.submitter} · {selected.key}</p><h2 className="mt-2 text-xl font-bold text-gray-950">{selected.message}</h2>{selected.done_at ? <p className="mt-2 text-sm font-medium text-green-700">Moved to Done {new Date(selected.done_at).toLocaleString()}</p> : null}</div><label className="min-w-44 text-xs font-bold text-gray-600">Jira priority<Select value={selected.priority_id} onValueChange={(priority_id) => void update(selected, { priority_id })} disabled={busy}><SelectTrigger className="mt-2"><SelectValue /></SelectTrigger><SelectContent>{priorities.map((priority) => <SelectItem key={priority.id} value={priority.id}>{priority.name}</SelectItem>)}</SelectContent></Select></label></div>
      {selected.attachments.length ? <div className="mt-5 flex flex-wrap gap-2">{selected.attachments.map((file) => <Button key={file.id} variant="outline" size="sm" onClick={() => void downloadAttachment(selected, file.id, file.filename)}>{file.filename}</Button>)}</div> : null}
      <div className="mt-6 flex flex-wrap items-center gap-2"><span className="mr-1 text-xs font-bold text-gray-500">Move in Jira:</span>{selected.transitions?.map((transition) => <Button key={transition.id} size="sm" variant="outline" disabled={busy} onClick={() => void update(selected, { status_id: transition.to.id })}>{transition.to.name}</Button>)}{!selected.transitions?.length ? <span className="text-sm text-gray-400">No available transitions</span> : null}</div>
      {selected.entries.length ? <div className="mt-7 space-y-3">{selected.entries.map((entry) => <div key={entry.id} className={entry.internal ? 'rounded-xl border border-dashed border-amber-300 bg-amber-50 p-4' : entry.audience === 'tester' ? 'rounded-xl bg-gray-100 p-4' : 'rounded-xl bg-blue-50 p-4'}><div className="flex items-center gap-2 text-xs font-bold text-gray-500">{entry.internal ? <NotePencil /> : <PaperPlaneTilt />}{entry.internal ? 'Internal Jira note' : entry.audience === 'tester' ? 'Tester comment' : 'Shared with tester'} · {entry.author}</div><p className="mt-2 text-sm leading-6 text-gray-800">{entry.message}</p></div>)}</div> : null}
      <div className="mt-7"><Textarea value={reply} onChange={(event) => setReply(event.target.value)} placeholder="Write a comment…" className="min-h-24" /><div className="mt-2 flex flex-wrap justify-end gap-2"><Button variant="outline" disabled={busy || !reply.trim()} onClick={() => void sendReply(true)}><NotePencil />Internal Jira note</Button><Button disabled={busy || !reply.trim()} onClick={() => void sendReply(false)}><PaperPlaneTilt />Share with tester</Button></div></div>
    </div></section> : null}
  </div>
}
