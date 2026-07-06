import React from 'react'
import { Check, Loader2 } from 'lucide-react'
import type { SaveState } from './types'

export function TopModeButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button onClick={onClick} className={`relative h-full px-2 text-sm font-bold ${active ? 'text-[var(--org-primary-color)]' : 'text-gray-500 hover:text-gray-950'}`}>
      {label}
      {active && <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-t-full bg-[var(--org-primary-color)]" />}
    </button>
  )
}

export function SaveStateLabel({ state, lastSavedAt }: { state: SaveState; lastSavedAt: Date | null }) {
  const label = state === 'saving' ? 'Saving' : state === 'dirty' ? 'Unsaved' : state === 'error' ? 'Save failed' : lastSavedAt ? 'Saved' : 'Saved'
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-bold ${state === 'error' ? 'text-red-600' : 'text-gray-500'}`}>
      {state === 'saving' ? <Loader2 size={13} className="animate-spin" /> : state === 'saved' ? <Check size={13} /> : <span className="h-2 w-2 rounded-full bg-current" />}
      {label}
    </span>
  )
}

export function DeviceModeButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button onClick={onClick} className={`flex h-8 items-center justify-center gap-2 rounded-lg text-xs font-bold transition ${active ? 'bg-gray-950 text-white' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-950'}`}>
      {icon}
      {label}
    </button>
  )
}

export function IconButton({ title, active, onClick, children }: { title: string; active?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      onClick={(event) => {
        event.stopPropagation()
        onClick()
      }}
      className={`flex h-8 w-8 items-center justify-center rounded-lg transition ${active ? 'bg-gray-950 text-white' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-950'}`}
    >
      {children}
    </button>
  )
}

export function InspectorSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section>
      <p className="mb-3 text-[11px] font-bold uppercase tracking-wide text-gray-500">{label}</p>
      <div className="space-y-3">{children}</div>
    </section>
  )
}

export function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="mb-1.5 block text-xs font-bold text-gray-600">{children}</label>
}

export function TextField({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full rounded-lg border border-gray-200 px-3 text-sm outline-none focus:border-[var(--org-primary-color)]"
      />
    </div>
  )
}

export function SegmentedControl({ label, value, options, onChange }: { label: string; value: string; options: Array<{ value: string; label?: string; icon?: React.ReactNode }>; onChange: (value: string) => void }) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(0,1fr))] gap-1 rounded-lg border border-gray-200 bg-gray-50 p-1">
        {options.map((option) => (
          <button
            key={option.value}
            onClick={() => onChange(option.value)}
            className={`flex h-8 items-center justify-center gap-1 rounded-md text-xs font-bold ${value === option.value ? 'bg-white text-gray-950 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
          >
            {option.icon}
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}
