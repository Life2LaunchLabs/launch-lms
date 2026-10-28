'use client'

import React from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { ActivityDesignFields } from './DesignInspector'
import { EditorModal, ProgressPicker, Toggle } from './EditorDialogs'
import { pageHeading } from './PageRail'
import { FieldLabel, IconButton, TextField } from './ui'

// Activity settings: title, progress, grading, what the activity keeps and the
// learner details it writes.

export function ActivitySettingsDialog({
  activity,
  gradingSettings,
  hasScoredQuestions,
  learningVariables,
  variableDraftKey,
  setVariableDraftKey,
  onPatchActivity,
  onPatchGrading,
  onCreateVariable,
  onPatchVariable,
  onDeleteVariable,
  pages,
  pageOrder,
  onClose,
}: any) {
  const settings = activity.settings || {}
  const design = settings.design || {}
  const patchDesign = (patch: any) => onPatchActivity({ settings: { ...settings, design: { ...design, ...patch } } })
  const kept = keptAnswers(pages, pageOrder)
  return (
    <EditorModal title="Activity settings" subtitle="Things that apply to every page." width={680} onClose={onClose}>
      <div className="space-y-7 px-6 py-5">
        <section className="space-y-4">
          <TextField label="Title" value={activity.title || ''} onChange={(value) => onPatchActivity({ title: value })} />
          <div>
            <FieldLabel>Description</FieldLabel>
            <textarea
              value={activity.description || ''}
              onChange={(event) => onPatchActivity({ description: event.target.value })}
              className="min-h-20 w-full resize-y rounded-lg border border-gray-200 p-3 text-sm outline-none focus:border-[var(--org-primary-color)]"
            />
            <p className="mt-1 text-xs text-gray-500">Shown on the plan step before they start.</p>
          </div>
        </section>
        <section className="space-y-2">
          <FieldLabel>Progress bar</FieldLabel>
          <ProgressPicker value={design.progress} onChange={(progress) => patchDesign({ progress })} />
        </section>
        <section className="space-y-2">
          <Toggle label="Let them go back a page" checked={design.allow_back !== false} onChange={(allow_back) => patchDesign({ allow_back })} />
          <Toggle label="Pick up where they left off" help="Reopening the activity returns to the last page they reached." checked={design.resume !== false} onChange={(resume) => patchDesign({ resume })} />
        </section>
        <section className="space-y-3">
          <FieldLabel>Grading</FieldLabel>
          <div className="space-y-3 rounded-xl border border-gray-200 p-3.5">
            <p className="text-sm text-gray-600">{hasScoredQuestions ? `They pass at ${gradingSettings.minimum_score_percent}%. Points, right answers and the pass mark are set in Grading.` : 'No scored questions, so they finish it with no pass mark. Grading in the header sets points and right answers.'}</p>
            {hasScoredQuestions && <TextField label="When they pass" value={gradingSettings.success_message || ''} onChange={(value) => onPatchGrading({ success_message: value })} />}
            {hasScoredQuestions && <TextField label="When they don't yet" value={gradingSettings.failure_message || ''} onChange={(value) => onPatchGrading({ failure_message: value })} />}
          </div>
        </section>
        <section className="space-y-2">
          <FieldLabel>What it keeps</FieldLabel>
          {kept.length ? kept.map((item) => (
            <div key={item.key} className="flex items-center justify-between gap-4 rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm">
              <span className="min-w-0 truncate">Page {item.number}: {item.title}</span>
              <span className="shrink-0 text-xs text-gray-500">{item.targets.join(', ')}</span>
            </div>
          )) : <p className="text-sm text-gray-500">Nothing yet. A question can keep its answer in what you know about the learner.</p>}
        </section>
        <ActivityDesignFields activity={activity} pages={pages || []} onPatchActivity={onPatchActivity} />
        <section>
          <h2 className="text-lg font-bold">Learner details</h2>
          <p className="mt-1 text-sm text-gray-500">Your organization&apos;s own fields, which questions can fill in.</p>
          <div className="mt-4 space-y-4">
            <VariableCreateInline value={variableDraftKey} onChange={setVariableDraftKey} onCreate={onCreateVariable} />
            <VariableRegistry variables={learningVariables} onPatchVariable={onPatchVariable} onDeleteVariable={onDeleteVariable} />
          </div>
        </section>
      </div>
    </EditorModal>
  )
}

/** Questions that keep an answer (variable bindings), in page order. */
export function keptAnswers(pages: any[], pageOrder: string[]) {
  return pageOrder.flatMap((uuid, index) => {
    const page = pages.find((item) => item.page_uuid === uuid)
    return (page?.content?.blocks || []).filter((block: any) => block?.type === 'question').flatMap((block: any) => {
      const bindings = block.completion?.variable_bindings || {}
      const targets = [
        ...(bindings.selected || []),
        ...Object.values(bindings.inputs || {}).flat(),
        ...Object.values(bindings.options || {}).flat(),
      ].map((binding: any) => String(binding?.target || '').replace(/^user\.details\.variables\./, '')).filter(Boolean)
      return targets.length ? [{ key: `${uuid}:${block.id}`, number: index + 1, title: pageHeading(page), targets }] : []
    })
  })
}

function VariableRegistry({ variables = [], onPatchVariable, onDeleteVariable }: any) {
  const sorted = [...variables].sort((a: any, b: any) => String(a.key).localeCompare(String(b.key)))
  if (!sorted.length) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 p-4 text-sm font-medium text-gray-500">
        No custom variables yet.
      </div>
    )
  }
  return (
    <div className="overflow-hidden rounded-lg border border-gray-200">
      {sorted.map((variable: any) => {
        const key = String(variable.key || '')
        const depth = Math.max(0, key.split('.').length - 1)
        const valueType = variable.value_type || variable.valueType || 'text'
        const options = Array.isArray(variable.options) ? variable.options.map((option: any, index: number) => ({ id: String(option?.id || option?.value || `option_${index + 1}`), text: String(option?.text || option?.label || '') })) : []
        const patchOption = (id: string, text: string) => onPatchVariable(variable, { options: options.map((option: any) => option.id === id ? { ...option, text } : option) })
        return (
          <div key={variable.variable_uuid || key} className="border-b border-gray-100 p-3 last:border-b-0">
            <div className="grid grid-cols-[1fr_10rem_2.5rem] items-center gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-gray-800" style={{ paddingLeft: depth * 14 }}>{key}</p>
                <input
                  value={variable.label || ''}
                  onChange={(event) => onPatchVariable(variable, { label: event.target.value })}
                  placeholder="Label"
                  className="mt-1 h-8 w-full rounded-lg border border-gray-200 px-2 text-xs outline-none focus:border-[var(--org-primary-color)]"
                />
              </div>
              <select
                value={valueType}
                onChange={(event) => onPatchVariable(variable, { value_type: event.target.value })}
                className="h-9 rounded-lg border border-gray-200 px-2 text-xs font-bold outline-none focus:border-[var(--org-primary-color)]"
              >
                <option value="text">Text</option>
                <option value="number">Number</option>
                <option value="boolean">Boolean</option>
                <option value="multiple_choice">Multiple choice</option>
                <option value="option">Option</option>
                <option value="image">Image</option>
              </select>
              <IconButton title="Delete variable" onClick={() => onDeleteVariable(variable)}><Trash2 size={15} /></IconButton>
            </div>
            {valueType === 'multiple_choice' && (
              <div className="mt-3 space-y-2 rounded-lg bg-gray-50 p-2">
                <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Choices</p>
                {options.map((option: any) => (
                  <div key={option.id} className="flex items-center gap-2">
                    <input value={option.text} onChange={(event) => patchOption(option.id, event.target.value)} placeholder="Option label" className="h-8 min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-2 text-xs outline-none focus:border-[var(--org-primary-color)]" />
                    <IconButton title="Remove option" onClick={() => onPatchVariable(variable, { options: options.filter((item: any) => item.id !== option.id) })}><Trash2 size={13} /></IconButton>
                  </div>
                ))}
                <button type="button" onClick={() => onPatchVariable(variable, { options: [...options, { id: `option_${Date.now()}`, text: `Option ${options.length + 1}` }] })} className="flex h-8 w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-gray-300 bg-white text-xs font-bold text-gray-600 hover:border-gray-400"><Plus size={13} />Add choice</button>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function VariableCreateInline({ value, onChange, onCreate }: any) {
  return (
    <div className="flex gap-2">
      <input
        value={value || ''}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Create: personality.traits.style"
        className="h-9 min-w-0 flex-1 rounded-lg border border-gray-200 px-2 text-xs outline-none focus:border-[var(--org-primary-color)]"
      />
      <button onClick={onCreate} className="h-9 rounded-lg border border-gray-200 px-3 text-xs font-bold text-gray-700 hover:bg-gray-50">Create</button>
    </div>
  )
}
