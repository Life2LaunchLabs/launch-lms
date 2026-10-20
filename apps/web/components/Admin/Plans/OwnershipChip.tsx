import React from 'react'
import { Link2, Lock, Pencil } from 'lucide-react'
import { cn } from '@/lib/utils'

export type Ownership = { owned: boolean; canEdit: boolean; ownerName?: string | null }

/** "Yours · you can edit", "Yours · view only", or "Run with permission · <org>": who owns a template or badge, and what the viewer may do with it. */
export function ownershipLabel({ owned, canEdit, ownerName }: Ownership): string {
  if (!owned) return `Run with permission · ${ownerName || 'another organization'}`
  return canEdit ? 'Yours · you can edit' : 'Yours · view only'
}

export default function OwnershipChip({ className, ...ownership }: Ownership & { className?: string }) {
  const { owned, canEdit } = ownership
  const Icon = !owned ? Link2 : canEdit ? Pencil : Lock
  const tone = !owned ? 'bg-violet-100 text-violet-800' : canEdit ? 'bg-green-100 text-green-800' : 'border border-gray-200 bg-white text-gray-700'
  return <span className={cn('inline-flex max-w-full items-center gap-1.5 truncate rounded-full px-2.5 py-1 text-xs font-semibold', tone, className)}>
    <Icon size={12} aria-hidden="true" className="shrink-0" /><span className="truncate">{ownershipLabel(ownership)}</span>
  </span>
}

/** The note under a read-only template or badge: who owns it and what the viewer can still do. */
export function ReadOnlyNote({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p role="note" className={cn('flex items-start gap-2 rounded-xl bg-gray-100 px-4 py-3 text-sm text-gray-700', className)}>
    <Lock size={15} aria-hidden="true" className="mt-0.5 shrink-0 text-gray-500" /><span>{children}</span>
  </p>
}
