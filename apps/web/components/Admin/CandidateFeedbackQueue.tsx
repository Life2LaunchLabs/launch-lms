'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { CheckCircle, Clock, EyeSlash, Flag, NotePencil, PaperPlaneTilt, Wrench } from '@phosphor-icons/react'
import { useOrg } from '@components/Contexts/OrgContext'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import AdminFeatureHeader from '@components/Admin/AdminFeatureHeader'
import { Badge } from '@components/ui/badge'
import { Button } from '@components/ui/button'
import { Textarea } from '@components/ui/textarea'
import { Alert, AlertDescription } from '@components/ui/alert'
import { CandidateFeedback, FeedbackStatus, candidateAttachmentUrl, getCandidateFeedback, replyToCandidateFeedback, updateCandidateFeedback } from '@services/candidate/candidate'

const LABELS: Record<FeedbackStatus, string> = { open: 'Open', in_progress: 'In the works', awaiting_confirmation: 'Waiting for tester', solved: 'Solved', ignored: 'Ignored' }

export default function CandidateFeedbackQueue() {
  const org = useOrg() as any
  const session = useLHSession() as any
  const orgId = Number(org?.id)
  const token = session?.data?.tokens?.access_token as string | undefined
  const [items, setItems] = useState<CandidateFeedback[]>([])
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [reply, setReply] = useState('')
  const [releaseNote, setReleaseNote] = useState('')
  const [showClosed, setShowClosed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (!orgId || !token) return
    try {
      const feedback = await getCandidateFeedback(orgId, token, true)
      setItems(feedback)
      setSelectedKey((current) => current || feedback[0]?.key || null)
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not load feedback') }
  }, [orgId, token])
  useEffect(() => { void load() }, [load])

  const visible = useMemo(() => items.filter((item) => showClosed || !['solved', 'ignored'].includes(item.status)), [items, showClosed])
  const selected = items.find((item) => item.key === selectedKey) || null
  const replace = (item: CandidateFeedback) => setItems((current) => current.map((entry) => entry.key === item.key ? item : entry))

  const update = async (item: CandidateFeedback, change: { status?: FeedbackStatus; priority?: 'normal' | 'high'; release_note?: string }) => {
    if (!token) return
    setBusy(true); setError('')
    try { replace(await updateCandidateFeedback(orgId, item.key, change, token)) }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not update feedback') }
    finally { setBusy(false) }
  }

  const sendReply = async (internal: boolean) => {
    if (!selected || !token || !reply.trim()) return
    setBusy(true); setError('')
    try { replace(await replyToCandidateFeedback(orgId, selected.key, reply, internal, token)); setReply('') }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not add the message') }
    finally { setBusy(false) }
  }

  const downloadAttachment = async (item: CandidateFeedback, attachmentId: string, filename: string) => {
    if (!token) return
    const response = await fetch(candidateAttachmentUrl(orgId, item.key, attachmentId), { headers: { Authorization: `Bearer ${token}` } })
    if (!response.ok) return setError('Could not open that screenshot')
    const url = URL.createObjectURL(await response.blob())
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return <div className="grid h-screen w-full grid-rows-[auto_1fr] bg-[#f8f8f8]">
    <AdminFeatureHeader feature="Tester feedback" activeTab="outstanding" tabs={[{ id: 'outstanding', label: `${visible.length} outstanding`, href: '/admin/feedback', icon: <Flag size={15} /> }]} actions={<Button variant="outline" size="sm" onClick={() => setShowClosed((value) => !value)}>{showClosed ? 'Hide closed' : 'Show closed'}</Button>} />
    <div className="min-h-0 overflow-y-auto p-4 md:p-6">
      {error ? <Alert variant="destructive" className="mb-4"><AlertDescription>{error}</AlertDescription></Alert> : null}
      <div className="grid min-h-[620px] overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm lg:grid-cols-[360px_1fr]">
        <aside className="border-b border-gray-200 lg:border-b-0 lg:border-r"><div className="max-h-[38vh] overflow-y-auto p-2 lg:max-h-[calc(100vh-170px)]">{visible.length ? visible.map((item) => <button key={item.key} onClick={() => { setSelectedKey(item.key); setReply(''); setReleaseNote('') }} className={`mb-1 w-full rounded-xl p-4 text-left transition ${selectedKey === item.key ? 'bg-gray-950 text-white' : 'hover:bg-gray-50'}`}><div className="flex items-center justify-between gap-2"><span className="text-xs font-bold">{item.submitter || 'Tester'}</span><span className={`text-[10px] ${selectedKey === item.key ? 'text-white/50' : 'text-gray-400'}`}>{item.key}</span></div><p className="mt-2 line-clamp-2 text-sm leading-5">{item.message}</p><div className="mt-3 flex gap-2"><Badge variant={item.priority === 'high' ? 'destructive' : 'outline'}>{item.priority === 'high' ? 'High' : LABELS[item.status]}</Badge>{item.priority === 'high' ? <Badge variant="outline" className={selectedKey === item.key ? 'border-white/20 text-white' : ''}>{LABELS[item.status]}</Badge> : null}</div></button>) : <p className="p-10 text-center text-sm text-gray-400">No outstanding feedback.</p>}</div></aside>
        <main className="min-w-0 p-5 md:p-7">{selected ? <div className="mx-auto max-w-3xl">
          <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-wide text-gray-400">{selected.submitter} · {selected.key}</p><h2 className="mt-2 text-xl font-bold text-gray-950">{selected.message}</h2></div><Button variant={selected.priority === 'high' ? 'destructive' : 'outline'} size="sm" disabled={busy} onClick={() => void update(selected, { priority: selected.priority === 'high' ? 'normal' : 'high' })}><Flag />{selected.priority === 'high' ? 'High priority' : 'Mark high priority'}</Button></div>
          {selected.attachments.length ? <div className="mt-5 flex flex-wrap gap-2">{selected.attachments.map((file) => <Button key={file.id} variant="outline" size="sm" onClick={() => void downloadAttachment(selected, file.id, file.filename)}>{file.filename}</Button>)}</div> : null}
          <div className="mt-6 flex flex-wrap gap-2"><Button size="sm" variant={selected.status === 'open' ? 'default' : 'outline'} disabled={busy} onClick={() => void update(selected, { status: 'open' })}><Clock />Open</Button><Button size="sm" variant={selected.status === 'in_progress' ? 'default' : 'outline'} disabled={busy} onClick={() => void update(selected, { status: 'in_progress' })}><Wrench />In the works</Button><Button size="sm" variant="outline" disabled={busy} onClick={() => void update(selected, { status: 'ignored' })}><EyeSlash />Ignore</Button></div>
          {selected.entries.length ? <div className="mt-7 space-y-3">{selected.entries.map((entry) => <div key={entry.id} className={entry.internal ? 'rounded-xl border border-dashed border-amber-300 bg-amber-50 p-4' : 'rounded-xl bg-blue-50 p-4'}><div className="flex items-center gap-2 text-xs font-bold text-gray-500">{entry.internal ? <NotePencil /> : <PaperPlaneTilt />}{entry.internal ? 'Internal note' : 'Reply to tester'} · {entry.author}</div><p className="mt-2 text-sm leading-6 text-gray-800">{entry.message}</p></div>)}</div> : null}
          <div className="mt-7"><Textarea value={reply} onChange={(event) => setReply(event.target.value)} placeholder="Reply to the tester, or add a private note…" className="min-h-24" /><div className="mt-2 flex flex-wrap justify-end gap-2"><Button variant="outline" disabled={busy || !reply.trim()} onClick={() => void sendReply(true)}><NotePencil />Add internal note</Button><Button disabled={busy || !reply.trim()} onClick={() => void sendReply(false)}><PaperPlaneTilt />Reply to tester</Button></div></div>
          <div className="mt-8 rounded-xl border border-green-200 bg-green-50 p-4"><div className="flex items-center gap-2 font-bold text-green-950"><CheckCircle />Fixed in this push</div><p className="mt-1 text-sm text-green-800">This becomes the tester-facing release note and asks them to confirm the fix.</p><Textarea value={releaseNote} onChange={(event) => setReleaseNote(event.target.value)} placeholder="This push should have solved…" className="mt-3 min-h-20 bg-white" /><Button className="mt-3" disabled={busy || !releaseNote.trim()} onClick={() => void update(selected, { status: 'awaiting_confirmation', release_note: releaseNote })}>Send for tester confirmation</Button></div>
        </div> : <div className="flex h-full items-center justify-center text-sm text-gray-400">Select a feedback item.</div>}</main>
      </div>
    </div>
  </div>
}
