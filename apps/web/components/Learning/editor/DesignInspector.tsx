'use client'

import React from 'react'
import { SCENES } from '@components/Learning/player/design'
import { FieldLabel, InspectorSection, SegmentedControl, TextField } from './ui'

/* eslint-disable no-unused-vars */

/** The editor controls for the activity design language: page backgrounds and scenes, block motion and placement, and the activity's defaults. */

export function ColorField({ label, value, fallback, onChange }: { label: string; value: string; fallback: string; onChange: (value: string) => void }) {
  const color = isHexColor(value) ? value : fallback
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={`${label} picker`}
          value={color}
          onChange={(event) => onChange(event.target.value)}
          className="h-10 w-12 rounded-lg border border-gray-200 bg-white p-1"
        />
        <input
          aria-label={label}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={fallback}
          className="h-10 min-w-0 flex-1 rounded-lg border border-gray-200 px-3 text-sm outline-none focus:border-[var(--org-primary-color)]"
        />
        {value && (
          <button type="button" onClick={() => onChange('')} className="h-10 rounded-lg border border-gray-200 px-3 text-xs font-bold text-gray-600 hover:bg-gray-50">
            Reset
          </button>
        )}
      </div>
    </div>
  )
}

export function isHexColor(value: string) {
  return /^#[0-9a-f]{6}$/i.test(String(value || ''))
}

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: { value: string; label: string }[]; onChange: (value: string) => void }) {
  return <label className="grid gap-2 text-xs font-bold text-gray-500">{label}
    <select value={value} onChange={(event) => onChange(event.target.value)} className="h-10 rounded-lg border border-gray-200 px-3 text-sm font-normal text-gray-900">
      {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
  </label>
}

/** Drops empty values so a cleared field falls back to the activity's default. */
function compact(value: Record<string, any>) {
  const out = Object.fromEntries(Object.entries(value).filter(([, item]) => item !== '' && item !== undefined && item !== null))
  return Object.keys(out).length ? out : undefined
}

/** A background: colour, optional gradient, and an animated scene. */
function BackgroundFields({ background = {}, fallback, onChange }: { background?: any; fallback: string; onChange: (background: any) => void }) {
  const patch = (next: any) => onChange(compact({ ...background, ...next }))
  return <>
    <ColorField label="Background" value={background.color || ''} fallback={fallback} onChange={(color) => patch({ color })} />
    {background.color ? <ColorField label="Gradient to" value={background.gradient_to || ''} fallback={background.color} onChange={(gradient_to) => patch({ gradient_to })} /> : null}
    <SelectField label="Scene" value={background.scene || 'none'} options={SCENES} onChange={(scene) => patch({ scene: scene === 'none' ? undefined : scene })} />
    {background.scene ? <SegmentedControl label="Scene intensity" value={background.intensity || 'medium'} options={[{ value: 'low', label: 'Low' }, { value: 'medium', label: 'Medium' }, { value: 'high', label: 'High' }]} onChange={(intensity) => patch({ intensity })} /> : null}
  </>
}

/** A page's own background, celebration and timer. */
export function PageDesignFields({ page, onPatchPage }: { page: any; onPatchPage: (patch: any) => void }) {
  const design = page.design || {}
  const patchDesign = (patch: any) => onPatchPage({ design: compact({ ...design, ...patch }) || {} })
  // Older pages kept a bare accent colour; editing the background moves it into ``background``.
  const background = design.background || (design.background_accent_color ? { color: design.background_accent_color } : undefined)
  const seconds = Number(design.auto_advance_ms) > 0 ? String(Math.round(Number(design.auto_advance_ms) / 1000)) : ''
  return <>
    <BackgroundFields background={background} fallback="#f8fafc" onChange={(next) => patchDesign({ background: next, background_accent_color: undefined })} />
    <label className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm">
      <span className="font-bold text-gray-700">Celebrate when it opens</span>
      <input type="checkbox" checked={Boolean(design.celebrate)} onChange={(event) => patchDesign({ celebrate: event.target.checked || undefined })} />
    </label>
    <TextField label="Move on after (seconds)" type="number" value={seconds} onChange={(value) => patchDesign({ auto_advance_ms: Number(value) > 0 ? Math.round(Number(value) * 1000) : undefined })} />
    {seconds ? <p className="text-xs leading-5 text-gray-500">Learners tap to skip ahead or go back, and hold to pause. Pages with questions wait for an answer.</p> : null}
  </>
}

const isContinueButton = (block: any) => block.type === 'button' && block.content?.action !== 'revisit'
const hasChoices = (block: any) => block.type === 'question' && ['multiple_choice', 'categorized_multi_select'].includes(block.kind)

/** A block's entrance, a continue button's placement, and a choice question's style. */
export function BlockDesignFields({ block, onPatchBlock }: { block: any; onPatchBlock: (id: string, patch: any) => void }) {
  const design = block.design || {}
  const patchDesign = (patch: any) => onPatchBlock(block.id, { design: compact({ ...design, ...patch }) || {} })
  const options: any[] = Array.isArray(block.content?.options) ? block.content.options : []
  const patchOption = (id: string, patch: any) => onPatchBlock(block.id, { content: { ...(block.content || {}), options: options.map((option) => option.id === id ? compact({ ...option, ...patch }) : option) } })
  return <InspectorSection label="Motion and placement">
    <SegmentedControl label="Entrance" value={design.entrance || 'rise'} options={[{ value: 'rise', label: 'Rise' }, { value: 'fade', label: 'Fade' }, { value: 'none', label: 'None' }]} onChange={(entrance) => patchDesign({ entrance: entrance === 'rise' ? undefined : entrance })} />
    {isContinueButton(block) ? <SegmentedControl label="Placement" value={design.placement === 'footer' ? 'footer' : 'inline'} options={[{ value: 'inline', label: 'In the page' }, { value: 'footer', label: 'Footer' }]} onChange={(placement) => patchDesign({ placement: placement === 'footer' ? 'footer' : undefined })} /> : null}
    {hasChoices(block) ? <SelectField label="Choice style" value={design.style || 'list'} options={[{ value: 'list', label: 'List' }, { value: 'pills', label: 'Pills' }, { value: 'scale', label: 'Scale' }, { value: 'cards', label: 'Cards' }]} onChange={(style) => patchDesign({ style: style === 'list' ? undefined : style })} /> : null}
    {hasChoices(block) && ['cards', 'pills', 'scale'].includes(design.style) ? options.map((option, index) => (
      <div key={option.id || index} className="grid grid-cols-[3.5rem_1fr] gap-2">
        <input aria-label={`Option ${index + 1} icon`} value={option.icon || ''} onChange={(event) => patchOption(option.id, { icon: event.target.value })} placeholder="🙂" className="h-9 rounded-lg border border-gray-200 px-2 text-center text-sm" />
        {design.style === 'cards'
          ? <input aria-label={`Option ${index + 1} description`} value={option.description || ''} onChange={(event) => patchOption(option.id, { description: event.target.value })} placeholder={`${option.text || `Option ${index + 1}`}: description`} className="h-9 min-w-0 rounded-lg border border-gray-200 px-2 text-xs" />
          : <span className="truncate self-center text-xs text-gray-500">{option.text || `Option ${index + 1}`}</span>}
      </div>
    )) : null}
  </InspectorSection>
}

/** The activity's defaults: its background, progress style and exit. */
export function ActivityDesignFields({ activity, pages, onPatchActivity }: { activity: any; pages: any[]; onPatchActivity: (patch: any) => void }) {
  const settings = activity.settings || {}
  const design = settings.design || {}
  const patchDesign = (patch: any) => onPatchActivity({ settings: { ...settings, design: compact({ ...design, ...patch }) || {} } })
  const exit = design.exit || {}
  const patchExit = (patch: any) => patchDesign({ exit: compact({ ...exit, ...patch }) })
  return <section>
    <h2 className="text-lg font-bold">Design</h2>
    <p className="mt-1 text-sm text-gray-500">Defaults for every page. A page&apos;s own background replaces these.</p>
    <div className="mt-5 space-y-4">
      <BackgroundFields background={design.background} fallback="#ffffff" onChange={(background) => patchDesign({ background })} />
      <SegmentedControl label="Progress" value={design.progress === 'segments' ? 'segments' : 'bar'} options={[{ value: 'bar', label: 'Bar' }, { value: 'segments', label: 'Segments' }]} onChange={(progress) => patchDesign({ progress: progress === 'segments' ? 'segments' : undefined })} />
      <TextField label="Exit button label" value={exit.label || ''} onChange={(label) => patchExit({ label })} />
      <TextField label="Ask before leaving" value={exit.confirm || ''} onChange={(confirm) => patchExit({ confirm })} />
      <SelectField label="Exit goes to" value={exit.to_page_uuid || ''} options={[{ value: '', label: 'Close the activity' }, ...pages.map((page: any) => ({ value: page.page_uuid, label: page.title || 'Untitled page' }))]} onChange={(to_page_uuid) => patchExit({ to_page_uuid })} />
      <p className="text-xs leading-5 text-gray-500">Leave the label empty for a plain X. Jumping to a page works when that page is still ahead of the learner.</p>
    </div>
  </section>
}
