'use client'

import React from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@components/ui/dialog'
import { PhaseForm, type PhaseDraft } from '@components/LifePlan/PhaseForm'
import { uid } from '@components/LifePlan/model'
import type { LifeDoc } from '@services/life/life'

/** What the dialog is doing: starting the plan, adding a phase after another one (or at the end), or editing one. */
export type PhaseEdit = { mode: 'add'; after?: string } | { mode: 'edit'; phaseId: string }

/* eslint-disable no-unused-vars -- parameter names in function types */
type Props = {
  edit: PhaseEdit | null
  doc: LifeDoc | null
  token?: string
  onClose: () => void
  change: (fn: (next: LifeDoc) => void) => Promise<LifeDoc | null>
  /** Called with the new phase's id once it is saved. */
  onAdded?: (phaseId: string) => void
}
/* eslint-enable no-unused-vars */

/** Name a phase, what you're mostly doing, where and for how long. A new phase after another carries its budget lines over. */
export default function PhaseDialog({ edit, doc, token, onClose, change, onAdded }: Props) {
  const phases = doc?.phases || []
  const editing = edit?.mode === 'edit' ? phases.find((p) => p.id === edit.phaseId) : undefined
  const first = edit?.mode === 'add' && !phases.length
  const afterIndex = edit?.mode === 'add' ? (edit.after ? phases.findIndex((p) => p.id === edit.after) : phases.length - 1) : -1
  const before = afterIndex >= 0 ? phases[afterIndex] : undefined
  const initial: PhaseDraft = editing
    ? { title: editing.title, kind: editing.kind, place: editing.place ?? null, placeLabel: editing.place_label || '', months: editing.months }
    : { title: '', kind: first ? 'school' : 'work', place: before?.place ?? null, placeLabel: before?.place_label || '', months: 12 }

  const submit = async (draft: PhaseDraft) => {
    const fields = { title: draft.title, kind: draft.kind, place: draft.place, place_label: draft.placeLabel, months: draft.months }
    if (editing) {
      if (await change((next) => { const p = next.phases.find((x) => x.id === editing.id); if (p) Object.assign(p, fields) })) onClose()
      return
    }
    const id = uid('p')
    const saved = await change((next) => {
      const from = next.phases[afterIndex]
      next.phases.splice(afterIndex + 1, 0, { id, ...fields, lines: (from?.lines || []).map((l) => ({ ...l, id: uid('l'), start: 0, end: null })) })
    })
    if (saved) { onClose(); onAdded?.(id) }
  }

  return <Dialog open={Boolean(edit)} onOpenChange={(open) => { if (!open) onClose() }}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{editing ? 'Edit this phase' : first ? 'Start with the phase you’re in now' : 'What comes after?'}</DialogTitle>
        <DialogDescription>{editing ? 'Its goals and budget stay with it.' : first ? 'High school, college, a first job: a phase holds your goals and a budget. You can add what comes next after.' : before ? `It starts when ${before.title} ends, with the same budget lines to adjust.` : 'Sketch it loosely; you can change it later.'}</DialogDescription>
      </DialogHeader>
      <div className="pt-2">
        {edit ? <PhaseForm key={editing?.id || 'new'} token={token} initial={initial} submitLabel={editing ? 'Save' : first ? 'Start my plan' : 'Add phase'} onCancel={onClose} onSubmit={(draft) => { void submit(draft) }} /> : null}
      </div>
    </DialogContent>
  </Dialog>
}
