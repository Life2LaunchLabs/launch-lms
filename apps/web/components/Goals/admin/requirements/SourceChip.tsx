import { Lock, PencilSimple } from '@phosphor-icons/react'
import type { FrameworkListItem } from '@services/goals/requirements'
import { cn } from '@/lib/utils'

/** Yours (editable, or view only for staff), or a copy of another publisher's framework, still yours to edit. */
export default function SourceChip({ item }: { item: Pick<FrameworkListItem, 'publisher' | 'can_edit'> }) {
  const chip = 'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold'
  if (!item.publisher || item.publisher.yours) {
    return item.can_edit
      ? <span className={cn(chip, 'bg-green-50 text-green-700')}><PencilSimple size={12} aria-hidden="true" />Yours · you can edit</span>
      : <span className={cn(chip, 'border border-gray-200 text-gray-700')}><Lock size={12} aria-hidden="true" />Yours · view only</span>
  }
  return <span className={cn(chip, 'border border-gray-200 text-gray-700')}>{item.can_edit ? <PencilSimple size={12} aria-hidden="true" /> : <Lock size={12} aria-hidden="true" />}Published by {item.publisher.name}{item.can_edit ? ' · your copy to edit' : ' · view only'}</span>
}
