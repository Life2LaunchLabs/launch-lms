'use client'

import React from 'react'
import toast from 'react-hot-toast'
import { ArrowDown, ArrowUp, ChevronDown, Loader2, Plus, Save, Trash2 } from 'lucide-react'
import { Button } from '@components/ui/button'
import { Input } from '@components/ui/input'
import { Switch } from '@components/ui/switch'
import { coachAdminApi, type CoachPlaybook, type CoachPlaybookWrite, type CoachPolicy } from '@services/coach/admin'
import MarkdownField from './MarkdownField'
import { Panel, errorMessage, useCoachPolicy } from './CoachShell'

const blank: CoachPlaybookWrite = { title: '', used_when: '', body: '', always: false, enabled: true }

export default function CoachKnowledge({ policy }: { policy: CoachPolicy }) {
  const { mutate, token } = useCoachPolicy()
  const [open, setOpen] = React.useState<string | null>(null)
  const [adding, setAdding] = React.useState(false)
  const books = policy.playbooks

  async function move(index: number, by: number) {
    const uuids = books.map((book) => book.playbook_uuid)
    ;[uuids[index], uuids[index + by]] = [uuids[index + by], uuids[index]]
    try {
      await coachAdminApi.orderPlaybooks(uuids, token)
      await mutate()
    } catch (error) {
      toast.error(errorMessage(error, 'Could not reorder the playbooks.'))
    }
  }

  return (
    <Panel
      title="Knowledge"
      description="Playbooks from the coaching team, your method among them. Coach always reads the ones marked Always, in this order, and the two whose title and “used when” best match the conversation."
      actions={<Button type="button" variant="outline" onClick={() => { setAdding(true); setOpen(null) }} disabled={adding}><Plus size={15} />New playbook</Button>}
    >
      <ol className="space-y-3">
        {adding ? <li><PlaybookEditor initial={blank} onDone={() => setAdding(false)} /></li> : null}
        {books.map((book, index) => (
          <li key={book.playbook_uuid} className="rounded-xl border border-black/10">
            <div className="flex items-center gap-2 p-3">
              <button type="button" onClick={() => setOpen(open === book.playbook_uuid ? null : book.playbook_uuid)} aria-expanded={open === book.playbook_uuid} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                <ChevronDown size={16} className={`shrink-0 text-gray-400 transition-transform ${open === book.playbook_uuid ? 'rotate-180' : ''}`} />
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2 text-sm font-bold text-gray-950">
                    {book.title}
                    {book.always ? <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-bold text-violet-800">Always</span> : null}
                    {!book.enabled ? <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-bold text-gray-600">Off</span> : null}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-gray-500">{book.always ? 'Read in every conversation' : book.used_when ? `Used when: ${book.used_when}` : 'No “used when” yet, so Coach only finds it by its title'}</span>
                </span>
              </button>
              <Button type="button" variant="ghost" size="sm" onClick={() => void move(index, -1)} disabled={index === 0} aria-label={`Move ${book.title} up`}><ArrowUp size={15} /></Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => void move(index, 1)} disabled={index === books.length - 1} aria-label={`Move ${book.title} down`}><ArrowDown size={15} /></Button>
            </div>
            {open === book.playbook_uuid ? <div className="border-t border-black/10 p-4"><PlaybookEditor key={book.updated_at} uuid={book.playbook_uuid} initial={book} onDone={() => setOpen(null)} /></div> : null}
          </li>
        ))}
      </ol>
      {!books.length && !adding ? <p className="text-sm text-gray-500">No playbooks yet. Coach works from the built-in rules alone.</p> : null}
    </Panel>
  )
}

function PlaybookEditor({ uuid, initial, onDone }: { uuid?: string; initial: CoachPlaybookWrite | CoachPlaybook; onDone: () => void }) {
  const { mutate, token } = useCoachPolicy()
  const [draft, setDraft] = React.useState<CoachPlaybookWrite>({ title: initial.title, used_when: initial.used_when, body: initial.body, always: initial.always, enabled: initial.enabled })
  const [busy, setBusy] = React.useState<'save' | 'delete' | null>(null)
  const set = (patch: Partial<CoachPlaybookWrite>) => setDraft((current) => ({ ...current, ...patch }))
  const fieldId = uuid || 'new-playbook'

  async function save() {
    setBusy('save')
    try {
      if (uuid) await coachAdminApi.updatePlaybook(uuid, draft, token)
      else await coachAdminApi.createPlaybook(draft, token)
      await mutate()
      toast.success(`${draft.title.trim()} saved.`)
      onDone()
    } catch (error) {
      toast.error(errorMessage(error, 'Could not save the playbook.'))
    } finally {
      setBusy(null)
    }
  }

  async function remove() {
    if (!uuid || !window.confirm(`Delete the ${initial.title} playbook? It leaves the draft; learners keep it until the next release.`)) return
    setBusy('delete')
    try {
      await coachAdminApi.deletePlaybook(uuid, token)
      await mutate()
      toast.success('Playbook deleted.')
    } catch (error) {
      toast.error(errorMessage(error, 'Could not delete the playbook.'))
      setBusy(null)
    }
  }

  return (
    <div className={uuid ? 'space-y-4' : 'space-y-4 rounded-xl border border-violet-200 bg-violet-50/40 p-4'}>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block"><span className="text-sm font-bold text-gray-900">Title</span>
          <Input value={draft.title} maxLength={200} onChange={(event) => set({ title: event.target.value })} placeholder="Big career dreams" className="mt-2" /></label>
        <label className="block"><span className="text-sm font-bold text-gray-900">Used when</span>
          <Input value={draft.used_when} maxLength={2000} onChange={(event) => set({ used_when: event.target.value })} disabled={draft.always} placeholder="A learner wants a long-shot career like pro gaming or sports" className="mt-2" /></label>
      </div>
      <div className="flex flex-wrap gap-6">
        <label className="flex items-center gap-3 text-sm"><Switch checked={draft.always} onCheckedChange={(always) => set({ always })} /><span><span className="font-bold text-gray-900">Always</span><span className="block text-xs text-gray-500">Read in every conversation and routine</span></span></label>
        <label className="flex items-center gap-3 text-sm"><Switch checked={draft.enabled} onCheckedChange={(enabled) => set({ enabled })} /><span><span className="font-bold text-gray-900">On</span><span className="block text-xs text-gray-500">Off keeps it here without Coach reading it</span></span></label>
      </div>
      <MarkdownField id={`${fieldId}-body`} label="Playbook" value={draft.body} onChange={(body) => set({ body })} rows={12} maxLength={60000} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        {uuid ? <Button type="button" variant="outline" onClick={() => void remove()} disabled={busy !== null}>{busy === 'delete' ? <Loader2 className="animate-spin" size={15} /> : <Trash2 size={15} />}Delete</Button> : <span />}
        <div className="flex gap-2">
          <Button type="button" variant="ghost" onClick={onDone} disabled={busy !== null}>Cancel</Button>
          <Button type="button" onClick={() => void save()} disabled={busy !== null || !draft.title.trim()}>{busy === 'save' ? <Loader2 className="animate-spin" size={15} /> : <Save size={15} />}Save playbook</Button>
        </div>
      </div>
    </div>
  )
}
