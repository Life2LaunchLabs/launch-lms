import { Lock, PencilSimple } from '@phosphor-icons/react'
import type { FrameworkListItem } from '@services/goals/requirements'
import { cn } from '@/lib/utils'

/** View only (for staff), or a copy of another publisher's framework. Yours to edit is the norm and gets no chip. */
export default function SourceChip({ item }: { item: Pick<FrameworkListItem, 'publisher' | 'can_edit'> }) {
  const chip = 'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold'
  if (!item.publisher || item.publisher.yours) {
    return item.can_edit
      ? null
      : <span className={cn(chip, 'border border-gray-200 text-gray-700')}><Lock size={12} aria-hidden="true" />Yours · view only</span>
  }
  return <span className={cn(chip, 'border border-gray-200 text-gray-700')}>{item.can_edit ? <PencilSimple size={12} aria-hidden="true" /> : <Lock size={12} aria-hidden="true" />}Published by {item.publisher.name}{item.can_edit ? ' · your copy to edit' : ' · view only'}</span>
}
