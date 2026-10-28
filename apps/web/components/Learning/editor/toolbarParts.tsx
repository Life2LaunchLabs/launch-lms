'use client'

/* eslint-disable no-unused-vars */

import React from 'react'
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ChevronDown,
  Copy,
  Lock,
  Trash2,
  Wand2,
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@components/ui/dropdown-menu'
import { TEXT_COLORS, stepSize } from '@components/Learning/textMarks'


// The small pieces the selection toolbar is built from.

export const MOTIONS = [
  { value: 'rise', label: 'Rise' },
  { value: 'fade', label: 'Fade in' },
  { value: 'pop', label: 'Pop' },
  { value: 'slide_left', label: 'Slide from the left' },
  { value: 'slide_right', label: 'Slide from the right' },
  { value: 'zoom', label: 'Slow zoom' },
  { value: 'none', label: 'None' },
]

export const TRANSITIONS = [
  { value: '', label: "The activity's default" },
  { value: 'slide', label: 'Slide' },
  { value: 'fade', label: 'Fade' },
  { value: 'rise', label: 'Rise' },
  { value: 'none', label: 'None' },
]

export const button = 'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-bold text-gray-700 transition hover:bg-gray-100 disabled:opacity-40'
export const on = 'bg-gray-900 text-white hover:bg-gray-800'

export function Sep() {
  return <span aria-hidden="true" className="mx-1 h-5 w-px shrink-0 bg-gray-200" />
}

export function Tool({ label, active, onClick, children, disabled, title, compact }: { label?: string; active?: boolean; onClick: () => void; children?: React.ReactNode; disabled?: boolean; title?: string; compact?: boolean }) {
  return (
    <button type="button" disabled={disabled} title={title || label} aria-label={title || label} aria-pressed={active} onClick={onClick} className={`${button} ${active ? on : ''}`}>
      {children}
      {label && <span className={compact ? 'hidden @[1080px]/toolbar:inline' : undefined}>{label}</span>}
    </button>
  )
}

export function Menu({ label, icon, children, align = 'start' }: { label: React.ReactNode; icon?: React.ReactNode; children: React.ReactNode; align?: 'start' | 'end' }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className={button}>{icon}{label}<ChevronDown size={13} className="text-gray-400" /></button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="max-h-96 overflow-y-auto">{children}</DropdownMenuContent>
    </DropdownMenu>
  )
}

export function Check({ checked }: { checked: boolean }) {
  return <span className={`ml-auto pl-4 text-xs font-bold ${checked ? 'text-sky-600' : 'text-transparent'}`}>✓</span>
}

/** A small form in a menu: label + input, saved as you type. */
export function FieldsMenu({ label, fields, onChange }: { label: string; fields: Array<{ key: string; label: string; value: string; multiline?: boolean; type?: string }>; onChange: (key: string, value: string) => void }) {
  return (
    <Menu label={label}>
      <div className="w-72 space-y-3 p-2" onKeyDown={(event) => event.stopPropagation()}>
        {fields.map((field) => (
          <label key={field.key} className="block">
            <span className="mb-1 block text-xs font-bold text-gray-500">{field.label}</span>
            {field.multiline ? (
              <textarea value={field.value} onChange={(event) => onChange(field.key, event.target.value)} className="min-h-28 w-full rounded-lg border border-gray-200 bg-white p-2 text-sm outline-none focus:border-sky-400" />
            ) : (
              <input type={field.type || 'text'} value={field.value} onChange={(event) => onChange(field.key, event.target.value)} className="h-9 w-full rounded-lg border border-gray-200 bg-white px-2 text-sm outline-none focus:border-sky-400" />
            )}
          </label>
        ))}
      </div>
    </Menu>
  )
}

/** Re-renders when the text editor's selection or marks change. */
export function useEditorTick(editor: any) {
  const [, setTick] = React.useState(0)
  React.useEffect(() => {
    if (!editor) return
    const bump = () => setTick((value) => value + 1)
    editor.on('transaction', bump)
    return () => { editor.off('transaction', bump) }
  }, [editor])
}

/** Apply a mark change to the selected words, or to the whole block when nothing is selected. */
export function styleText(editor: any, apply: (chain: any) => any) {
  if (!editor) return
  const { from, to, empty } = editor.state.selection
  if (empty) apply(editor.chain().focus().selectAll()).setTextSelection({ from, to }).run()
  else apply(editor.chain().focus()).run()
}

export function TextTools({ editor }: { editor: any }) {
  useEditorTick(editor)
  if (!editor) return <span className="px-2 text-xs text-gray-400">Click into the text to style it.</span>
  const attrs = editor.getAttributes('textStyle') || {}
  const size = Number(attrs.fontSize) || 16
  const align = (editor.isActive('heading') ? editor.getAttributes('heading') : editor.getAttributes('paragraph'))?.textAlign || 'left'
  const setSize = (next: number) => styleText(editor, (chain) => chain.setMark('textStyle', { fontSize: next === 16 ? null : next }))
  const setAlign = (value: string) => {
    const next = value === 'left' ? { textAlign: null } : { textAlign: value }
    const { from, to, empty } = editor.state.selection
    const chain = editor.chain().focus()
    ;(empty ? chain.selectAll() : chain).updateAttributes('paragraph', next).updateAttributes('heading', next).setTextSelection({ from, to }).run()
  }
  return (
    <>
      <span className="flex h-8 shrink-0 items-center rounded-lg border border-gray-200" title="Size">
        <button type="button" aria-label="Smaller" onClick={() => setSize(stepSize(size, -1))} className="h-full px-2 text-sm font-bold text-gray-600 hover:bg-gray-100">−</button>
        <span className="w-8 text-center text-xs font-bold tabular-nums text-gray-700">{size}</span>
        <button type="button" aria-label="Bigger" onClick={() => setSize(stepSize(size, 1))} className="h-full px-2 text-sm font-bold text-gray-600 hover:bg-gray-100">+</button>
      </span>
      <Tool title="Bold" active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}><b>B</b></Tool>
      <Tool title="Italic" active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}><i className="font-serif">I</i></Tool>
      {editor.can().toggleUnderline?.() !== undefined && <Tool title="Underline" active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()}><u>U</u></Tool>}
      <ColorMenu value={attrs.color || ''} onPick={(color) => styleText(editor, (chain) => chain.setMark('textStyle', { color: color || null }))} />
      <Sep />
      {(['left', 'center', 'right'] as const).map((value) => {
        const Icon = value === 'left' ? AlignLeft : value === 'center' ? AlignCenter : AlignRight
        return <Tool key={value} title={`Align ${value}`} active={align === value} onClick={() => setAlign(value)}><Icon size={15} /></Tool>
      })}
    </>
  )
}

export function ColorMenu({ value, onPick }: { value: string; onPick: (color: string) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" title="Text colour" aria-label="Text colour" className={button}>
          <span className="flex flex-col items-center leading-none"><span className="text-[13px] font-black">A</span><i className="mt-0.5 block h-1 w-4 rounded-full" style={{ background: value || 'currentColor' }} /></span>
          <ChevronDown size={13} className="text-gray-400" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuLabel className="text-xs text-gray-500">Colour</DropdownMenuLabel>
        <div className="grid grid-cols-4 gap-1.5 p-2">
          {TEXT_COLORS.map((color) => (
            <DropdownMenuItem key={color.label} onSelect={() => onPick(color.value)} title={color.label} aria-label={color.label} className={`h-8 w-8 cursor-pointer rounded-full border-2 p-0 ${value === color.value ? 'border-sky-500' : 'border-gray-200'}`} style={{ background: color.value || 'linear-gradient(135deg, #fff 45%, #0f172a 55%)' }} />
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function MotionMenu({ block, onPatch }: { block: any; onPatch: (patch: any) => void }) {
  const current = block.design?.motion || block.design?.entrance || 'rise'
  const label = MOTIONS.find((item) => item.value === current)?.label || 'Rise'
  return (
    <Menu label={<span>Motion: {label}</span>} icon={<Wand2 size={14} />}>
      {MOTIONS.map((item) => (
        <DropdownMenuItem key={item.value} onClick={() => onPatch({ design: { ...(block.design || {}), motion: item.value, entrance: undefined } })}>
          {item.label}<Check checked={current === item.value} />
        </DropdownMenuItem>
      ))}
      <DropdownMenuSeparator />
      <div className="flex items-center justify-between gap-3 px-2 py-1.5 text-sm" onKeyDown={(event) => event.stopPropagation()}>
        <span>Wait first (seconds)</span>
        <input type="number" min={0} max={10} step={0.1} value={block.design?.motion_delay ?? ''} placeholder="0" onChange={(event) => onPatch({ design: { ...(block.design || {}), motion_delay: event.target.value === '' ? undefined : Math.max(0, Math.min(10, Number(event.target.value))) } })} className="h-8 w-16 rounded-md border border-gray-200 bg-white px-2 text-sm" />
      </div>
    </Menu>
  )
}

export function RowActions({ block, onDuplicate, onRemove, lockedReason }: { block: any; onDuplicate: () => void; onRemove: () => void; lockedReason?: string }) {
  return (
    <>
      <Sep />
      {lockedReason ? <span title={lockedReason} className="flex h-8 items-center gap-1 px-2 text-xs font-bold text-gray-400"><Lock size={13} /> {lockedReason}</span> : (
        <>
          <Tool title="Duplicate" onClick={onDuplicate}><Copy size={15} /></Tool>
          <Tool title="Delete" onClick={onRemove}><Trash2 size={15} className="text-red-500" /></Tool>
        </>
      )}
    </>
  )
}

export function Name({ children }: { children: React.ReactNode }) {
  return <span className="shrink-0 rounded-md bg-gray-100 px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-gray-500">{children}</span>
}

/** The one toolbar above the canvas. It shows what can be done to whatever is selected: the page, or one block. */
