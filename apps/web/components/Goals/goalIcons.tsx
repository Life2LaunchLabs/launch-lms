import { BookOpen, Briefcase, CalendarDays, Code2, Compass, Dumbbell, Flag, GraduationCap, Heart, Home, Leaf, MessageCircle, Music, Palette, Rocket, Star, Target, Wallet } from 'lucide-react'
import type { GoalIcon } from '@services/goals/types'

import { tr } from '@/lib/tr'
/** Each mark a learner can give their goal, in the order the picker shows them. */
export const GOAL_ICONS: Array<{ key: GoalIcon; label: string; icon: React.ElementType }> = [
  { key: 'target', get label() { return tr('goals.goal_icons.target', 'Target') }, icon: Target },
  { key: 'book', get label() { return tr('goals.goal_icons.book', 'Book') }, icon: BookOpen },
  { key: 'briefcase', get label() { return tr('goals.goal_icons.briefcase', 'Briefcase') }, icon: Briefcase },
  { key: 'graduation', get label() { return tr('goals.goal_icons.graduation_cap', 'Graduation cap') }, icon: GraduationCap },
  { key: 'heart', get label() { return tr('goals.goal_icons.heart', 'Heart') }, icon: Heart },
  { key: 'dumbbell', get label() { return tr('goals.goal_icons.dumbbell', 'Dumbbell') }, icon: Dumbbell },
  { key: 'palette', get label() { return tr('goals.goal_icons.palette', 'Palette') }, icon: Palette },
  { key: 'music', get label() { return tr('goals.goal_icons.music', 'Music') }, icon: Music },
  { key: 'code', get label() { return tr('goals.goal_icons.code', 'Code') }, icon: Code2 },
  { key: 'leaf', get label() { return tr('goals.goal_icons.leaf', 'Leaf') }, icon: Leaf },
  { key: 'home', get label() { return tr('goals.goal_icons.home', 'Home') }, icon: Home },
  { key: 'rocket', get label() { return tr('goals.goal_icons.rocket', 'Rocket') }, icon: Rocket },
  { key: 'wallet', get label() { return tr('goals.goal_icons.wallet', 'Wallet') }, icon: Wallet },
  { key: 'compass', get label() { return tr('goals.goal_icons.compass', 'Compass') }, icon: Compass },
  { key: 'calendar', get label() { return tr('goals.goal_icons.calendar', 'Calendar') }, icon: CalendarDays },
  { key: 'star', get label() { return tr('goals.goal_icons.star', 'Star') }, icon: Star },
  { key: 'flag', get label() { return tr('goals.goal_icons.flag', 'Flag') }, icon: Flag },
  { key: 'chat', get label() { return tr('goals.goal_chat.chat', 'Chat') }, icon: MessageCircle },
]

/** A goal's mark; a goal without one shows a target. */
export function GoalIconMark({ icon, size }: { icon?: GoalIcon | null; size: number }) {
  const Icon = (GOAL_ICONS.find((item) => item.key === icon) || GOAL_ICONS[0]).icon
  return <Icon size={size} />
}
