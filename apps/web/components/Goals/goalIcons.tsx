import { BookOpen, Briefcase, Code2, Dumbbell, GraduationCap, Heart, Home, Leaf, Music, Palette, Rocket, Target } from 'lucide-react'
import type { GoalIcon } from '@services/goals/types'

/** Each mark a learner can give their goal, in the order the picker shows them. */
export const GOAL_ICONS: Array<{ key: GoalIcon; label: string; icon: React.ElementType }> = [
  { key: 'target', label: 'Target', icon: Target },
  { key: 'book', label: 'Book', icon: BookOpen },
  { key: 'briefcase', label: 'Briefcase', icon: Briefcase },
  { key: 'graduation', label: 'Graduation cap', icon: GraduationCap },
  { key: 'heart', label: 'Heart', icon: Heart },
  { key: 'dumbbell', label: 'Dumbbell', icon: Dumbbell },
  { key: 'palette', label: 'Palette', icon: Palette },
  { key: 'music', label: 'Music', icon: Music },
  { key: 'code', label: 'Code', icon: Code2 },
  { key: 'leaf', label: 'Leaf', icon: Leaf },
  { key: 'home', label: 'Home', icon: Home },
  { key: 'rocket', label: 'Rocket', icon: Rocket },
]

/** A goal's mark; a goal without one shows a target. */
export function GoalIconMark({ icon, size }: { icon?: GoalIcon | null; size: number }) {
  const Icon = (GOAL_ICONS.find((item) => item.key === icon) || GOAL_ICONS[0]).icon
  return <Icon size={size} />
}
