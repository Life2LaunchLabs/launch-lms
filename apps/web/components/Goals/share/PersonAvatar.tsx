import { cn } from '@/lib/utils'
import { getUserAvatarMediaDirectory } from '@services/media/media'
import type { GoalPerson } from '@services/goals/sharing'

/** A person's avatar, or their initials when they have none. */
export function PersonAvatar({ user, size = 'sm' }: { user: GoalPerson | null | undefined; size?: 'xs' | 'sm' | 'md' | 'lg' }) {
  const classes = size === 'lg' ? 'h-12 w-12 text-sm' : size === 'md' ? 'h-9 w-9 text-xs' : size === 'xs' ? 'h-5 w-5 text-[8px]' : 'h-7 w-7 text-[9px]'
  const image = user?.avatar_image ? String(user.avatar_image) : ''
  const src = image ? (image.startsWith('http') ? image : getUserAvatarMediaDirectory(user?.user_uuid || '', image)) : ''
  if (src) return <img src={src} alt="" className={cn('shrink-0 rounded-full object-cover', classes)} />
  const initials = String(user?.name || '?').split(/\s+/).slice(0, 2).map((word) => word[0]).join('').toUpperCase()
  return <span className={cn('flex shrink-0 items-center justify-center rounded-full bg-foreground font-black text-background', classes)}>{initials}</span>
}
