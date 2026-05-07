'use client'

import {
  BookOpen,
  Bookmark,
  Briefcase,
  Code2,
  Compass,
  FlaskConical,
  FolderOpen,
  Globe2,
  GraduationCap,
  Heart,
  LayoutDashboard,
  Lightbulb,
  Map,
  Microscope,
  Palette,
  Rocket,
  Shield,
  Sparkles,
  Star,
  Target,
  Trophy,
  Zap,
  type LucideIcon,
} from 'lucide-react'

export type ChannelIconOption = {
  name: string
  Icon: LucideIcon
}

export type ChannelColorOption = {
  name: string
  background: string
  iconColor: string
}

export const channelIconOptions: ChannelIconOption[] = [
  { name: 'FolderOpen', Icon: FolderOpen },
  { name: 'BookOpen', Icon: BookOpen },
  { name: 'Star', Icon: Star },
  { name: 'Sparkles', Icon: Sparkles },
  { name: 'Lightbulb', Icon: Lightbulb },
  { name: 'Target', Icon: Target },
  { name: 'Trophy', Icon: Trophy },
  { name: 'Briefcase', Icon: Briefcase },
  { name: 'GraduationCap', Icon: GraduationCap },
  { name: 'Compass', Icon: Compass },
  { name: 'Map', Icon: Map },
  { name: 'Rocket', Icon: Rocket },
  { name: 'FlaskConical', Icon: FlaskConical },
  { name: 'Code2', Icon: Code2 },
  { name: 'Palette', Icon: Palette },
  { name: 'Heart', Icon: Heart },
  { name: 'Shield', Icon: Shield },
  { name: 'Zap', Icon: Zap },
  { name: 'LayoutDashboard', Icon: LayoutDashboard },
  { name: 'Microscope', Icon: Microscope },
]

export const savedChannelIcon = Bookmark
export const allResourcesChannelIcon = Globe2

export const channelColorOptions: ChannelColorOption[] = [
  { name: 'Obsidian', background: '#111827', iconColor: '#f9fafb' },
  { name: 'Slate', background: '#334155', iconColor: '#e2e8f0' },
  { name: 'Mist', background: '#e5e7eb', iconColor: '#374151' },
  { name: 'Porcelain', background: '#f8fafc', iconColor: '#0f172a' },
  { name: 'Red', background: '#ef4444', iconColor: '#ffffff' },
  { name: 'Clay', background: '#fecaca', iconColor: '#b91c1c' },
  { name: 'Orange', background: '#f97316', iconColor: '#ffffff' },
  { name: 'Honey', background: '#fde68a', iconColor: '#a16207' },
  { name: 'Green', background: '#22c55e', iconColor: '#052e16' },
  { name: 'Sage', background: '#bbf7d0', iconColor: '#166534' },
  { name: 'Blue', background: '#3b82f6', iconColor: '#ffffff' },
  { name: 'Violet', background: '#ddd6fe', iconColor: '#6d28d9' },
  { name: 'Aurora', background: 'linear-gradient(135deg, #06b6d4 0%, #8b5cf6 100%)', iconColor: '#f0fdfa' },
  { name: 'Ember', background: 'linear-gradient(135deg, #f97316 0%, #ec4899 100%)', iconColor: '#fff7ed' },
  { name: 'Lagoon', background: 'linear-gradient(135deg, #14b8a6 0%, #2563eb 100%)', iconColor: '#ccfbf1' },
  { name: 'Punch', background: 'linear-gradient(135deg, #f43f5e 0%, #facc15 100%)', iconColor: '#4c0519' },
  { name: 'Grape', background: 'linear-gradient(135deg, #7c3aed 0%, #db2777 100%)', iconColor: '#faf5ff' },
  { name: 'Volt', background: 'linear-gradient(135deg, #84cc16 0%, #06b6d4 100%)', iconColor: '#164e63' },
  { name: 'Nightfall', background: 'linear-gradient(135deg, #0f172a 0%, #4338ca 100%)', iconColor: '#a7f3d0' },
  { name: 'Sunrise', background: 'linear-gradient(135deg, #f59e0b 0%, #ef4444 55%, #8b5cf6 100%)', iconColor: '#fff7ed' },
]

export function getChannelIcon(icon?: string | null) {
  return channelIconOptions.find((option) => option.name === icon)?.Icon || FolderOpen
}

export function ResourceChannelStyleIcon({
  icon,
  color,
  iconColor,
  size = 16,
  className = '',
}: {
  icon?: string | null
  color?: string | null
  iconColor?: string | null
  size?: number
  className?: string
}) {
  const Icon = getChannelIcon(icon)
  const hasStyle = Boolean(icon && color && iconColor)

  if (!hasStyle) {
    return (
      <div className={`flex items-center justify-center bg-gray-100 text-gray-400 ${className}`}>
        <FolderOpen size={size} />
      </div>
    )
  }

  return (
    <div
      className={`flex items-center justify-center shadow-sm ring-1 ring-black/5 ${className}`}
      style={{ background: color || undefined }}
    >
      <Icon size={size} style={{ color: iconColor || undefined }} />
    </div>
  )
}
