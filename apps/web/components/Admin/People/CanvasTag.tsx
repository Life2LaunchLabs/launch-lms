import { GraduationCap } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Marks what came from the school's Canvas: a course's group, or an invitation from its class list (DEV-193). */
export function CanvasTag({ className }: { className?: string }) {
  return <span title="From Canvas" className={cn('inline-flex shrink-0 items-center gap-1 rounded-full bg-rose-500/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-rose-700 dark:text-rose-300', className)}>
    <GraduationCap size={11} aria-hidden="true" />Canvas
  </span>
}
