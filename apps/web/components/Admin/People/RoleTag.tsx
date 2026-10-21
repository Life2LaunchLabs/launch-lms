import { cn } from '@/lib/utils'
import { ROLE_LABELS, type OrgRole } from '@services/school/people'

const ROLE_TONES: Record<OrgRole, string> = {
  admin: 'bg-foreground text-background',
  staff: 'bg-[var(--org-primary-color)]/15 text-foreground',
  learner: 'bg-muted text-muted-foreground',
  helper: 'bg-amber-100 text-amber-800',
}

/** What someone is to the organization (or to a group): Admin, Staff, Learner or Helper. */
export function RoleTag({ role }: { role: OrgRole }) {
  return <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wide', ROLE_TONES[role])}>{ROLE_LABELS[role]}</span>
}
