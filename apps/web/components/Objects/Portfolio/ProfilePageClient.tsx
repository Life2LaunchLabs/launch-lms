'use client'

import React, { useEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import {
  Award,
  ArrowRight,
  BookOpen,
  Bold,
  Camera,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  FileText,
  Globe,
  Heading1,
  Heading2,
  Heart,
  Image as ImageIcon,
  Instagram,
  Italic,
  Link2,
  Linkedin,
  List,
  ListOrdered,
  Loader2,
  Lock,
  Pencil,
  Plus,
  Quote,
  RemoveFormatting,
  Share2,
  Sparkles,
  Text,
  Trash2,
  Upload,
  Underline,
  Youtube,
  X,
  Circle,
  Zap,
} from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import GridLayout, { type Layout as ReactGridLayoutItems, verticalCompactor } from 'react-grid-layout'
import { toast } from 'react-hot-toast'
import { Button, buttonVariants } from '@components/ui/button'
import { Card } from '@components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@components/ui/dropdown-menu'
import { Input } from '@components/ui/input'
import { Textarea } from '@components/ui/textarea'
import { normalizeAchievements, ProfileAchievementsSection } from '@components/Objects/Portfolio/ProfileAchievements'
import {
  createEmptyFeaturedCard,
  FeaturedCarousel,
  normalizeFeatured,
  type FeaturedSection,
} from '@components/Objects/Portfolio/ProfilePortfolio'
import ProfileTimeline, { normalizeTimeline, type TimelineEntry } from '@components/Objects/Portfolio/ProfileTimeline'
import ContentPageHeader from '@components/Objects/StyledElements/Headers/ContentPageHeader'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { getAPIUrl, getUriWithOrg, routePaths } from '@services/config/config'
import { getUserAvatarMediaDirectory, getUserProfileFeaturedMediaDirectory } from '@services/media/media'
import { devSeedProfile, updateProfile } from '@services/settings/portfolio'
import { updateUserAvatar, uploadUserProfileFeaturedImage } from '@services/users/users'
import { swrFetcher } from '@services/utils/ts/requests'
import QuizResultsView from '@components/Objects/Activities/Quiz/Player/QuizResultsView'
import { defaultChapterIconName, getChannelIcon } from '@components/Resources/ResourceChannelStyle'

type SocialType = 'website' | 'linkedin' | 'instagram' | 'youtube' | 'x'

type SocialLink = {
  type: SocialType
  url: string
}

type ProfileHeader = {
  coverImage?: string
  socials?: SocialLink[]
}

type ProfileWidgetType = 'timeline' | 'portfolio' | 'achievements' | 'values' | 'strengths' | 'coreCourse' | 'coreQuiz' | 'instagramPreview' | 'youtubePreview' | 'title' | 'text' | 'link' | 'media'

type ProfileLayoutItem = {
  id: string
  type: ProfileWidgetType
  courseUuid?: string
  activityUuid?: string
  questionUuid?: string
  hiddenQuestionUuids?: string[]
  grid?: ProfileGridPosition
  mobileGrid?: ProfileGridPosition
}

type ProfileGridPosition = {
  x: number
  y: number
  w: number
  h: number
}

type ProfileGridKey = 'grid' | 'mobileGrid'

type ProfileCustomSection = {
  id: string
  type: ProfileWidgetType
  title?: string
  body?: string
  url?: string
  mediaUrl?: string
}

type ProfileShape = {
  header?: ProfileHeader
  featured?: FeaturedSection
  achievements?: any
  values?: string[]
  strengths?: string[]
  timelineEnabled?: boolean
  timelinePublicVisible?: boolean
  timeline?: any[]
  layout?: ProfileLayoutItem[]
  sections?: ProfileCustomSection[]
}

type ProfilePageClientProps = {
  initialUser: any
  orgslug: string
  profileUsername?: string
  editMode?: boolean
  initialTab?: ProfileTab
  mode: 'owner' | 'public'
  isSelf?: boolean
  orgConfig?: any
  orgId?: string | number
  collections?: any[]
}

type OwnerProfilePageClientProps = Omit<ProfilePageClientProps, 'mode' | 'isSelf'>
type PublicProfilePageClientProps = Omit<ProfilePageClientProps, 'mode' | 'editMode'>
type ProfileTab = 'overview' | 'timeline'

type SocialPreviewItem = {
  id: string
  title: string
  url: string
  thumbnailUrl?: string
}

const SOCIAL_CONFIG: Record<SocialType, {
  label: string
  placeholder: string
  icon: React.ComponentType<{ className?: string }>
  hostPattern: RegExp
  inputPrefix: string
  inputPlaceholder: string
}> = {
  website: {
    label: 'Website',
    placeholder: 'https://example.com',
    icon: Globe,
    hostPattern: /.+/,
    inputPrefix: 'https://',
    inputPlaceholder: 'your-site.com',
  },
  linkedin: {
    label: 'LinkedIn',
    placeholder: 'https://linkedin.com/in/username',
    icon: Linkedin,
    hostPattern: /(^|\.)linkedin\.com$/i,
    inputPrefix: 'linkedin.com/in/',
    inputPlaceholder: 'username',
  },
  instagram: {
    label: 'Instagram',
    placeholder: 'https://instagram.com/username',
    icon: Instagram,
    hostPattern: /(^|\.)instagram\.com$/i,
    inputPrefix: '@',
    inputPlaceholder: 'username',
  },
  youtube: {
    label: 'YouTube',
    placeholder: 'https://youtube.com/@username',
    icon: Youtube,
    hostPattern: /(^|\.)youtube\.com$|(^|\.)youtu\.be$/i,
    inputPrefix: '@',
    inputPlaceholder: 'username',
  },
  x: {
    label: 'X',
    placeholder: 'https://x.com/username',
    icon: X,
    hostPattern: /(^|\.)x\.com$|(^|\.)twitter\.com$/i,
    inputPrefix: '@',
    inputPlaceholder: 'username',
  },
}

const UNIQUE_PROFILE_WIDGETS: ProfileWidgetType[] = ['timeline', 'portfolio', 'achievements', 'values', 'strengths', 'instagramPreview', 'youtubePreview']
const DISABLED_PROFILE_WIDGETS = new Set<ProfileWidgetType>(['coreCourse', 'coreQuiz'])
const DEFAULT_PROFILE_LAYOUT: ProfileLayoutItem[] = [
  { id: 'timeline', type: 'timeline' },
  { id: 'portfolio', type: 'portfolio' },
  { id: 'achievements', type: 'achievements' },
  { id: 'values', type: 'values' },
  { id: 'strengths', type: 'strengths' },
]
const PROFILE_GRID_COLS = 2
const PROFILE_GRID_MARGIN: readonly [number, number] = [24, 24]
const PROFILE_GRID_ROW_HEIGHT = 131
const PROFILE_GRID_DROP_SIZE: Pick<ProfileGridPosition, 'w' | 'h'> = { w: 1, h: 1 }
const PROFILE_TOP_FIVE_LIMIT = 5

type ProfileTopFiveKind = 'values' | 'strengths'

type ProfileTopFiveCategory = {
  title: string
  items: string[]
}

const PROFILE_VALUES_CATEGORIES: ProfileTopFiveCategory[] = [
  { title: 'Personal Qualities', items: ['Authenticity', 'Creativity', 'Mindfulness', 'Responsibility', 'Self-discipline'] },
  { title: 'Relationships', items: ['Kindness', 'Empathy', 'Loyalty', 'Respect', 'Trust'] },
  { title: 'Growth', items: ['Curiosity', 'Learning', 'Courage', 'Resilience', 'Reflection'] },
  { title: 'Impact', items: ['Service', 'Leadership', 'Justice', 'Community', 'Stewardship'] },
]

const PROFILE_STRENGTHS_CATEGORIES: ProfileTopFiveCategory[] = [
  { title: 'Thinking', items: ['Analysis', 'Strategy', 'Problem solving', 'Systems thinking', 'Decision making'] },
  { title: 'Creating', items: ['Storytelling', 'Design sense', 'Experimentation', 'Originality', 'Making ideas real'] },
  { title: 'Working With Others', items: ['Collaboration', 'Facilitation', 'Mentoring', 'Listening', 'Conflict navigation'] },
  { title: 'Execution', items: ['Focus', 'Follow-through', 'Organization', 'Adaptability', 'Initiative'] },
]

const PROFILE_WIDGET_CONFIG: Record<ProfileWidgetType, {
  label: string
  icon: React.ComponentType<{ className?: string }>
  unique: boolean
}> = {
  timeline: { label: 'Timeline', icon: ChevronRight, unique: true },
  portfolio: { label: 'Portfolio', icon: FileText, unique: true },
  achievements: { label: 'Badges', icon: Award, unique: true },
  values: { label: 'My Values', icon: Heart, unique: true },
  strengths: { label: 'My Strengths', icon: Zap, unique: true },
  coreCourse: { label: 'CORE Course', icon: BookOpen, unique: false },
  coreQuiz: { label: 'Quiz Result', icon: BookOpen, unique: false },
  instagramPreview: { label: 'Instagram', icon: Instagram, unique: true },
  youtubePreview: { label: 'YouTube', icon: Youtube, unique: true },
  title: { label: 'Title', icon: Heading1, unique: false },
  text: { label: 'Text', icon: Text, unique: false },
  link: { label: 'Link', icon: Link2, unique: false },
  media: { label: 'Media', icon: ImageIcon, unique: false },
}

function createProfileLayoutItem(type: ProfileWidgetType, courseUuid?: string, activityUuid?: string, questionUuid?: string): ProfileLayoutItem {
  if (type === 'coreCourse' && courseUuid) return { id: `coreCourse-${courseUuid}`, type, courseUuid }
  if (type === 'coreQuiz' && courseUuid && activityUuid) {
    return {
      id: questionUuid ? `coreQuiz-${activityUuid}-${questionUuid}` : `coreQuiz-${activityUuid}`,
      type,
      courseUuid,
      activityUuid,
      questionUuid,
      hiddenQuestionUuids: [],
    }
  }
  if (UNIQUE_PROFILE_WIDGETS.includes(type)) return { id: type, type }
  return { id: `${type}-${Date.now()}-${Math.random().toString(16).slice(2)}`, type }
}

function createProfileSection(item: ProfileLayoutItem): ProfileCustomSection | null {
  if (item.type === 'coreCourse' || item.type === 'coreQuiz') return null
  if (UNIQUE_PROFILE_WIDGETS.includes(item.type)) return null
  return {
    id: item.id,
    type: item.type,
    title: item.type === 'title' ? 'Untitled section' : '',
    body: '',
    url: '',
    mediaUrl: '',
  }
}

function getProfileGridDefaultSize(type: ProfileWidgetType): Pick<ProfileGridPosition, 'w' | 'h'> {
  if (type === 'title' || type === 'link') return { w: 2, h: 1 }
  if (type === 'text' || type === 'media') return { w: 1, h: 2 }
  if (type === 'achievements') return { w: 2, h: 2 }
  if (type === 'instagramPreview' || type === 'youtubePreview') return { w: 2, h: 3 }
  if (type === 'coreQuiz' || type === 'coreCourse') return { w: 2, h: 3 }
  return { w: 2, h: 3 }
}

function getProfileGridDropSize(cols: number): Pick<ProfileGridPosition, 'w' | 'h'> {
  return { w: Math.min(cols, PROFILE_GRID_DROP_SIZE.w), h: PROFILE_GRID_DROP_SIZE.h }
}

function getElementContentBox(element: HTMLElement) {
  const rect = element.getBoundingClientRect()
  const style = window.getComputedStyle(element)
  const paddingLeft = Number.parseFloat(style.paddingLeft) || 0
  const paddingRight = Number.parseFloat(style.paddingRight) || 0
  const paddingTop = Number.parseFloat(style.paddingTop) || 0
  return {
    left: rect.left + paddingLeft,
    top: rect.top + paddingTop,
    width: Math.max(0, rect.width - paddingLeft - paddingRight),
  }
}

function clampProfileGridPosition(
  grid: Partial<ProfileGridPosition> | undefined,
  type: ProfileWidgetType,
  index: number,
  cols = PROFILE_GRID_COLS
): ProfileGridPosition {
  const defaults = getProfileGridDefaultSize(type)
  const w = Math.min(cols, Math.max(1, Number(grid?.w || defaults.w)))
  const h = type === 'achievements'
    ? defaults.h
    : Math.min(3, Math.max(1, Number(grid?.h || defaults.h)))
  const x = Math.min(cols - w, Math.max(0, Number.isFinite(grid?.x) ? Number(grid?.x) : 0))
  const y = Math.max(0, Number.isFinite(grid?.y) ? Number(grid?.y) : index * defaults.h)
  return { x, y, w, h }
}

function getProfileGridKey(_cols: number): ProfileGridKey {
  return 'mobileGrid'
}

function getProfileGridForItem(
  item: ProfileLayoutItem,
  index: number,
  cols: number,
  gridKey = getProfileGridKey(cols)
) {
  const sourceGrid = gridKey === 'mobileGrid'
    ? item.mobileGrid || item.grid
    : item.grid
  return clampProfileGridPosition(sourceGrid, item.type, index, cols)
}

function profileLayoutToGridLayout(
  layout: ProfileLayoutItem[],
  canEdit: boolean,
  cols = PROFILE_GRID_COLS,
  gridKey = getProfileGridKey(cols)
): ReactGridLayoutItems {
  return layout.map((item, index) => {
    const grid = getProfileGridForItem(item, index, cols, gridKey)
    return {
      i: item.id,
      ...grid,
      minW: 1,
      maxW: cols,
      minH: 1,
      maxH: 3,
      static: !canEdit,
      isDraggable: canEdit,
      isResizable: false,
    }
  })
}

function mergeGridIntoProfile(
  profile: ProfileShape,
  nextGridLayout: ReactGridLayoutItems,
  cols = PROFILE_GRID_COLS,
  gridKey = getProfileGridKey(cols)
): ProfileShape {
  const gridById = new Map(nextGridLayout.map((item) => [item.i, item]))
  const layout = (profile.layout || DEFAULT_PROFILE_LAYOUT).map((item, index) => {
    const gridItem = gridById.get(item.id)
    const grid = gridItem
      ? clampProfileGridPosition(gridItem, item.type, index, cols)
      : getProfileGridForItem(item, index, cols, gridKey)
    return { ...item, [gridKey]: grid }
  })

  return { ...profile, layout }
}

function compactProfileGridLayout(layout: ReactGridLayoutItems, cols = PROFILE_GRID_COLS): ReactGridLayoutItems {
  return verticalCompactor.compact(layout, cols) as ReactGridLayoutItems
}

function normalizeProfileLayout(layout: any): ProfileLayoutItem[] {
  if (!Array.isArray(layout)) return DEFAULT_PROFILE_LAYOUT
  const seenUnique = new Set<ProfileWidgetType>()
  const normalized = layout.reduce<ProfileLayoutItem[]>((items, item) => {
    const type = item?.type as ProfileWidgetType
    if (!PROFILE_WIDGET_CONFIG[type]) return items
    if (DISABLED_PROFILE_WIDGETS.has(type)) return items
    const grid = clampProfileGridPosition(item?.grid, type, items.length)
    if (type === 'coreCourse') {
      const courseUuid = typeof item?.courseUuid === 'string' ? item.courseUuid : ''
      if (!courseUuid) return items
      items.push({
        id: item?.id || createProfileLayoutItem(type, courseUuid).id,
        type,
        courseUuid,
        grid,
        mobileGrid: item?.mobileGrid ? clampProfileGridPosition(item.mobileGrid, type, items.length, PROFILE_GRID_COLS) : undefined,
      })
      return items
    }
    if (type === 'coreQuiz') {
      const courseUuid = typeof item?.courseUuid === 'string' ? item.courseUuid : ''
      const activityUuid = typeof item?.activityUuid === 'string' ? item.activityUuid : ''
      const questionUuid = typeof item?.questionUuid === 'string' ? item.questionUuid : ''
      const hiddenQuestionUuids = Array.isArray(item?.hiddenQuestionUuids)
        ? item.hiddenQuestionUuids.filter((uuid: any) => typeof uuid === 'string')
        : []
      if (!courseUuid || !activityUuid) return items
      items.push({
        id: item?.id || createProfileLayoutItem(type, courseUuid, activityUuid, questionUuid).id,
        type,
        courseUuid,
        activityUuid,
        questionUuid: questionUuid || undefined,
        hiddenQuestionUuids,
        grid,
        mobileGrid: item?.mobileGrid ? clampProfileGridPosition(item.mobileGrid, type, items.length, PROFILE_GRID_COLS) : undefined,
      })
      return items
    }
    if (UNIQUE_PROFILE_WIDGETS.includes(type)) {
      if (seenUnique.has(type)) return items
      seenUnique.add(type)
      items.push({
        id: type,
        type,
        grid,
        mobileGrid: item?.mobileGrid ? clampProfileGridPosition(item.mobileGrid, type, items.length, PROFILE_GRID_COLS) : undefined,
      })
      return items
    }
    items.push({
      id: item?.id || createProfileLayoutItem(type).id,
      type,
      grid,
      mobileGrid: item?.mobileGrid ? clampProfileGridPosition(item.mobileGrid, type, items.length, PROFILE_GRID_COLS) : undefined,
    })
    return items
  }, [])
  return normalized.map((item, index) => ({
    ...item,
    grid: clampProfileGridPosition(item.grid, item.type, index),
    mobileGrid: item.mobileGrid ? clampProfileGridPosition(item.mobileGrid, item.type, index, PROFILE_GRID_COLS) : undefined,
  }))
}

function normalizeProfileTopFive(value: any): string[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  return value.reduce<string[]>((items, item) => {
    const label = String(item || '').trim()
    if (!label || seen.has(label) || items.length >= PROFILE_TOP_FIVE_LIMIT) return items
    seen.add(label)
    items.push(label)
    return items
  }, [])
}

function moveProfileLayoutItem(layout: ProfileLayoutItem[], itemId: string, targetIndex: number) {
  const currentIndex = layout.findIndex((item) => item.id === itemId)
  if (currentIndex === -1) return layout
  const next = Array.from(layout)
  const [item] = next.splice(currentIndex, 1)
  next.splice(Math.max(0, Math.min(targetIndex, next.length)), 0, item)
  return next
}

function normalizeProfile(profile: any): ProfileShape {
  if (!profile) return { header: { socials: [] }, featured: normalizeFeatured(null), achievements: normalizeAchievements(null), values: [], strengths: [], timelineEnabled: false, timeline: [], layout: DEFAULT_PROFILE_LAYOUT, sections: [] }
  if (typeof profile === 'string') {
    try {
      return normalizeProfile(JSON.parse(profile))
    } catch {
      return { header: { socials: [] }, featured: normalizeFeatured(null), achievements: normalizeAchievements(null), values: [], strengths: [], timelineEnabled: false, timeline: [], layout: DEFAULT_PROFILE_LAYOUT, sections: [] }
    }
  }
  return {
    ...profile,
    header: {
      ...(profile.header || {}),
      socials: Array.isArray(profile.header?.socials) ? profile.header.socials : [],
    },
    featured: normalizeFeatured(profile.featured),
    achievements: normalizeAchievements(profile.achievements),
    values: normalizeProfileTopFive(profile.values),
    strengths: normalizeProfileTopFive(profile.strengths),
    timelineEnabled: Boolean(profile.timelineEnabled),
    timeline: normalizeTimeline(profile.timeline),
    layout: normalizeProfileLayout(profile.layout),
    sections: Array.isArray(profile.sections) ? profile.sections : [],
  }
}

function isValidSocialUrl(type: SocialType, value: string) {
  try {
    const url = new URL(value)
    if (!['http:', 'https:'].includes(url.protocol)) return false
    if (type === 'website') return true
    return SOCIAL_CONFIG[type].hostPattern.test(url.hostname)
  } catch {
    return false
  }
}

function getSocialHref(social: SocialLink) {
  if (!social.url) return '#'
  if (/^https?:\/\//i.test(social.url)) return social.url
  return `https://${social.url}`
}

function cleanSocialHandle(value: string) {
  return value
    .trim()
    .replace(/^@+/, '')
    .replace(/^\/+/, '')
    .split(/[/?#]/)[0]
}

function getSocialInputValue(type: SocialType, value: string) {
  const trimmed = value.trim()
  if (!trimmed) return ''

  try {
    const url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`)
    const hostname = url.hostname.replace(/^www\./i, '').toLowerCase()
    const parts = url.pathname.split('/').filter(Boolean)

    if (type === 'website') {
      return `${url.hostname}${url.pathname === '/' ? '' : url.pathname}`.replace(/\/$/, '')
    }
    if (type === 'linkedin' && hostname === 'linkedin.com') {
      return cleanSocialHandle(parts[0] === 'in' ? parts[1] || '' : parts[0] || '')
    }
    if (type === 'instagram' && hostname === 'instagram.com') return cleanSocialHandle(parts[0] || '')
    if (type === 'youtube' && hostname === 'youtube.com') {
      const firstPart = parts[0] || ''
      if (firstPart === 'channel') return cleanSocialHandle(parts[1] || '')
      if (firstPart === 'c' || firstPart === 'user') return cleanSocialHandle(parts[1] || '')
      return cleanSocialHandle(firstPart)
    }
    if (type === 'youtube' && hostname === 'youtu.be') return cleanSocialHandle(parts[0] || '')
    if (type === 'x' && (hostname === 'x.com' || hostname === 'twitter.com')) return cleanSocialHandle(parts[0] || '')
  } catch {
    // Fall back to lightweight handle parsing below.
  }

  if (type === 'website') return trimmed.replace(/^https?:\/\//i, '').replace(/\/$/, '')
  if (type === 'linkedin') return cleanSocialHandle(trimmed.replace(/^(www\.)?linkedin\.com\/in\//i, ''))
  if (type === 'youtube') return cleanSocialHandle(trimmed.replace(/^(www\.)?(youtube\.com\/(@|channel\/|c\/|user\/)?|youtu\.be\/)/i, ''))
  return cleanSocialHandle(trimmed.replace(/^(www\.)?(instagram\.com|x\.com|twitter\.com)\//i, ''))
}

function normalizeSocialInput(type: SocialType, value: string) {
  const inputValue = getSocialInputValue(type, value)
  if (!inputValue) return ''
  if (type === 'website') return /^https?:\/\//i.test(inputValue) ? inputValue : `https://${inputValue}`
  if (type === 'linkedin') return `https://linkedin.com/in/${inputValue}`
  if (type === 'instagram') return `https://instagram.com/${inputValue}`
  if (type === 'youtube') {
    if (/^UC[a-zA-Z0-9_-]{20,}$/.test(inputValue)) return `https://youtube.com/channel/${inputValue}`
    return `https://youtube.com/@${inputValue.replace(/^@+/, '')}`
  }
  return `https://x.com/${inputValue}`
}

function getSocialBubbleStyle(type: SocialType): React.CSSProperties {
  if (type === 'linkedin') return { backgroundColor: '#0A66C2' }
  if (type === 'instagram') {
    return {
      background:
        'radial-gradient(circle at 30% 107%, #fdf497 0%, #fdf497 5%, #fd5949 45%, #d6249f 60%, #285AEB 90%)',
    }
  }
  if (type === 'youtube') return { backgroundColor: '#FF0033' }
  if (type === 'x') return { backgroundColor: '#000000' }
  return { backgroundColor: '#111827' }
}

const AVATAR_SOCIAL_SCALE = 198

function getAvatarSocialGeometry(size: number, socialCount: number, expanded = false, socialScale = AVATAR_SOCIAL_SCALE) {
  const gap = socialScale * 0.055
  const bubble = Math.min(socialScale * 0.22, (socialScale - ((socialCount + 1) * gap)) / Math.max(1, socialCount))
  const padding = socialScale * 0.05
  const contentWidth = expanded ? Math.min(size * 0.68, socialScale * 1.62) : bubble
  const channelWidth = Math.min(size, contentWidth + (padding * 2))
  const channelX = size - channelWidth
  const barHeight = (socialCount * bubble) + (Math.max(0, socialCount - 1) * gap)
  const channelTop = Math.max(size * 0.14, size - barHeight - padding)
  const innerRadius = (bubble / 2) + padding

  return {
    bubble,
    contentWidth: Math.max(bubble, channelWidth - (padding * 2)),
    channelWidth,
    channelX,
    gap,
    padding,
    innerRadius,
    channelTop,
  }
}

function estimateTextWidth(value: string, fontSize: number) {
  return value.length * fontSize * 0.56
}

function ProfileNameLine({
  value,
  maxRem,
  minRem,
  align = 'left',
  className = '',
}: {
  value?: string
  maxRem: number
  minRem: number
  align?: 'left' | 'right'
  className?: string
}) {
  const name = value?.trim()
  if (!name) return null

  const fitFactor = Math.max(4, name.length * 0.58)
  const alignClass = align === 'right' ? 'text-right' : 'text-left'

  return (
    <span
      className={`block w-full overflow-visible whitespace-nowrap ${alignClass} font-black leading-[0.82] text-gray-950 ${className}`}
      style={{
        fontSize: `min(${maxRem}rem, calc(100cqw / ${fitFactor}))`,
        letterSpacing: 0,
        WebkitTextStroke: '0.018em currentColor',
        textShadow: '0.012em 0 currentColor, -0.006em 0 currentColor',
      }}
    >
      {name}
    </span>
  )
}

function ProfileNameStack({
  firstName,
  lastName,
  maxRem,
  minRem,
  align = 'left',
  className = '',
}: {
  firstName?: string
  lastName?: string
  maxRem: number
  minRem: number
  align?: 'left' | 'right'
  className?: string
}) {
  const alignClass = align === 'right' ? 'text-right' : 'text-left'

  return (
    <h1
      className={`min-w-0 ${alignClass} ${className}`}
      style={{ containerType: 'inline-size' }}
      aria-label={[firstName, lastName].filter(Boolean).join(' ')}
    >
      <ProfileNameLine value={firstName} maxRem={maxRem} minRem={minRem} align={align} />
      <ProfileNameLine value={lastName} maxRem={maxRem} minRem={minRem} align={align} />
    </h1>
  )
}

function EditableProfileNameLine({
  value,
  placeholder,
  maxRem,
  minRem,
  align = 'left',
  className = '',
  disabled = false,
  onChange,
  onBlur,
}: {
  value: string
  placeholder: string
  maxRem: number
  minRem: number
  align?: 'left' | 'right'
  className?: string
  disabled?: boolean
  onChange: (value: string) => void
  onBlur: () => void
}) {
  const displayValue = value || placeholder
  const fitFactor = Math.max(4, displayValue.length * 0.58)
  const alignClass = align === 'right' ? 'text-right' : 'text-left'

  return (
    <input
      type="text"
      value={value}
      placeholder={placeholder}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      onBlur={onBlur}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur()
      }}
      className={`block w-full overflow-visible whitespace-nowrap border-0 bg-transparent p-0 ${alignClass} font-black leading-[0.82] text-gray-950 outline-none transition-colors placeholder:text-gray-300 focus:text-[var(--org-primary-color)] disabled:cursor-wait disabled:opacity-70 ${className}`}
      style={{
        fontSize: `min(${maxRem}rem, calc(100cqw / ${fitFactor}))`,
        letterSpacing: 0,
        WebkitTextStroke: '0.018em currentColor',
        textShadow: '0.012em 0 currentColor, -0.006em 0 currentColor',
      }}
      aria-label={placeholder}
    />
  )
}

function EditableProfileNameStack({
  firstName,
  lastName,
  maxRem,
  minRem,
  align = 'left',
  className = '',
  disabled = false,
  onFirstNameChange,
  onLastNameChange,
  onFirstNameBlur,
  onLastNameBlur,
  showLastName = true,
}: {
  firstName: string
  lastName: string
  maxRem: number
  minRem: number
  align?: 'left' | 'right'
  className?: string
  disabled?: boolean
  onFirstNameChange: (value: string) => void
  onLastNameChange: (value: string) => void
  onFirstNameBlur: () => void
  onLastNameBlur: () => void
  showLastName?: boolean
}) {
  const alignClass = align === 'right' ? 'text-right' : 'text-left'

  return (
    <div
      className={`min-w-0 ${alignClass} ${className}`}
      style={{ containerType: 'inline-size' }}
    >
      <EditableProfileNameLine
        value={firstName}
        placeholder="First name"
        maxRem={maxRem}
        minRem={minRem}
        align={align}
        disabled={disabled}
        onChange={onFirstNameChange}
        onBlur={onFirstNameBlur}
      />
      {showLastName ? (
        <EditableProfileNameLine
          value={lastName}
          placeholder="Last name"
          maxRem={maxRem}
          minRem={minRem}
          align={align}
          disabled={disabled}
          onChange={onLastNameChange}
          onBlur={onLastNameBlur}
        />
      ) : null}
    </div>
  )
}

function getAvatarNameGeometry(size: number, firstName: string, lastName: string) {
  const name = (lastName || firstName).trim()
  if (!name) return null

  const maxWidth = size * 0.8
  const paddingLeft = 0
  const paddingRight = size * 0.045
  const paddingY = 0
  const baseFontSize = size * 0.18
  const minFontSize = size * 0.08
  const nameWidth = estimateTextWidth(name, baseFontSize)
  const fontSize = Math.max(minFontSize, Math.min(baseFontSize, (maxWidth - paddingRight) / Math.max(1, nameWidth / baseFontSize)))
  const lineHeight = fontSize * 1.08
  const width = Math.min(maxWidth, estimateTextWidth(name, fontSize) + paddingRight)
  const height = lineHeight * 0.6
  const radius = height / 2
  const textOffsetY = -(fontSize * 0.18)

  return {
    lines: [name],
    width,
    height,
    fontSize,
    lineHeight,
    radius,
    paddingLeft,
    paddingRight,
    paddingY,
    textOffsetY,
    needsWordBreak: nameWidth + paddingRight > maxWidth,
  }
}

function getAvatarClipPath(size: number, socialCount: number, nameGeometry: ReturnType<typeof getAvatarNameGeometry> = null, socialsExpanded = false, socialScale = AVATAR_SOCIAL_SCALE) {
  const baseGeometry = getAvatarSocialGeometry(size, Math.max(1, socialCount), socialsExpanded, socialScale)
  const radius = baseGeometry.innerRadius
  if (socialCount === 0 && !nameGeometry) {
    return `M ${radius} 0 H ${size - radius} Q ${size} 0 ${size} ${radius} V ${size - radius} Q ${size} ${size} ${size - radius} ${size} H ${radius} Q 0 ${size} 0 ${size - radius} V ${radius} Q 0 0 ${radius} 0 Z`
  }

  const socialGeometry = socialCount > 0 ? getAvatarSocialGeometry(size, socialCount, socialsExpanded, socialScale) : null
  const channelX = socialGeometry?.channelX ?? size
  const channelTop = socialGeometry?.channelTop ?? size
  const innerRadius = socialGeometry?.innerRadius ?? 0
  const nameWidth = nameGeometry?.width ?? 0
  const nameHeight = nameGeometry?.height ?? 0
  const nameRadius = Math.min(radius, nameWidth / 2, nameHeight / 2)
  const startsAfterNameCutout = Boolean(nameGeometry)

  return [
    `M ${startsAfterNameCutout ? nameWidth + nameRadius : radius} 0`,
    `H ${size - radius}`,
    `Q ${size} 0 ${size} ${radius}`,
    ...(socialGeometry ? [
      `V ${channelTop - innerRadius}`,
      `Q ${size} ${channelTop} ${size - innerRadius} ${channelTop}`,
      `H ${channelX + innerRadius}`,
      `Q ${channelX} ${channelTop} ${channelX} ${channelTop + innerRadius}`,
      `V ${size - innerRadius}`,
      `Q ${channelX} ${size} ${channelX - innerRadius} ${size}`,
    ] : [
      `V ${size - radius}`,
      `Q ${size} ${size} ${size - radius} ${size}`,
    ]),
    `H ${radius}`,
    `Q 0 ${size} 0 ${size - radius}`,
    ...(nameGeometry ? [
      `V ${nameHeight + nameRadius}`,
      `Q 0 ${nameHeight} ${nameRadius} ${nameHeight}`,
      `H ${nameWidth - nameRadius}`,
      `Q ${nameWidth} ${nameHeight} ${nameWidth} ${nameHeight - nameRadius}`,
      `V ${nameRadius}`,
      `Q ${nameWidth} 0 ${nameWidth + nameRadius} 0`,
    ] : [
      `V ${radius}`,
      `Q 0 0 ${radius} 0`,
    ]),
    'Z',
  ].join(' ')
}

function ProfileHeaderAvatar({
  avatarUrl,
  socials,
  size,
  userId,
  firstName,
  lastName,
  showNameCutout = false,
  fullWidth = false,
  socialScale = AVATAR_SOCIAL_SCALE,
  canEditSocials,
  socialsExpanded = false,
  uploading,
  missingSocialTypes = [],
  onAvatarChange,
  onAddSocial,
  onUpdateSocial,
  onRemoveSocial,
  onSocialsFocus,
  onSocialsBlur,
  onSaveSocials,
}: {
  avatarUrl: string
  socials: SocialLink[]
  size: number
  userId: number | string
  firstName?: string
  lastName?: string
  showNameCutout?: boolean
  fullWidth?: boolean
  socialScale?: number
  canEditSocials: boolean
  socialsExpanded?: boolean
  uploading: boolean
  missingSocialTypes?: SocialType[]
  // eslint-disable-next-line no-unused-vars
  onAvatarChange(event: React.ChangeEvent<HTMLInputElement>): void
  // eslint-disable-next-line no-unused-vars
  onAddSocial?(type: SocialType): void
  // eslint-disable-next-line no-unused-vars
  onUpdateSocial?(type: SocialType, url: string): void
  // eslint-disable-next-line no-unused-vars
  onRemoveSocial?(type: SocialType): void
  onSocialsFocus?(): void
  onSocialsBlur?(): void
  onSaveSocials?(): void
}) {
  const clipId = useId()
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [measuredSize, setMeasuredSize] = useState(size)
  const actualSize = fullWidth ? measuredSize : size
  const safeClipId = `profile-avatar-${clipId.replace(/[^a-zA-Z0-9_-]/g, '')}`
  const visibleSocials = (canEditSocials ? socials : socials.filter((social) => social.url)).slice(0, 5)
  const socialSlotCount = visibleSocials.length || (canEditSocials ? 1 : 0)
  const nameGeometry = showNameCutout ? getAvatarNameGeometry(actualSize, firstName || '', lastName || '') : null
  const clipPath = getAvatarClipPath(actualSize, socialSlotCount, nameGeometry, socialsExpanded, socialScale)
  const { bubble, contentWidth, channelWidth, gap, padding } = getAvatarSocialGeometry(actualSize, socialSlotCount, socialsExpanded, socialScale)
  const bubbleSize = Math.round(bubble)
  const socialContentWidth = Math.round(contentWidth)
  const avatarImageUrl = avatarUrl || '/empty_avatar.png'
  const socialsTop = socialSlotCount > 0
    ? getAvatarSocialGeometry(actualSize, socialSlotCount, socialsExpanded, socialScale).channelTop
    : actualSize

  useEffect(() => {
    if (!fullWidth || !containerRef.current) return
    const observer = new ResizeObserver(([entry]) => {
      const nextSize = Math.max(1, Math.round(entry.contentRect.width))
      setMeasuredSize(nextSize)
    })
    observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [fullWidth])

  return (
    <div
      ref={containerRef}
      className={`relative shrink-0 ${fullWidth ? 'w-full' : ''}`}
      style={{ width: fullWidth ? undefined : actualSize, height: actualSize }}
    >
      <svg
        viewBox={`0 0 ${actualSize} ${actualSize}`}
        className="h-full w-full overflow-visible"
        role="img"
        aria-label="Portfolio photo"
      >
        <defs>
          <clipPath id={safeClipId}>
            <path d={clipPath} />
          </clipPath>
        </defs>
        <rect width={actualSize} height={actualSize} clipPath={`url(#${safeClipId})`} className="fill-gray-100" />
        <image
          href={avatarImageUrl}
          width={actualSize}
          height={actualSize}
          preserveAspectRatio="xMidYMid slice"
          clipPath={`url(#${safeClipId})`}
        />
      </svg>

      {nameGeometry ? (
        <div
          className="absolute left-0 top-0 flex flex-col items-start justify-center text-left font-black leading-none text-gray-950"
          style={{
            width: nameGeometry.width,
            height: nameGeometry.height,
            paddingLeft: nameGeometry.paddingLeft,
            paddingRight: nameGeometry.paddingRight,
            paddingTop: nameGeometry.paddingY,
            paddingBottom: nameGeometry.paddingY,
            fontSize: nameGeometry.fontSize,
            lineHeight: `${nameGeometry.lineHeight}px`,
            transform: `translateY(${nameGeometry.textOffsetY}px)`,
            WebkitTextStroke: '0.018em currentColor',
            textShadow: '0.012em 0 currentColor, -0.006em 0 currentColor',
            wordBreak: nameGeometry.needsWordBreak ? 'break-word' : 'normal',
          }}
        >
          {nameGeometry.lines.map((line, index) => (
            <span key={`${line}-${index}`} className="block">
              {line}
            </span>
          ))}
        </div>
      ) : null}

      {canEditSocials && missingSocialTypes.length > 0 && socialsExpanded ? (
        <div
          data-profile-socials="true"
          className="absolute right-0 z-10 flex items-center justify-end gap-2"
          style={{
            right: padding,
            bottom: Math.max(8, actualSize - socialsTop + gap),
            gap,
          }}
          onMouseDown={(event) => event.stopPropagation()}
          onFocus={onSocialsFocus}
        >
          {missingSocialTypes.map((type) => {
            const Icon = SOCIAL_CONFIG[type].icon
            return (
              <button
                key={type}
                type="button"
                aria-label={`Add ${SOCIAL_CONFIG[type].label}`}
                title={`Add ${SOCIAL_CONFIG[type].label}`}
                onClick={() => {
                  onSocialsFocus?.()
                  onAddSocial?.(type)
                }}
                className="flex shrink-0 items-center justify-center rounded-full text-white shadow-sm ring-2 ring-white"
                style={{
                  width: bubbleSize,
                  height: bubbleSize,
                  ...getSocialBubbleStyle(type),
                }}
              >
                <Icon className="h-[45%] w-[45%]" />
              </button>
            )
          })}
        </div>
      ) : null}

      {socialSlotCount > 0 ? (
        <div
          data-profile-socials="true"
          className="absolute right-0 bottom-0 flex flex-col items-center"
          style={{
            width: channelWidth,
            gap,
          }}
          onMouseDown={(event) => {
            event.stopPropagation()
          }}
          onFocus={onSocialsFocus}
          onClick={() => {
            onSocialsFocus?.()
          }}
        >
          {visibleSocials.length === 0 && canEditSocials ? (
            <button
              type="button"
              aria-label="Add social links"
              onClick={onSocialsFocus}
              className="flex shrink-0 items-center justify-center rounded-full bg-gray-950 text-white shadow-sm ring-2 ring-white transition-transform hover:-translate-y-0.5"
              style={{
                width: bubbleSize,
                height: bubbleSize,
              }}
            >
              <Plus className="h-[45%] w-[45%]" />
            </button>
          ) : null}
          {visibleSocials.map((social) => {
            const config = SOCIAL_CONFIG[social.type]
            const Icon = config.icon
            const socialStyle = getSocialBubbleStyle(social.type)
            return canEditSocials && socialsExpanded ? (
              <div
                key={social.type}
                className="flex shrink-0 items-center gap-2 rounded-full pl-3 pr-2 text-white shadow-sm ring-2 ring-white"
                style={{
                  width: socialContentWidth,
                  height: bubbleSize,
                  ...socialStyle,
                }}
              >
                <span
                  className="flex shrink-0 items-center justify-center rounded-full text-white"
                  style={{
                    width: Math.max(28, bubbleSize - 8),
                    height: Math.max(28, bubbleSize - 8),
                  }}
                >
                  <Icon className="h-[45%] w-[45%]" />
                </span>
                <span className="shrink-0 text-xs font-semibold text-white/80">
                  {config.inputPrefix}
                </span>
                <Input
                  value={getSocialInputValue(social.type, social.url)}
                  onChange={(event) => onUpdateSocial?.(social.type, normalizeSocialInput(social.type, event.target.value))}
                  onPaste={(event) => {
                    event.preventDefault()
                    const pasted = event.clipboardData.getData('text')
                    onUpdateSocial?.(social.type, normalizeSocialInput(social.type, pasted))
                  }}
                  placeholder={config.inputPlaceholder}
                  className="h-8 min-w-0 border-0 bg-transparent px-0 text-xs text-white shadow-none placeholder:text-white/70 focus-visible:ring-0"
                  autoComplete="url"
                  onFocus={onSocialsFocus}
                  onBlur={() => {
                    onSaveSocials?.()
                    onSocialsBlur?.()
                  }}
                />
                <button
                  type="button"
                  aria-label={`Remove ${config.label}`}
                  onClick={() => onRemoveSocial?.(social.type)}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white/85 hover:bg-white/15 hover:text-white"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : socialsExpanded ? (
              <a
                key={social.type}
                href={getSocialHref(social)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex shrink-0 items-center gap-2 rounded-full px-3 text-sm font-semibold text-white shadow-sm ring-2 ring-white transition-transform hover:-translate-y-0.5"
                style={{
                  width: socialContentWidth,
                  height: bubbleSize,
                  ...socialStyle,
                }}
                aria-label={config.label}
                title={config.label}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="min-w-0 truncate">{config.label}</span>
              </a>
            ) : (
              <a
                key={social.type}
                href={getSocialHref(social)}
                onClick={(event) => {
                  event.preventDefault()
                  onSocialsFocus?.()
                }}
                target="_blank"
                rel="noopener noreferrer"
                className="flex shrink-0 items-center justify-center rounded-full text-white shadow-sm ring-2 ring-white transition-transform hover:-translate-y-0.5"
                style={{
                  width: bubbleSize,
                  height: bubbleSize,
                  ...socialStyle,
                }}
                aria-label={config.label}
                title={config.label}
              >
                <Icon className="h-[45%] w-[45%]" />
              </a>
            )
          })}
        </div>
      ) : null}

      {canEditSocials ? (
        <>
          <input
            id={`profile-avatar-upload-${userId}-${size}`}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="hidden"
            onChange={onAvatarChange}
          />
          <button
            type="button"
            aria-label="Upload profile photo"
            onClick={() => document.getElementById(`profile-avatar-upload-${userId}-${size}`)?.click()}
            className="absolute flex items-center justify-center rounded-full bg-white text-gray-800 shadow-md ring-1 ring-gray-200 hover:text-gray-950"
            style={{
              right: padding,
              top: padding,
              width: bubbleSize,
              height: bubbleSize,
            }}
            disabled={uploading}
          >
            {uploading ? <Loader2 className="h-[45%] w-[45%] animate-spin" /> : <Camera className="h-[45%] w-[45%]" />}
          </button>
        </>
      ) : null}
    </div>
  )
}

const PROFILE_TIMELINE_MONTH_FORMATTER = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  year: 'numeric',
})

function getProfileTimelineMonthKey(value?: string) {
  const match = value ? /^(\d{4})-(\d{2})$/.exec(value) : null
  if (!match) return Number.NEGATIVE_INFINITY
  return Number(match[1]) * 12 + (Number(match[2]) - 1)
}

function getProfileTimelineEffectiveEndDate(entry: TimelineEntry) {
  if (entry.isOngoing || !entry.endDate) {
    const today = new Date()
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
  }
  return entry.endDate
}

function formatProfileTimelineMonth(value?: string) {
  const match = value ? /^(\d{4})-(\d{2})$/.exec(value) : null
  if (!match) return ''
  return PROFILE_TIMELINE_MONTH_FORMATTER.format(
    new Date(Number(match[1]), Number(match[2]) - 1, 1)
  )
}

function formatProfileTimelineRange(entry: TimelineEntry) {
  const start = formatProfileTimelineMonth(entry.startDate)
  const end = entry.isOngoing ? 'Present' : formatProfileTimelineMonth(entry.endDate)
  if (!start) return end
  if (!end) return start
  return `${start} - ${end}`
}

function getRecentTimelineEntries(timeline: TimelineEntry[]) {
  return [...timeline]
    .sort((a, b) => {
      const endDiff = getProfileTimelineMonthKey(getProfileTimelineEffectiveEndDate(b)) -
        getProfileTimelineMonthKey(getProfileTimelineEffectiveEndDate(a))
      if (endDiff !== 0) return endDiff
      return getProfileTimelineMonthKey(b.startDate) - getProfileTimelineMonthKey(a.startDate)
    })
    .slice(0, 4)
}

function isCourseRunEarned(run: any) {
  const totalSteps = Number(run?.course_total_steps || 0)
  const completedSteps = Array.isArray(run?.steps) ? run.steps.length : 0
  return totalSteps > 0 && completedSteps >= totalSteps
}

function hasFilledPost(featured: FeaturedSection) {
  return (featured.cards || []).some((card) =>
    Boolean((card.title || '').trim() || (card.body || '').trim() || card.imageUrl)
  )
}

function hasFilledCustomSection(section: ProfileCustomSection | undefined, type?: ProfileWidgetType) {
  if (!section) return false
  if (type === 'title') return Boolean((section.title || '').trim())
  return Boolean(
    (section.body || '').trim() ||
    (section.url || '').trim() ||
    (section.mediaUrl || '').trim()
  )
}

function shouldRenderProfileLayoutItem(
  item: ProfileLayoutItem,
  profile: ProfileShape,
  canManageProfile: boolean
) {
  if (canManageProfile) return true

  if (item.type === 'timeline') {
    return Boolean(
      profile.timelineEnabled &&
      profile.timelinePublicVisible !== false &&
      (profile.timeline || []).length > 0
    )
  }

  if (item.type === 'portfolio') {
    const featured = profile.featured || normalizeFeatured(null)
    return Boolean(
      featured.enabled &&
      featured.publicVisible !== false &&
      (featured.cards || []).length > 0
    )
  }

  if (item.type === 'achievements') {
    const achievements = normalizeAchievements(profile.achievements)
    return Boolean(
      achievements.enabled &&
      achievements.publicVisible !== false &&
      achievements.featured.length > 0
    )
  }

  if (item.type === 'values' || item.type === 'strengths') {
    const selected = item.type === 'values' ? profile.values || [] : profile.strengths || []
    return selected.length > 0
  }

  if (item.type === 'instagramPreview' || item.type === 'youtubePreview') {
    const type = item.type === 'instagramPreview' ? 'instagram' : 'youtube'
    return Boolean((profile.header?.socials || []).find((social) => social.type === type)?.url)
  }

  if (item.type === 'coreCourse' || item.type === 'coreQuiz') return false

  const section = profile.sections?.find((candidate) => candidate.id === item.id)
  return hasFilledCustomSection(section, item.type)
}

function getProfileDisplayName(firstName?: string, lastName?: string, username?: string) {
  const name = [firstName, lastName].map((part) => part?.trim()).filter(Boolean).join(' ')
  return name || username || 'Your portfolio'
}

function ProfileSocialCircle({
  social,
  type,
  asButton = false,
  onClick,
}: {
  social?: SocialLink
  type: SocialType
  asButton?: boolean
  onClick?: () => void
}) {
  const config = SOCIAL_CONFIG[type]
  const Icon = config.icon
  const className = "flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white shadow-sm ring-2 ring-white transition-all hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2"
  const style = getSocialBubbleStyle(type)

  if (asButton) {
    return (
      <button
        type="button"
        aria-label={`Add ${config.label}`}
        title={`Add ${config.label}`}
        onClick={onClick}
        className={className}
        style={style}
      >
        <Icon className="h-5 w-5" />
      </button>
    )
  }

  if (!social?.url) return null

  return (
    <a
      href={getSocialHref(social)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={config.label}
      title={config.label}
      onClick={(event) => event.stopPropagation()}
      className={className}
      style={style}
    >
      <Icon className="h-5 w-5" />
    </a>
  )
}

function SimpleProfileHeader({
  orgslug,
  user,
  draft,
  avatarUrl,
  socials,
  canManageProfile,
  isSaving,
  canSeedDevProfile,
  onOpen,
  onCopyProfileLink,
  onSeedDevProfile,
}: {
  orgslug: string
  user: any
  draft: {
    first_name: string
    last_name: string
    username: string
    bio: string
  }
  avatarUrl: string
  socials: SocialLink[]
  canManageProfile: boolean
  isSaving: boolean
  canSeedDevProfile: boolean
  onOpen: () => void
  onCopyProfileLink: () => void
  onSeedDevProfile: () => void
}) {
  const firstName = canManageProfile ? draft.first_name : user.first_name
  const lastName = canManageProfile ? draft.last_name : user.last_name
  const bio = canManageProfile ? draft.bio : user.bio
  const username = user.username || draft.username
  const visibleSocials = socials.filter((social) => social.url)

  return (
    <section className="pb-6">
      <Card asChild variant="interactive" size="default" className="grid cursor-pointer items-center gap-6 sm:grid-cols-[minmax(0,1fr)_160px]">
        <div
          role="button"
          tabIndex={0}
          onClick={onOpen}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              onOpen()
            }
          }}
          className="group focus:outline-none focus:ring-2 focus:ring-gray-300"
          aria-label="Open profile header"
        >
        <div className="min-w-0 text-center sm:text-left">
          <h1 className="text-4xl font-black leading-tight text-gray-950 sm:text-5xl">
            {getProfileDisplayName(firstName, lastName, username)}
          </h1>
          <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-gray-600 line-clamp-2 sm:mx-0 sm:text-base">
            {bio?.trim() ? bio : 'Add a short profile bio.'}
          </p>

          {visibleSocials.length > 0 ? (
            <div className="mt-5 flex flex-wrap items-center justify-center gap-3 sm:justify-start">
              {visibleSocials.map((social) => (
                <ProfileSocialCircle key={social.type} social={social} type={social.type} />
              ))}
            </div>
          ) : null}
        </div>

        <div className="order-first flex justify-center sm:order-none sm:justify-end">
          <div className="h-36 w-36 overflow-hidden rounded-full bg-gray-100 shadow-lg shadow-gray-950/10 ring-4 ring-white transition-transform duration-200 group-hover:scale-[1.02] sm:h-40 sm:w-40">
            <img
              src={avatarUrl || '/empty_avatar.png'}
              alt=""
              className="h-full w-full object-cover"
            />
          </div>
        </div>
        </div>
      </Card>

      <div className="mt-4 flex flex-wrap items-center justify-start gap-2">
        {canSeedDevProfile ? (
          <Button type="button" variant="surface" onClick={onSeedDevProfile} disabled={isSaving}>
            {isSaving ? <Loader2 size={16} className="mr-2 animate-spin" /> : <Sparkles size={16} className="mr-2" />}
            Cheat Portfolio
          </Button>
        ) : null}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="surface">
              <Share2 size={16} className="mr-2" />
              Share
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onClick={onCopyProfileLink}>
              <Copy className="h-4 w-4" />
              <span>Copy link</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </section>
  )
}

function ProfileHeaderModal({
  open,
  onOpenChange,
  user,
  draft,
  avatarUrl,
  socials,
  missingSocialTypes,
  canManageProfile,
  isSaving,
  uploadingAvatar,
  onAvatarChange,
  onDraftChange,
  onAddSocial,
  onUpdateSocial,
  onRemoveSocial,
  onSave,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  user: any
  draft: {
    first_name: string
    last_name: string
    username: string
    bio: string
  }
  avatarUrl: string
  socials: SocialLink[]
  missingSocialTypes: SocialType[]
  canManageProfile: boolean
  isSaving: boolean
  uploadingAvatar: boolean
  onAvatarChange(event: React.ChangeEvent<HTMLInputElement>): void
  onDraftChange(patch: Partial<typeof draft>): void
  onAddSocial(type: SocialType): void
  onUpdateSocial(type: SocialType, url: string): void
  onRemoveSocial(type: SocialType): void
  onSave(): Promise<boolean>
}) {
  const displayName = getProfileDisplayName(
    canManageProfile ? draft.first_name : user.first_name,
    canManageProfile ? draft.last_name : user.last_name,
    user.username || draft.username
  )
  const visibleSocials = canManageProfile ? socials : socials.filter((social) => social.url)
  const avatarInputId = `profile-header-modal-avatar-${user.id}`

  const saveAndClose = async () => {
    const saved = await onSave()
    if (saved) onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto p-0">
        <DialogHeader className="px-6 pt-6">
          <DialogTitle>{canManageProfile ? 'Edit profile header' : displayName}</DialogTitle>
          <DialogDescription>
            {canManageProfile ? 'Update the public profile details shown at the top of your portfolio.' : 'Full profile bio'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 px-6 py-5">
          <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:text-left">
            <div className="relative h-28 w-28 shrink-0 overflow-hidden rounded-full bg-gray-100 shadow-md ring-4 ring-white">
              <img src={avatarUrl || '/empty_avatar.png'} alt="" className="h-full w-full object-cover" />
              {canManageProfile ? (
                <>
                  <input
                    id={avatarInputId}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    className="hidden"
                    onChange={onAvatarChange}
                  />
                  <button
                    type="button"
                    onClick={() => document.getElementById(avatarInputId)?.click()}
                    className="absolute inset-x-0 bottom-0 flex h-10 items-center justify-center bg-black/55 text-white transition-colors hover:bg-black/70"
                    aria-label="Upload profile photo"
                  >
                    {uploadingAvatar ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                  </button>
                </>
              ) : null}
            </div>

            <div className="min-w-0 flex-1 space-y-3">
              {canManageProfile ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input
                    value={draft.first_name}
                    onChange={(event) => onDraftChange({ first_name: event.target.value })}
                    placeholder="First name"
                    className="bg-white"
                  />
                  <Input
                    value={draft.last_name}
                    onChange={(event) => onDraftChange({ last_name: event.target.value })}
                    placeholder="Last name"
                    className="bg-white"
                  />
                </div>
              ) : (
                <h2 className="text-3xl font-black leading-tight text-gray-950">{displayName}</h2>
              )}
            </div>
          </div>

          {canManageProfile ? (
            <Textarea
              value={draft.bio}
              onChange={(event) => onDraftChange({ bio: event.target.value })}
              placeholder="Tell people who you are and what you are building."
              rows={6}
              maxLength={1200}
              className="min-h-40 resize-y bg-white text-base leading-7"
            />
          ) : (
            <p className="whitespace-pre-wrap text-base leading-7 text-gray-700">
              {user.bio?.trim() || 'No bio yet.'}
            </p>
          )}

          {canManageProfile ? (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-3">
                {visibleSocials.map((social) => {
                  const config = SOCIAL_CONFIG[social.type]
                  const Icon = config.icon
                  return (
                    <div
                      key={social.type}
                      className="flex min-h-11 min-w-[230px] flex-1 items-center gap-2 rounded-full px-3 text-white shadow-sm ring-2 ring-white sm:max-w-[300px]"
                      style={getSocialBubbleStyle(social.type)}
                    >
                      <Icon className="h-5 w-5 shrink-0" />
                      <span className="shrink-0 text-xs font-semibold text-white/80">{config.inputPrefix}</span>
                      <Input
                        value={getSocialInputValue(social.type, social.url)}
                        onChange={(event) => onUpdateSocial(social.type, normalizeSocialInput(social.type, event.target.value))}
                        onPaste={(event) => {
                          event.preventDefault()
                          onUpdateSocial(social.type, normalizeSocialInput(social.type, event.clipboardData.getData('text')))
                        }}
                        placeholder={config.inputPlaceholder}
                        className="h-8 min-w-0 border-0 bg-transparent px-0 text-sm text-white shadow-none placeholder:text-white/70 focus-visible:ring-0"
                        autoComplete="url"
                      />
                      <button
                        type="button"
                        aria-label={`Remove ${config.label}`}
                        onClick={() => onRemoveSocial(social.type)}
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white/85 hover:bg-white/15 hover:text-white"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )
                })}
              </div>

              {missingSocialTypes.length > 0 ? (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Links</p>
                  <div className="flex flex-wrap gap-3">
                    {missingSocialTypes.map((type) => (
                      <ProfileSocialCircle
                        key={type}
                        type={type}
                        asButton
                        onClick={() => onAddSocial(type)}
                      />
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : visibleSocials.length > 0 ? (
            <div className="flex flex-wrap gap-3">
              {visibleSocials.map((social) => (
                <ProfileSocialCircle key={social.type} social={social} type={social.type} />
              ))}
            </div>
          ) : null}
        </div>

        {canManageProfile ? (
          <DialogFooter className="border-t border-gray-100 px-6 py-4">
            <Button type="button" onClick={saveAndClose} disabled={isSaving}>
              {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
              Save
            </Button>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function PortfolioTodoPanel({
  profile,
  user,
  orgslug,
  trail,
}: {
  profile: ProfileShape
  user: any
  orgslug: string
  trail: any
}) {
  const runs = Array.isArray(trail?.runs) ? trail.runs : []
  const earnedRuns = runs.filter(isCourseRunEarned)
  const startedRuns = runs.filter((run: any) => !isCourseRunEarned(run) && Array.isArray(run?.steps) && run.steps.length > 0)
  const featured = profile.featured || normalizeFeatured(null)
  const layout = profile.layout || DEFAULT_PROFILE_LAYOUT
  const sections = profile.sections || []
  const visibleSocials = profile.header?.socials?.filter((social) => social.url) || []

  const tasks = [
    {
      id: 'badges',
      label: 'Earn your first 3 badges',
      detail: `${Math.min(earnedRuns.length, 3)}/3 earned${startedRuns.length ? `, ${startedRuns.length} in progress` : ''}`,
      complete: earnedRuns.length >= 3,
      href: getUriWithOrg(orgslug, routePaths.org.badges()),
    },
    {
      id: 'photo',
      label: 'Add your profile photo',
      detail: user.avatar_image ? 'Added' : 'Empty',
      complete: Boolean(user.avatar_image),
    },
    {
      id: 'bio',
      label: 'Write a short bio',
      detail: user.bio ? 'Added' : 'Empty',
      complete: Boolean((user.bio || '').trim()),
    },
    ...layout.map((item) => {
      if (item.type === 'portfolio') {
        return {
          id: 'portfolio-posts',
          label: 'Add your first post',
          detail: hasFilledPost(featured) ? 'Added' : 'Empty',
          complete: hasFilledPost(featured),
          href: getUriWithOrg(orgslug, routePaths.org.portfolio()),
        }
      }
      if (item.type === 'timeline') {
        return {
          id: 'timeline',
          label: 'Add a timeline moment',
          detail: (profile.timeline || []).length ? `${(profile.timeline || []).length} added` : 'Empty',
          complete: Boolean((profile.timeline || []).length),
          href: getUriWithOrg(orgslug, routePaths.org.portfolioTimeline()),
        }
      }
      if (item.type === 'instagramPreview' || item.type === 'youtubePreview') {
        const type = item.type === 'instagramPreview' ? 'instagram' : 'youtube'
        return {
          id: item.type,
          label: `Connect ${type === 'instagram' ? 'Instagram' : 'YouTube'}`,
          detail: visibleSocials.some((social) => social.type === type) ? 'Connected' : 'Empty',
          complete: visibleSocials.some((social) => social.type === type),
        }
      }
      if (item.type === 'values' || item.type === 'strengths') {
        const selected = item.type === 'values' ? profile.values || [] : profile.strengths || []
        return {
          id: item.type,
          label: `Pick your ${item.type === 'values' ? 'values' : 'strengths'}`,
          detail: `${Math.min(selected.length, PROFILE_TOP_FIVE_LIMIT)}/${PROFILE_TOP_FIVE_LIMIT} selected`,
          complete: selected.length >= PROFILE_TOP_FIVE_LIMIT,
        }
      }
      if (item.type === 'link' || item.type === 'text' || item.type === 'media' || item.type === 'title') {
        const section = sections.find((candidate) => candidate.id === item.id)
        return {
          id: item.id,
          label: `Fill ${PROFILE_WIDGET_CONFIG[item.type].label.toLowerCase()} section`,
          detail: hasFilledCustomSection(section, item.type) ? 'Added' : 'Empty',
          complete: hasFilledCustomSection(section, item.type),
        }
      }
      return null
    }).filter(Boolean),
  ] as Array<{ id: string; label: string; detail: string; complete: boolean; href?: string }>

  const uniqueTasks = tasks.filter((task, index, all) =>
    all.findIndex((candidate) => candidate.id === task.id) === index
  )
  const completed = uniqueTasks.filter((task) => task.complete).length
  const progressPercent = uniqueTasks.length ? Math.round((completed / uniqueTasks.length) * 100) : 0

  return (
    <Card asChild variant="default" size="sm" className="overflow-hidden">
      <aside className="space-y-4">
      <div>
        <p className="text-[11px] font-black uppercase tracking-[0.12em] text-gray-600">Setup</p>
        <div className="mt-2 flex items-end justify-between gap-3">
          <h2 className="min-w-0 text-base font-black leading-5 text-gray-950">Portfolio checklist</h2>
          <p className="shrink-0 text-xs font-black text-[var(--org-primary-color)]">{completed}/{uniqueTasks.length} done</p>
        </div>
        <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-gray-100">
          <div
            className="h-full rounded-full bg-[var(--org-primary-color)] transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        {uniqueTasks.map((task) => {
          const icon = task.complete
            ? (
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[var(--org-primary-color)] text-white">
                <Check className="h-2.5 w-2.5" strokeWidth={3} />
              </span>
            )
            : <Circle className="h-4 w-4 text-gray-400" strokeWidth={2.2} />
          const content = (
            <div className="flex min-w-0 items-start gap-3">
              <span className="mt-1 shrink-0">{icon}</span>
              <span className="min-w-0">
                <span className={`block text-xs font-black leading-4 ${task.complete ? 'text-gray-500 line-through decoration-gray-400 decoration-2' : 'text-gray-950'}`}>
                  {task.label}
                </span>
                <span className="block text-[11px] font-semibold leading-4 text-gray-500">{task.detail}</span>
              </span>
            </div>
          )
          return task.href ? (
            <Link key={task.id} href={task.href} className="block rounded-lg px-1.5 py-1 transition-colors hover:bg-gray-50">
              {content}
            </Link>
          ) : (
            <div key={task.id} className="rounded-lg px-1.5 py-1">
              {content}
            </div>
          )
        })}
      </div>
      </aside>
    </Card>
  )
}

function getTimelineEntryDetail(entry: TimelineEntry) {
  if (entry.category === 'work') return entry.employer
  if (entry.category === 'education') return entry.institution
  return ''
}

function getTimelineEntryLabel(entry: TimelineEntry) {
  return entry.status || getTimelineEntryDetail(entry) || (entry.category === 'education' ? 'Learning' : entry.category === 'work' ? 'Work' : 'Life')
}

function formatProfileTimelinePointDate(entry: TimelineEntry) {
  if (entry.isOngoing) return 'Present'
  return formatProfileTimelineMonth(entry.endDate || entry.startDate)
}

function getTimelineEntryDotClass(entry: TimelineEntry) {
  if (entry.category === 'education') return 'bg-sky-500'
  if (entry.category === 'life') return 'bg-red-500'
  return 'bg-[#39bf00]'
}

function TimelineOverviewSection({
  timeline,
  href,
  grid,
  canManage,
}: {
  timeline: TimelineEntry[]
  href: string
  grid: ProfileGridPosition
  canManage: boolean
}) {
  const recentEntries = getRecentTimelineEntries(timeline)

  if (!canManage && recentEntries.length === 0) return null

  const isCompact = grid.h === 1
  const isNarrow = grid.w === 1
  const visibleEntries = recentEntries.slice(0, isCompact ? 2 : 4)

  if (isCompact) {
    return (
      <Card asChild variant="default" size="sm" className="flex h-full min-h-0 min-w-0 items-center justify-between gap-4">
        <section>
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold text-gray-950">The Journey</h2>
          {visibleEntries.length > 0 ? (
            <p className="mt-1 truncate text-sm font-medium text-gray-500">
              {visibleEntries[0].title || 'Untitled timeline block'}
            </p>
          ) : (
            <p className="mt-1 truncate text-sm font-medium text-gray-500">No moments yet</p>
          )}
        </div>
        <Link
          href={href}
          className={buttonVariants({ variant: 'surface', size: 'sm', className: 'shrink-0' })}
        >
          Open
        </Link>
        </section>
      </Card>
    )
  }

  return (
    <Card asChild variant="default" className="flex h-full min-h-0 min-w-0 flex-col">
      <section>
      <div className="mb-5 flex items-center justify-between gap-3">
        <h2 className={`${isNarrow ? 'text-xl' : 'text-2xl'} min-w-0 truncate font-semibold text-gray-950`}>The Journey</h2>
        <Link
          href={href}
          className="flex items-center gap-1.5 text-sm font-semibold text-gray-600 transition-colors hover:text-gray-950"
        >
          <span>Open</span>
          <ChevronRight className="h-4 w-4" />
        </Link>
      </div>
      {visibleEntries.length > 0 ? (
        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          <div className="relative space-y-5 pl-5">
            <div className="absolute bottom-2 left-[5px] top-2 w-1 rounded-full bg-gray-100" />
            {visibleEntries.map((entry) => {
              const label = getTimelineEntryLabel(entry)
              const pointDate = formatProfileTimelinePointDate(entry)

              return (
                <Link key={entry.id} href={href} className="group relative block min-w-0">
                  <span className={`absolute -left-5 top-1.5 h-3 w-3 rounded-full border-2 border-white ${getTimelineEntryDotClass(entry)}`} />
                  <p className="line-clamp-1 text-sm font-semibold leading-5 text-gray-950 group-hover:text-gray-700">
                    {entry.title || 'Untitled timeline block'}
                  </p>
                  <p className="mt-0.5 line-clamp-1 text-sm leading-5 text-gray-500">
                    {pointDate}{label ? ` • ${label}` : ''}
                  </p>
                </Link>
              )
            })}
          </div>
        </div>
      ) : (
        <div className="rounded-lg border-2 border-dotted border-[var(--org-primary-color)] bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-4 rounded-lg bg-gray-50 p-5">
            <div>
              <p className="text-sm font-semibold text-gray-950">Add timeline events</p>
              <p className="mt-1 text-sm leading-6 text-gray-700">
                Capture work, education, and life moments to show them here.
              </p>
            </div>
            <Link
              href={href}
              className={buttonVariants({ variant: 'brand', size: 'icon', className: 'h-12 w-12 shrink-0' })}
              aria-label="Add timeline events"
            >
              <ChevronRight className="h-6 w-6" />
            </Link>
          </div>
        </div>
      )}
      </section>
    </Card>
  )
}

function getProfileTopFiveConfig(kind: ProfileTopFiveKind) {
  if (kind === 'values') {
    return {
      title: 'My Values',
      prompt: 'Select the top 5 values that best describe you.',
      empty: 'Choose the values you want people to remember.',
      categories: PROFILE_VALUES_CATEGORIES,
      icon: Heart,
      accent: 'bg-rose-500',
      softAccent: 'bg-rose-50 text-rose-700 border-rose-200',
    }
  }

  return {
    title: 'My Strengths',
    prompt: 'Select the top 5 strengths that best describe you.',
    empty: 'Choose the strengths you want to showcase.',
    categories: PROFILE_STRENGTHS_CATEGORIES,
    icon: Zap,
    accent: 'bg-amber-500',
    softAccent: 'bg-amber-50 text-amber-800 border-amber-200',
  }
}

function ProfileTopFiveWidget({
  kind,
  selected,
  grid,
  canEdit,
  onConfirm,
}: {
  kind: ProfileTopFiveKind
  selected: string[]
  grid: ProfileGridPosition
  canEdit: boolean
  onConfirm(values: string[]): void
}) {
  const config = getProfileTopFiveConfig(kind)
  const Icon = config.icon
  const [open, setOpen] = useState(false)
  const [draftSelected, setDraftSelected] = useState<string[]>(selected)
  const [showConfirm, setShowConfirm] = useState(selected.length >= PROFILE_TOP_FIVE_LIMIT)
  const isCompact = grid.h === 1
  const isNarrow = grid.w === 1
  const selectedSet = useMemo(() => new Set(draftSelected), [draftSelected])
  const progressPercent = (draftSelected.length / PROFILE_TOP_FIVE_LIMIT) * 100

  useEffect(() => {
    if (!open) return
    setDraftSelected(selected)
    setShowConfirm(selected.length >= PROFILE_TOP_FIVE_LIMIT)
  }, [open, selected])

  useEffect(() => {
    if (draftSelected.length !== PROFILE_TOP_FIVE_LIMIT) {
      setShowConfirm(false)
      return
    }

    const timeout = window.setTimeout(() => setShowConfirm(true), 650)
    return () => window.clearTimeout(timeout)
  }, [draftSelected.length])

  const addChip = (item: string) => {
    if (!canEdit || selectedSet.has(item) || draftSelected.length >= PROFILE_TOP_FIVE_LIMIT) return
    setDraftSelected((current) => [...current, item])
  }

  const removeChip = (item: string) => {
    if (!canEdit) return
    setDraftSelected((current) => current.filter((value) => value !== item))
  }

  const confirmSelection = () => {
    if (draftSelected.length !== PROFILE_TOP_FIVE_LIMIT) return
    onConfirm(draftSelected)
    setOpen(false)
  }

  const cardContent = (
    <Card asChild variant={canEdit ? 'interactive' : 'default'} size={isCompact ? 'sm' : 'default'} className="flex h-full min-h-0 min-w-0 flex-col text-left">
      <section>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white ${config.accent}`}>
            <Icon className="h-5 w-5" />
          </span>
          <h2 className={`${isNarrow ? 'text-xl' : 'text-2xl'} min-w-0 truncate font-semibold text-gray-950`}>
            {config.title}
          </h2>
        </div>
        {canEdit ? <Pencil className="h-4 w-4 shrink-0 text-gray-400" /> : null}
      </div>

      {selected.length > 0 ? (
        <div className="flex min-h-0 flex-1 content-start items-start gap-2 overflow-y-auto">
          <div className="flex flex-wrap gap-2">
            {selected.slice(0, isCompact ? 3 : PROFILE_TOP_FIVE_LIMIT).map((item) => (
              <span key={item} className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${config.softAccent}`}>
                {item}
              </span>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 items-center rounded-lg border-2 border-dashed border-gray-200 bg-gray-50 p-4">
          <p className="text-sm leading-6 text-gray-500">{config.empty}</p>
        </div>
      )}
      </section>
    </Card>
  )

  return (
    <>
      {canEdit ? (
        <div
          role="button"
          tabIndex={0}
          className="h-full w-full text-left focus:outline-none focus:ring-2 focus:ring-gray-300"
          onClick={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              setOpen(true)
            }
          }}
        >
          {cardContent}
        </div>
      ) : selected.length > 0 ? cardContent : null}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[92vh] w-[calc(100vw-2rem)] max-w-2xl flex-col overflow-hidden rounded-2xl p-0">
          <DialogHeader className="border-b border-gray-100 px-6 py-5 pr-14">
            <DialogTitle>{config.title}</DialogTitle>
            <DialogDescription>{config.prompt}</DialogDescription>
          </DialogHeader>

          <div className="flex min-h-0 flex-1 flex-col gap-5 px-6 py-5">
            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto rounded-xl border border-gray-200 bg-white p-4">
              {config.categories.map((category) => (
                <section key={category.title} className="space-y-2">
                  <h3 className="text-sm font-semibold text-gray-800">{category.title}</h3>
                  <div className="flex flex-wrap gap-2">
                    {category.items.filter((item) => !selectedSet.has(item)).map((item) => (
                      <button
                        key={item}
                        type="button"
                        onClick={() => addChip(item)}
                        disabled={draftSelected.length >= PROFILE_TOP_FIVE_LIMIT}
                        className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm font-semibold text-gray-700 transition-colors hover:border-gray-300 hover:bg-white disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                </section>
              ))}
            </div>

            <div className="shrink-0 space-y-3">
              <div className="flex min-h-11 flex-wrap items-center gap-2">
                {draftSelected.length > 0 ? draftSelected.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => removeChip(item)}
                    className={`rounded-full border px-3 py-1.5 text-sm font-semibold transition-transform hover:-translate-y-0.5 ${config.softAccent}`}
                  >
                    {item}
                  </button>
                )) : (
                  <p className="text-sm text-gray-500">Your selected chips will appear here.</p>
                )}
              </div>

              <div className="min-h-10">
                <AnimatePresence mode="wait" initial={false}>
                  {showConfirm ? (
                    <motion.div
                      key="confirm"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.18 }}
                    >
                      <Button type="button" className="w-full" onClick={confirmSelection}>
                        Confirm
                      </Button>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="progress"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.18 }}
                      className="space-y-2"
                    >
                      <div className="flex items-center justify-between text-xs font-semibold text-gray-500">
                        <span>Selected</span>
                        <span>{draftSelected.length}/{PROFILE_TOP_FIVE_LIMIT}</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                        <div className={`h-full rounded-full transition-all duration-300 ${config.accent}`} style={{ width: `${progressPercent}%` }} />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

function LayoutRightSidebarPortal({ children }: { children: React.ReactNode }) {
  const [target, setTarget] = useState<HTMLElement | null>(null)

  useEffect(() => {
    setTarget(document.getElementById('org-layout-right-sidebar'))
  }, [])

  if (!target) return null
  return createPortal(children, target)
}

function SocialPreviewWidget({
  type,
  social,
  grid,
  canEdit,
  onChange,
  onBlur,
}: {
  type: Extract<SocialType, 'instagram' | 'youtube'>
  social?: SocialLink
  grid: ProfileGridPosition
  canEdit: boolean
  onChange(value: string): void
  onBlur(): void
}) {
  const config = SOCIAL_CONFIG[type]
  const Icon = config.icon
  const handle = getSocialInputValue(type, social?.url || '')
  const href = social?.url ? getSocialHref(social) : ''
  const [items, setItems] = useState<SocialPreviewItem[]>([])
  const [loading, setLoading] = useState(false)
  const [loadedHandle, setLoadedHandle] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)

  useEffect(() => {
    if (!handle) {
      setItems([])
      setLoadedHandle('')
      return
    }

    let cancelled = false
    setLoading(true)
    fetch(`/api/portfolio/social-previews?site=${type}&handle=${encodeURIComponent(handle)}`)
      .then(async (response) => {
        if (!response.ok) return []
        const data = await response.json()
        return Array.isArray(data.items) ? data.items.slice(0, 6) : []
      })
      .then((nextItems: SocialPreviewItem[]) => {
        if (cancelled) return
        setItems(nextItems)
        setLoadedHandle(handle)
      })
      .catch(() => {
        if (!cancelled) {
          setItems([])
          setLoadedHandle(handle)
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [handle, type])

  useEffect(() => {
    setActiveIndex((current) => Math.max(0, Math.min(current, Math.max(items.length - 1, 0))))
  }, [items.length])

  const emptyMessage = type === 'instagram'
    ? 'Public Instagram previews are limited by Instagram. Add a handle here now; previews appear when public page data is available.'
    : 'Add a YouTube handle to show recent videos.'
  const isCompact = grid.h === 1
  const isSingleCardCarousel = grid.w === 1 && !isCompact
  const isNarrow = grid.w === 1
  const activeItem = items[Math.min(activeIndex, Math.max(items.length - 1, 0))]
  const statLabel = type === 'instagram' ? 'previews' : 'videos'
  const itemCountLabel = loading && loadedHandle !== handle
    ? 'Loading'
    : `${items.length} ${statLabel}`
  const cardClassName = type === 'instagram'
    ? 'aspect-[9/16] h-full min-h-0'
    : 'aspect-video w-full'
  const feedClassName = isSingleCardCarousel
    ? 'h-full'
    : 'flex h-full min-w-0 gap-3'

  const renderPreviewCard = (item: SocialPreviewItem, mode: 'single' | 'strip') => {
    if (type === 'youtube') {
      return (
        <a
          key={item.id}
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className={`group/card flex min-w-0 min-h-0 shrink-0 flex-col transition-transform hover:-translate-y-0.5 ${
            mode === 'single' ? 'h-full w-full' : 'h-full w-44 sm:w-56 md:w-64'
          }`}
          aria-label={item.title || `${config.label} preview`}
        >
          <span className="relative block min-h-0 flex-1 overflow-hidden rounded-lg bg-gray-100 ring-1 ring-gray-200">
            {item.thumbnailUrl ? (
              <img src={item.thumbnailUrl} alt="" className="h-full w-full object-cover object-center" loading="lazy" />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-gray-400">
                <Icon className="h-8 w-8" />
              </span>
            )}
            <span className="absolute inset-0 flex items-center justify-center bg-black/10 text-white opacity-95">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-black/70">
                <Youtube className="h-5 w-5" />
              </span>
            </span>
          </span>
          {item.title ? (
            <span className="mt-2 block line-clamp-2 overflow-hidden text-sm font-semibold leading-5 text-gray-950 group-hover/card:text-gray-700">
              {item.title}
            </span>
          ) : null}
        </a>
      )
    }

    return (
      <a
        key={item.id}
        href={item.url}
        target="_blank"
          rel="noopener noreferrer"
        className={`group/card relative ${cardClassName} min-w-0 shrink-0 overflow-hidden rounded-lg bg-gray-100 ring-1 ring-gray-200 transition-transform hover:-translate-y-0.5 ${
          mode === 'single' ? 'w-full' : 'w-32 min-[420px]:w-[10.5rem] sm:w-48'
        }`}
        aria-label={item.title || `${config.label} preview`}
      >
        {item.thumbnailUrl ? (
          <img src={item.thumbnailUrl} alt="" className="h-full w-full object-cover object-center" loading="lazy" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-gray-400">
            <Icon className="h-8 w-8" />
          </div>
        )}
        {item.title ? (
          <span className="absolute inset-x-0 bottom-0 max-h-full overflow-hidden bg-gradient-to-t from-black/70 to-transparent px-2 pb-2 pt-8 text-xs font-semibold leading-4 text-white opacity-0 transition-opacity group-hover/card:opacity-100">
            <span className="line-clamp-2 overflow-hidden">
              {item.title}
            </span>
          </span>
        ) : null}
      </a>
    )
  }

  return (
    <Card asChild variant="default" size="sm" className="flex h-full min-h-0 min-w-0 flex-col">
      <section>
      <div className={`flex min-w-0 gap-3 ${isCompact ? 'h-full items-center' : 'mb-3 flex-col sm:flex-row sm:items-end sm:justify-between'}`}>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white"
              style={getSocialBubbleStyle(type)}
            >
              <Icon className="h-4 w-4" />
            </span>
            <h2 className={`${isCompact ? 'text-base' : isNarrow ? 'text-xl' : 'text-2xl'} min-w-0 truncate font-semibold text-gray-950`}>{config.label}</h2>
          </div>
          <div className={`${isCompact ? 'mt-1' : 'mt-2'} flex min-w-0 items-center gap-1.5 text-sm text-gray-500`}>
            <span className="shrink-0">{config.inputPrefix}</span>
            {canEdit ? (
              <input
                value={handle}
                onChange={(event) => onChange(normalizeSocialInput(type, event.target.value))}
                onPaste={(event) => {
                  event.preventDefault()
                  onChange(normalizeSocialInput(type, event.clipboardData.getData('text')))
                }}
                onBlur={onBlur}
                placeholder={config.inputPlaceholder}
                className="min-w-0 flex-1 border-0 bg-transparent p-0 font-medium text-gray-700 outline-none placeholder:text-gray-300 focus:text-[var(--org-primary-color)]"
                autoComplete="url"
              />
            ) : handle && href ? (
              <a href={href} target="_blank" rel="noopener noreferrer" className="min-w-0 truncate font-medium text-gray-700 hover:text-gray-950 hover:underline">
                {handle}
              </a>
            ) : (
              <span className="font-medium text-gray-400">No handle yet</span>
            )}
          </div>
        </div>
        {isCompact ? (
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <span className="hidden text-sm font-semibold text-gray-500 sm:inline">{itemCountLabel}</span>
            {href ? (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className={buttonVariants({ variant: 'surface', size: 'sm' })}
              >
                Open
              </a>
            ) : null}
          </div>
        ) : href ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 text-sm font-semibold text-gray-500 transition-colors hover:text-gray-950"
          >
            {isNarrow ? 'Open' : `Open ${config.label}`}
          </a>
        ) : null}
      </div>

      {!isCompact && handle ? (
        <div className={`${isSingleCardCarousel ? 'min-h-0 flex-1 overflow-hidden' : '-mx-4 min-h-0 flex-1 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0'}`}>
          <div className={feedClassName}>
            {loading && loadedHandle !== handle ? (
              Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className={`${
                  isSingleCardCarousel ? 'h-full w-full' : type === 'youtube' ? 'h-full w-44 sm:w-56 md:w-64' : 'h-full w-32 min-[420px]:w-[10.5rem] sm:w-48'
                } shrink-0 animate-pulse rounded-lg bg-gray-100`} />
              ))
            ) : items.length > 0 ? (
              isSingleCardCarousel && activeItem ? (
                <div className="flex h-full min-h-0 flex-col">
                  <div className="relative min-h-0 flex-1">
                    {renderPreviewCard(activeItem, 'single')}
                    {items.length > 1 ? (
                      <>
                        <button
                          type="button"
                          onClick={() => setActiveIndex((current) => (current - 1 + items.length) % items.length)}
                          className="absolute left-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-white/95 text-gray-900 shadow-sm ring-1 ring-gray-200 hover:bg-white"
                          aria-label={`Previous ${config.label} preview`}
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setActiveIndex((current) => (current + 1) % items.length)}
                          className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-white/95 text-gray-900 shadow-sm ring-1 ring-gray-200 hover:bg-white"
                          aria-label={`Next ${config.label} preview`}
                        >
                          <ChevronRight className="h-4 w-4" />
                        </button>
                      </>
                    ) : null}
                  </div>
                  {items.length > 1 ? (
                    <div className="mt-3 flex items-center justify-center gap-1.5">
                      {items.map((item, index) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setActiveIndex(index)}
                          className={`h-2 rounded-full transition-all ${index === activeIndex ? 'w-5 bg-gray-950' : 'w-2 bg-gray-300 hover:bg-gray-400'}`}
                          aria-label={`Show ${config.label} preview ${index + 1}`}
                        />
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : (
                items.map((item) => renderPreviewCard(item, 'strip'))
              )
            ) : (
              <div className="flex h-full min-h-24 flex-1 items-center rounded-lg border border-dashed border-gray-300 bg-white p-5 text-sm leading-6 text-gray-500">
                {emptyMessage}
              </div>
            )}
          </div>
        </div>
      ) : !isCompact ? (
        <div className="flex min-h-0 flex-1 items-center rounded-lg border border-dashed border-gray-300 bg-white p-5 text-sm leading-6 text-gray-500">
          {emptyMessage}
        </div>
      ) : null}
      </section>
    </Card>
  )
}

function EmptyWidgetPreview({ type }: { type: ProfileWidgetType }) {
  const config = PROFILE_WIDGET_CONFIG[type]
  const Icon = config.icon
  return (
    <div className="rounded-lg border border-dashed border-gray-300 bg-white p-5">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-md bg-gray-100 text-gray-500">
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-500">{config.label}</p>
          <div className="mt-2 h-3 w-1/2 rounded-full bg-gray-100" />
        </div>
      </div>
      <div className="mt-5 grid gap-2">
        <div className="h-4 w-3/4 rounded-full bg-gray-100" />
        <div className="h-4 w-full rounded-full bg-gray-100" />
        <div className="h-4 w-2/3 rounded-full bg-gray-100" />
      </div>
    </div>
  )
}

function cleanCourseUuid(courseUuid?: string) {
  return String(courseUuid || '').replace('course_', '')
}

function getActivityHref(orgslug: string, courseUuid: string, activityUuid?: string | null) {
  const cleanCourse = cleanCourseUuid(courseUuid)
  const cleanActivity = String(activityUuid || '').replace('activity_', '')
  if (!cleanActivity) return getUriWithOrg(orgslug, `/course/${cleanCourse}`)
  return getUriWithOrg(orgslug, `/course/${cleanCourse}/activity/${cleanActivity}`)
}

function getResultForQuiz(chapter: any, quiz: any) {
  return (
    (chapter?.completed_quiz_results || []).find(
      (item: any) => item?.activity?.activity_uuid === quiz?.activity_uuid
    ) || null
  )
}

function getCoreCourseQuizzes(coreCourseItem: any) {
  const course = coreCourseItem?.course || {}
  return (coreCourseItem?.chapters || []).flatMap((chapter: any) =>
    (chapter?.quiz_activities || []).map((quiz: any) => ({
      chapter,
      course,
      quiz,
      result: getResultForQuiz(chapter, quiz),
    }))
  )
}

function findCoreQuizWidget(coreCourses: any[], item: ProfileLayoutItem) {
  for (const coreCourseItem of coreCourses || []) {
    const course = coreCourseItem?.course || {}
    if (item.courseUuid && course.course_uuid !== item.courseUuid) continue
    const match = getCoreCourseQuizzes(coreCourseItem).find(
      (quizItem: any) => quizItem.quiz?.activity_uuid === item.activityUuid
    )
    if (match) return match
  }
  return null
}

function collectQuizQuestionPages(quizItem: any) {
  const contentNodes = quizItem?.result?.activity?.content?.content
    || quizItem?.quiz?.content?.content
    || quizItem?.quiz?.content
    || []
  const tabLabels = quizItem?.result?.activity?.details?.ungraded_result_tab_labels
    || quizItem?.quiz?.details?.ungraded_result_tab_labels
    || {}
  const pages: Array<{ questionUuid: string; label: string }> = []

  const visit = (nodes: any[]) => {
    for (const node of nodes || []) {
      const questionUuid = node?.attrs?.question_uuid
      if (typeof questionUuid === 'string' && questionUuid) {
        const override = tabLabels?.[questionUuid]
        pages.push({
          questionUuid,
          label: typeof override === 'string' && override.trim()
            ? override.trim()
            : node?.attrs?.question_text || `Page ${pages.length + 1}`,
        })
      }
      if (Array.isArray(node?.content)) visit(node.content)
    }
  }

  visit(Array.isArray(contentNodes) ? contentNodes : [])
  return pages
}

function getQuizPageLabel(quizItem: any, questionUuid?: string) {
  if (!questionUuid) return quizItem?.quiz?.name || 'Quiz result'
  const page = collectQuizQuestionPages(quizItem).find((item) => item.questionUuid === questionUuid)
  return page?.label || quizItem?.quiz?.name || 'Quiz result'
}

function ProfileCoreQuizWidget({
  item,
  coreCourses,
  orgslug,
  grid,
  canManage,
  publicMode,
  onToggleQuestionHidden,
}: {
  item: ProfileLayoutItem
  coreCourses: any[]
  orgslug: string
  grid: ProfileGridPosition
  canManage: boolean
  publicMode: boolean
  onToggleQuestionHidden(questionUuid: string): void
}) {
  const quizItem = findCoreQuizWidget(coreCourses, item)
  if (!quizItem) return canManage ? <EmptyWidgetPreview type="coreQuiz" /> : null

  const { course, quiz, result } = quizItem
  if (!canManage && !result) return null

  const quizHref = getActivityHref(orgslug, course.course_uuid, quiz.activity_uuid)
  const pageLabel = getQuizPageLabel(quizItem, item.questionUuid)
  const isCompact = grid.h === 1
  const isNarrow = grid.w === 1

  if (isCompact) {
    return (
      <Card asChild variant="default" size="sm" className="flex h-full min-w-0 items-center justify-between gap-4">
        <section>
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold text-gray-950">{pageLabel}</h3>
        </div>
        <Link
          href={quizHref}
          className={buttonVariants({ variant: 'surface', size: 'sm', className: 'shrink-0' })}
        >
          Open
        </Link>
        </section>
      </Card>
    )
  }

  return (
    <Card asChild variant="default" size="none" className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
      <section>
      <div className={`${isNarrow ? 'p-2' : 'p-2.5'} border-b border-gray-100`}>
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <h3 className={`${isNarrow ? 'text-base' : 'text-lg'} truncate font-bold text-gray-950`}>{pageLabel}</h3>
              </div>
              <Link
                href={quizHref}
                className={buttonVariants({ variant: 'surface', size: 'sm', className: 'w-fit shrink-0' })}
              >
                Open
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 bg-white px-2 pb-0 pt-2 sm:px-2.5 sm:pt-2.5">
        {result ? (
          <div className="profile-quiz-result-scroll h-full overflow-y-auto">
            <style jsx global>{`
              .profile-quiz-result-scroll {
                scrollbar-width: none;
              }
              .profile-quiz-result-scroll:hover {
                scrollbar-width: thin;
                scrollbar-color: #d4d4d8 transparent;
              }
              .profile-quiz-result-scroll::-webkit-scrollbar {
                width: 0;
                height: 0;
              }
              .profile-quiz-result-scroll:hover::-webkit-scrollbar {
                width: 6px;
                height: 6px;
              }
              .profile-quiz-result-scroll:hover::-webkit-scrollbar-thumb {
                background: #d4d4d8;
                border-radius: 999px;
              }
              .profile-quiz-result-scroll:hover::-webkit-scrollbar-track {
                background: transparent;
              }
            `}</style>
            <QuizResultsView
              result={result.result}
              activity={result.activity}
              org={{ org_uuid: course?.owner_org_uuid || course?.org_uuid }}
              course={{ courseStructure: { course_uuid: course?.course_uuid } }}
              onRetake={() => {}}
              showRetakeButton={false}
              sectionedContent
              hiddenQuestionUuids={item.hiddenQuestionUuids || []}
              selectedQuestionUuid={item.questionUuid}
              onToggleQuestionHidden={canManage ? onToggleQuestionHidden : undefined}
              publicMode={publicMode}
              profileGrid={{ w: grid.w, h: grid.h }}
            />
          </div>
        ) : (
          <div className="flex h-full min-h-0 flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50 p-6 text-center">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-gray-400 shadow-xs">
              <Lock className="h-5 w-5" />
            </div>
            <p className="mt-3 text-sm font-semibold text-gray-800">{quiz.name || 'Result locked'}</p>
            <p className="mt-1 max-w-md text-sm text-gray-500">
              Complete this quiz activity to unlock its response card here.
            </p>
            <Link
              href={quizHref}
              className={buttonVariants({ variant: 'brand', size: 'sm', className: 'mt-4' })}
            >
              Get started
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        )}
      </div>
      </section>
    </Card>
  )
}

const RICH_TEXT_ALLOWED_TAGS = new Set(['a', 'b', 'blockquote', 'br', 'em', 'h2', 'h3', 'i', 'li', 'ol', 'p', 's', 'strong', 'u', 'ul'])

function hasHtmlMarkup(value: string) {
  return /<\/?[a-z][\s\S]*>/i.test(value)
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function plainTextToHtml(value: string) {
  const lines = escapeHtml(value || '').split(/\r?\n/)
  return lines.map((line) => line || '<br>').join('<br>')
}

function sanitizeProfileRichText(value: string) {
  const source = hasHtmlMarkup(value) ? value : plainTextToHtml(value)
  return source
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, '')
    .replace(/<\/?([a-z0-9]+)([^>]*)>/gi, (match, rawTag, rawAttrs) => {
      const tag = String(rawTag).toLowerCase()
      if (!RICH_TEXT_ALLOWED_TAGS.has(tag)) return ''
      if (tag === 'br') return '<br>'
      const isClosing = /^<\//.test(match)
      if (isClosing) return `</${tag}>`
      if (tag !== 'a') return `<${tag}>`

      const hrefMatch = /href\s*=\s*["']([^"']+)["']/i.exec(rawAttrs || '')
      const href = hrefMatch?.[1]?.trim() || ''
      if (!href || /^javascript:/i.test(href)) return '<a>'
      return `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">`
    })
}

function getRichTextPlainText(value: string) {
  return value
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|li|h2|h3|blockquote)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .trim()
}

function RichTextFormatButton({
  label,
  onCommand,
  children,
}: {
  label: string
  onCommand(): void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onMouseDown={(event) => {
        event.preventDefault()
        onCommand()
      }}
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-950"
    >
      {children}
    </button>
  )
}

function ProfileRichTextEditor({
  value,
  placeholder,
  compact,
  onChange,
  onBlur,
}: {
  value: string
  placeholder: string
  compact: boolean
  onChange(value: string): void
  onBlur?(): void
}) {
  const editorRef = useRef<HTMLDivElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const lastHtmlRef = useRef(sanitizeProfileRichText(value || ''))
  const [active, setActive] = useState(false)
  const [currentHtml, setCurrentHtml] = useState(lastHtmlRef.current)
  const empty = !getRichTextPlainText(currentHtml)

  useEffect(() => {
    const editor = editorRef.current
    if (!editor || document.activeElement === editor) return
    const nextHtml = sanitizeProfileRichText(value || '')
    lastHtmlRef.current = nextHtml
    setCurrentHtml(nextHtml)
    if (editor.innerHTML !== nextHtml) editor.innerHTML = nextHtml
  }, [value])

  const syncValue = () => {
    const editor = editorRef.current
    if (!editor) return
    const nextHtml = editor.innerHTML
    lastHtmlRef.current = nextHtml
    setCurrentHtml(nextHtml)
    onChange(nextHtml)
  }

  const runCommand = (command: string, commandValue?: string) => {
    const editor = editorRef.current
    if (!editor) return
    editor.focus()
    document.execCommand(command, false, commandValue)
    syncValue()
  }

  const handleBlur = () => {
    window.setTimeout(() => {
      if (containerRef.current?.contains(document.activeElement)) return
      setActive(false)
      const editor = editorRef.current
      if (editor) {
        const sanitized = sanitizeProfileRichText(editor.innerHTML)
        if (editor.innerHTML !== sanitized) editor.innerHTML = sanitized
        lastHtmlRef.current = sanitized
        setCurrentHtml(sanitized)
        onChange(sanitized)
      }
      onBlur?.()
    }, 0)
  }

  return (
    <div ref={containerRef} className="flex min-h-0 flex-1 flex-col">
      <div className="relative min-h-0 flex-1">
        {empty ? (
          <div className="pointer-events-none absolute inset-0 select-none text-base leading-7 text-gray-400">
            {placeholder}
          </div>
        ) : null}
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          onFocus={() => setActive(true)}
          onBlur={handleBlur}
          onInput={syncValue}
          className={`${compact ? 'leading-6' : 'leading-7'} profile-rich-text min-h-0 h-full overflow-y-auto break-words text-base text-gray-800 outline-none`}
        />
      </div>

      {active ? (
        <div className="mt-2 flex w-full shrink-0 items-center gap-1 rounded-lg border border-gray-200 bg-white p-1 shadow-sm">
          <RichTextFormatButton label="Bold" onCommand={() => runCommand('bold')}>
            <Bold className="h-4 w-4" />
          </RichTextFormatButton>
          <RichTextFormatButton label="Italic" onCommand={() => runCommand('italic')}>
            <Italic className="h-4 w-4" />
          </RichTextFormatButton>
          <RichTextFormatButton label="Underline" onCommand={() => runCommand('underline')}>
            <Underline className="h-4 w-4" />
          </RichTextFormatButton>
          <RichTextFormatButton label="Bullet list" onCommand={() => runCommand('insertUnorderedList')}>
            <List className="h-4 w-4" />
          </RichTextFormatButton>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="More formatting"
                title="More formatting"
                onMouseDown={(event) => event.preventDefault()}
                className="ml-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-950"
              >
                <ChevronDown className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onMouseDown={(event) => event.preventDefault()} onSelect={() => runCommand('insertOrderedList')}>
                <ListOrdered className="mr-2 h-4 w-4" />
                Numbered list
              </DropdownMenuItem>
              <DropdownMenuItem onMouseDown={(event) => event.preventDefault()} onSelect={() => runCommand('formatBlock', 'h2')}>
                <Heading2 className="mr-2 h-4 w-4" />
                Heading
              </DropdownMenuItem>
              <DropdownMenuItem onMouseDown={(event) => event.preventDefault()} onSelect={() => runCommand('formatBlock', 'blockquote')}>
                <Quote className="mr-2 h-4 w-4" />
                Quote
              </DropdownMenuItem>
              <DropdownMenuItem onMouseDown={(event) => event.preventDefault()} onSelect={() => runCommand('removeFormat')}>
                <RemoveFormatting className="mr-2 h-4 w-4" />
                Clear style
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ) : null}
    </div>
  )
}

function normalizeProfileMediaUrl(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return ''
  if (/^(https?:|blob:|data:|\/)/i.test(trimmed)) return trimmed
  return `https://${trimmed}`
}

function getYouTubeEmbedUrl(value: string) {
  try {
    const url = new URL(normalizeProfileMediaUrl(value))
    const hostname = url.hostname.replace(/^www\./i, '').toLowerCase()
    if (hostname === 'youtu.be') {
      const id = url.pathname.split('/').filter(Boolean)[0]
      return id ? `https://www.youtube.com/embed/${id}` : ''
    }
    if (hostname.endsWith('youtube.com')) {
      const id = url.searchParams.get('v') || url.pathname.split('/').filter(Boolean).at(-1)
      return id ? `https://www.youtube.com/embed/${id}` : ''
    }
  } catch {
    return ''
  }
  return ''
}

function getVimeoEmbedUrl(value: string) {
  try {
    const url = new URL(normalizeProfileMediaUrl(value))
    const hostname = url.hostname.replace(/^www\./i, '').toLowerCase()
    if (!hostname.endsWith('vimeo.com')) return ''
    const id = url.pathname.split('/').filter(Boolean).find((part) => /^\d+$/.test(part))
    return id ? `https://player.vimeo.com/video/${id}` : ''
  } catch {
    return ''
  }
}

function getProfileMediaKind(value: string): 'image' | 'video' | 'audio' | 'embed' | 'link' {
  const url = normalizeProfileMediaUrl(value)
  if (!url) return 'link'
  if (getYouTubeEmbedUrl(url) || getVimeoEmbedUrl(url)) return 'embed'
  const cleanUrl = url.split(/[?#]/)[0].toLowerCase()
  if (/\.(png|jpe?g|gif|webp|avif|svg)$/.test(cleanUrl) || /^data:image\//i.test(url)) return 'image'
  if (/\.(mp4|webm|ogg|mov|m4v)$/.test(cleanUrl) || /^data:video\//i.test(url)) return 'video'
  if (/\.(mp3|wav|oga|m4a|aac|flac)$/.test(cleanUrl) || /^data:audio\//i.test(url)) return 'audio'
  return 'link'
}

function ProfileMediaDisplay({ url, title }: { url: string; title?: string }) {
  const mediaUrl = normalizeProfileMediaUrl(url)
  const kind = getProfileMediaKind(mediaUrl)
  const embedUrl = kind === 'embed' ? getYouTubeEmbedUrl(mediaUrl) || getVimeoEmbedUrl(mediaUrl) : ''

  if (!mediaUrl) return <EmptyWidgetPreview type="media" />
  if (kind === 'image') {
    return <img src={mediaUrl} alt={title || ''} className="h-full w-full object-contain" loading="lazy" />
  }
  if (kind === 'video') {
    return <video src={mediaUrl} className="h-full w-full bg-black object-contain" controls playsInline />
  }
  if (kind === 'audio') {
    return (
      <div className="flex h-full w-full items-center justify-center bg-gray-950 p-5">
        <audio src={mediaUrl} controls className="w-full" />
      </div>
    )
  }
  if (embedUrl) {
    return (
      <iframe
        src={embedUrl}
        title={title || 'Portfolio media'}
        className="h-full w-full border-0 bg-black"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
      />
    )
  }
  return (
    <a
      href={mediaUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="flex h-full w-full flex-col items-center justify-center gap-3 bg-gray-950 p-5 text-center text-white"
    >
      <Link2 className="h-7 w-7" />
      <span className="line-clamp-2 text-sm font-semibold">{title || mediaUrl}</span>
    </a>
  )
}

function ProfileMediaSection({
  section,
  canEdit,
  uploading,
  onChange,
  onBlur,
  onUpload,
}: {
  section: ProfileCustomSection
  canEdit: boolean
  uploading?: boolean
  onChange?(patch: Partial<ProfileCustomSection>): void
  onBlur?(): void
  onUpload?(file: File): Promise<string | null>
}) {
  const fileInputId = useId()
  const [editing, setEditing] = useState(!section.mediaUrl && canEdit)
  const [linkDraft, setLinkDraft] = useState(section.mediaUrl || '')
  const mediaUrl = normalizeProfileMediaUrl(section.mediaUrl || '')
  const hasMedia = Boolean(mediaUrl)

  useEffect(() => {
    if (!editing) setLinkDraft(section.mediaUrl || '')
  }, [editing, section.mediaUrl])

  const commitMedia = () => {
    onChange?.({ mediaUrl: normalizeProfileMediaUrl(linkDraft) })
    setEditing(false)
    window.setTimeout(() => onBlur?.(), 0)
  }

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file || !onUpload) return
    const uploadedUrl = await onUpload(file)
    if (uploadedUrl) {
      setLinkDraft(uploadedUrl)
      onChange?.({ mediaUrl: uploadedUrl })
      setEditing(false)
      window.setTimeout(() => onBlur?.(), 0)
    }
    event.target.value = ''
  }

  return (
    <Card asChild variant="default" size="none" className="group/portfolio-media relative h-full min-h-0 overflow-hidden">
      <section>
      <div className="absolute inset-0 bg-gray-100">
        {hasMedia ? <ProfileMediaDisplay url={mediaUrl} title={section.title} /> : <EmptyWidgetPreview type="media" />}
      </div>

      {section.title || canEdit ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/75 via-black/35 to-transparent px-4 pb-4 pt-14 opacity-0 transition-opacity group-hover/portfolio-media:opacity-100">
          {canEdit ? (
            <input
              value={section.title || ''}
              onChange={(event) => onChange?.({ title: event.target.value })}
              onBlur={onBlur}
              placeholder="Media title"
              data-profile-grid-control="true"
              className="pointer-events-auto w-full select-none border-0 bg-transparent p-0 text-base font-semibold text-white outline-none placeholder:text-white/70 focus:select-text"
            />
          ) : section.title ? (
            <p className="line-clamp-2 select-none text-base font-semibold leading-5 text-white">{section.title}</p>
          ) : null}
        </div>
      ) : null}

      {canEdit ? (
        <>
          <input
            id={fileInputId}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="hidden"
            onChange={handleUpload}
          />
          <button
            type="button"
            data-profile-grid-control="true"
            onClick={() => editing ? commitMedia() : setEditing(true)}
            disabled={uploading}
            className={`absolute right-3 top-3 z-20 flex h-9 w-9 items-center justify-center rounded-full bg-white text-gray-800 shadow-sm ring-1 ring-gray-200 transition-all hover:text-gray-950 disabled:cursor-wait disabled:opacity-80 ${
              editing ? 'opacity-100' : 'opacity-0 group-hover/portfolio-media:opacity-100'
            }`}
            aria-label={editing ? 'Save media' : 'Add media'}
            title={editing ? 'Save media' : 'Add media'}
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : editing ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          </button>

          <AnimatePresence>
            {editing ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 z-10 flex items-center justify-center bg-black/60 p-4"
                data-profile-grid-control="true"
              >
                <div className="w-full max-w-sm rounded-lg border border-white/20 bg-white p-3 shadow-xl">
                  <label
                    htmlFor={fileInputId}
                    className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-gray-300 px-3 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                  >
                    <Upload className="h-4 w-4" />
                    Upload image
                  </label>
                  <div className="mt-3 flex items-center gap-2">
                    <Input
                      value={linkDraft}
                      onChange={(event) => setLinkDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') commitMedia()
                      }}
                      placeholder="Paste image, video, YouTube, or Vimeo link"
                      autoComplete="url"
                    />
                  </div>
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </>
      ) : null}
      </section>
    </Card>
  )
}

function CustomProfileSectionView({
  section,
  grid,
  canEdit = false,
  onChange,
  onBlur,
  uploadingMedia = false,
  onUploadMedia,
}: {
  section?: ProfileCustomSection
  grid: ProfileGridPosition
  canEdit?: boolean
  onChange?(patch: Partial<ProfileCustomSection>): void
  onBlur?(): void
  uploadingMedia?: boolean
  onUploadMedia?(file: File): Promise<string | null>
}) {
  if (!section) return null
  const compact = grid.h === 1
  if (section.type === 'title') {
    return (
      <Card asChild variant="default" size="sm" className="flex h-full items-center">
        <section>
        {canEdit ? (
          <input
            value={section.title || ''}
            onChange={(event) => onChange?.({ title: event.target.value })}
            onBlur={onBlur}
            placeholder="Untitled section"
            className="w-full select-none border-0 bg-transparent p-0 text-3xl font-black leading-tight text-gray-950 outline-none placeholder:text-gray-300 focus:select-text"
          />
        ) : (
          <h2 className="select-none text-3xl font-black leading-tight text-gray-950">{section.title || 'Untitled section'}</h2>
        )}
        </section>
      </Card>
    )
  }
  if (section.type === 'text') {
    return (
      <Card asChild variant="default" size="sm" className="flex h-full min-h-0 flex-col">
        <section>
        <style jsx global>{`
          .profile-rich-text ul,
          .profile-rich-text ol,
          .profile-rich-text-rendered ul,
          .profile-rich-text-rendered ol {
            margin: 0.35rem 0;
            padding-left: 1.25rem;
          }
          .profile-rich-text ul,
          .profile-rich-text-rendered ul {
            list-style: disc;
          }
          .profile-rich-text ol,
          .profile-rich-text-rendered ol {
            list-style: decimal;
          }
          .profile-rich-text li,
          .profile-rich-text-rendered li {
            margin: 0.15rem 0;
          }
          .profile-rich-text h2,
          .profile-rich-text-rendered h2 {
            margin: 0.25rem 0;
            font-size: 1.15rem;
            font-weight: 700;
            line-height: 1.25;
            color: #111827;
          }
          .profile-rich-text blockquote,
          .profile-rich-text-rendered blockquote {
            margin: 0.35rem 0;
            border-left: 3px solid #d1d5db;
            padding-left: 0.75rem;
            color: #4b5563;
          }
          .profile-rich-text a,
          .profile-rich-text-rendered a {
            color: #047857;
            text-decoration: underline;
            text-underline-offset: 2px;
          }
        `}</style>
        {canEdit ? (
          <>
            <input
              value={section.title || ''}
              onChange={(event) => onChange?.({ title: event.target.value })}
              onBlur={onBlur}
              placeholder="Section title"
              className={`${compact ? 'mb-2 text-lg' : 'mb-3 text-2xl'} w-full select-none border-0 bg-transparent p-0 font-semibold text-gray-950 outline-none placeholder:text-gray-300 focus:select-text`}
            />
            <ProfileRichTextEditor
              value={section.body || ''}
              onChange={(value) => onChange?.({ body: value })}
              onBlur={onBlur}
              placeholder="Empty text section"
              compact={compact}
            />
          </>
        ) : (
          <>
            {section.title ? <h2 className={`${compact ? 'mb-2 text-lg' : 'mb-3 text-2xl'} select-none font-semibold text-gray-950`}>{section.title}</h2> : null}
            <div
              className={`${compact ? 'line-clamp-2' : 'overflow-y-auto'} profile-rich-text-rendered min-h-0 flex-1 select-none text-base leading-7 text-gray-800`}
              dangerouslySetInnerHTML={{ __html: sanitizeProfileRichText(section.body || 'Empty text section') }}
            />
          </>
        )}
        </section>
      </Card>
    )
  }
  if (section.type === 'link') {
    const href = normalizeSocialInput('website', section.url || '')
    return (
      <Card asChild variant="default" size="sm" className="flex h-full items-center">
        <section>
        <div className="flex h-full w-full items-center justify-between gap-4 text-gray-950">
          <div className="min-w-0">
            {canEdit ? (
              <>
                <input
                  value={section.title || ''}
                  onChange={(event) => onChange?.({ title: event.target.value })}
                  onBlur={onBlur}
                  placeholder="Untitled link"
                  className="w-full select-none truncate border-0 bg-transparent p-0 text-lg font-semibold text-gray-950 outline-none placeholder:text-gray-300 focus:select-text"
                />
                <input
                  value={section.url || ''}
                  onChange={(event) => onChange?.({ url: event.target.value })}
                  onBlur={onBlur}
                  placeholder="No URL yet"
                  className="mt-1 w-full select-none truncate border-0 bg-transparent p-0 text-sm text-gray-500 outline-none placeholder:text-gray-300 focus:select-text"
                />
              </>
            ) : (
              <a href={href || '#'} target="_blank" rel="noopener noreferrer" className="block min-w-0">
                <p className="truncate select-none text-lg font-semibold">{section.title || 'Untitled link'}</p>
                <p className="mt-1 truncate select-none text-sm text-gray-500">{section.url || 'No URL yet'}</p>
              </a>
            )}
          </div>
          <Link2 className="h-5 w-5 text-gray-400" />
        </div>
        </section>
      </Card>
    )
  }
  if (section.type === 'media') {
    return (
      <ProfileMediaSection
        section={section}
        canEdit={canEdit}
        uploading={uploadingMedia}
        onChange={onChange}
        onBlur={onBlur}
        onUpload={onUploadMedia}
      />
    )
  }
  return null
}

function ProfileAddTray({
  open,
  anchorRef,
  usedUniqueTypes,
  usedCoreQuizQuestionKeys,
  coreCourses,
  dragging,
  onToggle,
  onClose,
  onAdd,
  onDragStart,
  onDragging,
  onDragEnd,
  onCancelDrop,
}: {
  open: boolean
  anchorRef: React.RefObject<HTMLDivElement | null>
  usedUniqueTypes: Set<ProfileWidgetType>
  usedCoreQuizQuestionKeys: Set<string>
  coreCourses: any[]
  dragging: boolean
  onToggle(): void
  onClose(): void
  onAdd(type: ProfileWidgetType, courseUuid?: string, activityUuid?: string, questionUuid?: string): void
  onDragStart(type: ProfileWidgetType, event: React.DragEvent<HTMLButtonElement>, courseUuid?: string, activityUuid?: string, questionUuid?: string): void
  onDragging(): void
  onDragEnd(): void
  onCancelDrop(): void
}) {
  const trayRef = useRef<HTMLDivElement | null>(null)
  const activePicker = 'basic'
  const [contentFrame, setContentFrame] = useState({ left: 16, width: 0 })
  const basicSections: Array<{ title: string; types: ProfileWidgetType[] }> = [
    { title: 'Common', types: ['title', 'text', 'link', 'media'] },
    { title: 'Features', types: ['portfolio', 'timeline', 'achievements', 'values', 'strengths'] },
    { title: 'Socials', types: ['instagramPreview', 'youtubePreview'] },
  ]

  useEffect(() => {
    const updateFrame = () => {
      const rect = anchorRef.current?.getBoundingClientRect()
      if (!rect) return
      setContentFrame({ left: rect.left, width: rect.width })
    }

    updateFrame()
    window.addEventListener('resize', updateFrame)
    window.addEventListener('scroll', updateFrame, { passive: true })
    return () => {
      window.removeEventListener('resize', updateFrame)
      window.removeEventListener('scroll', updateFrame)
    }
  }, [anchorRef])

  useEffect(() => {
    if (!open) return
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.closest('[data-profile-add-tray-root="true"]')) return
      onClose()
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [open, onClose])

  return (
    <div
      className="pointer-events-none fixed bottom-5 z-40"
      style={{
        left: contentFrame.left,
        width: contentFrame.width || 'calc(100vw - 2rem)',
        height: open ? (dragging ? 64 : 384) : 56,
      }}
    >
      <AnimatePresence>
        {open ? (
          <motion.div
            ref={trayRef}
            key="tray"
            drag={dragging ? false : 'y'}
            dragConstraints={{ top: 0, bottom: 120 }}
            dragElastic={{ top: 0, bottom: 0.35 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 80 || info.velocity.y > 500) onClose()
            }}
            initial={{ opacity: 0, y: 18, scaleX: 0.08, scaleY: 0.16, borderRadius: 999 }}
            animate={{ opacity: 1, y: 0, scaleX: 1, scaleY: 1, borderRadius: dragging ? 18 : 24 }}
            exit={{ opacity: 0, y: 18, scaleX: 0.08, scaleY: 0.16, borderRadius: 999 }}
            transition={{ type: 'spring', stiffness: 430, damping: 34 }}
            style={{ transformOrigin: 'bottom right' }}
            className="pointer-events-auto absolute inset-x-0 bottom-0 overflow-hidden border border-gray-200 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.24)]"
            data-profile-add-tray-root="true"
            data-profile-add-tray="true"
          >
            {dragging ? (
              <div
                className="flex h-16 items-center justify-center border border-dashed border-gray-300 bg-gray-50 px-4 text-sm font-semibold text-gray-600"
                onDragOver={(event) => {
                  event.preventDefault()
                  event.dataTransfer.dropEffect = 'copy'
                }}
                onDrop={(event) => {
                  event.preventDefault()
                  onCancelDrop()
                }}
              >
                Drop here to cancel
              </div>
            ) : (
            <div className="relative flex h-96 flex-col">
              <div className="flex items-center justify-center border-b border-gray-100 px-4 py-3">
                <div className="inline-flex rounded-full bg-gray-100 p-1">
                  {(['basic'] as const).map((picker) => (
                    <button
                      key={picker}
                      type="button"
                      className={`rounded-full px-4 py-2 text-sm font-semibold capitalize transition-colors ${
                        activePicker === picker
                          ? 'bg-white text-gray-950 shadow-sm'
                          : 'text-gray-500 hover:text-gray-900'
                      }`}
                    >
                      {picker}
                    </button>
                  ))}
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto p-4 pb-20">
                {activePicker === 'basic' ? (
                  <div className="space-y-5">
                    {basicSections.map((section) => (
                      <section key={section.title} className="space-y-2">
                        <p className="px-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">{section.title}</p>
                        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 md:grid-cols-6">
                          {section.types.map((type) => {
                            const config = PROFILE_WIDGET_CONFIG[type]
                            const Icon = config.icon
                            const disabled = config.unique && usedUniqueTypes.has(type)
                            return (
                              <button
                                key={type}
                                type="button"
                                draggable={!disabled}
                                disabled={disabled}
                                onClick={() => onAdd(type)}
                                onPointerDown={(event) => event.stopPropagation()}
                                onDragStart={(event) => onDragStart(type, event)}
                                onDrag={onDragging}
                                onDragEnd={onDragEnd}
                                className="flex aspect-square flex-col items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white p-2 text-center text-gray-800 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400"
                              >
                                <Icon className="h-5 w-5" />
                                <span className="text-xs font-semibold leading-tight">{config.label}</span>
                              </button>
                            )
                          })}
                        </div>
                      </section>
                    ))}
                  </div>
                ) : (
                  null
                )}
              </div>
            </div>
            )}
          </motion.div>
        ) : null}
      </AnimatePresence>
      {open && !dragging ? (
        <button
          type="button"
          onClick={onToggle}
          className={buttonVariants({ variant: 'brand', size: 'icon', className: 'pointer-events-auto absolute bottom-0 right-0 z-10 h-14 w-14' })}
          aria-label="Close profile section tray"
          data-profile-add-tray-root="true"
        >
          <Plus className="h-6 w-6 rotate-45" />
        </button>
      ) : null}
      {!open ? (
        <motion.button
          type="button"
          whileTap={{ scale: 0.94 }}
          onClick={onToggle}
          className={buttonVariants({ variant: 'brand', size: 'icon', className: 'pointer-events-auto absolute bottom-0 right-0 h-14 w-14' })}
          aria-label="Add profile section"
        >
          <Plus className="h-6 w-6" />
        </motion.button>
      ) : null}
    </div>
  )
}

function ProfilePageClient({
  initialUser,
  orgslug,
  profileUsername,
  initialTab = 'overview',
  mode,
  isSelf = false,
  orgConfig,
  orgId,
  collections = [],
}: ProfilePageClientProps) {
  const router = useRouter()
  const session = useLHSession() as any
  const accessToken = session?.data?.tokens?.access_token
  const profileContentRef = useRef<HTMLDivElement | null>(null)
  const profileGridRef = useRef<HTMLDivElement | null>(null)
  const draftProfileRef = useRef<ProfileShape>(normalizeProfile(initialUser.profile))
  const pendingReorderProfileRef = useRef<ProfileShape | null>(null)
  const trayDraftItemRef = useRef<ProfileLayoutItem | null>(null)
  const trayDraftDroppedRef = useRef(false)
  const [user, setUser] = useState(initialUser)
  const [draft, setDraft] = useState(() => ({
    first_name: initialUser.first_name || '',
    last_name: initialUser.last_name || '',
    username: initialUser.username || '',
    bio: initialUser.bio || '',
    profile: normalizeProfile(initialUser.profile),
  }))
  const [isSaving, setIsSaving] = useState(false)
  const [uploading, setUploading] = useState<'avatar' | `media:${string}` | null>(null)
  const [headerModalOpen, setHeaderModalOpen] = useState(false)
  const [addTrayOpen, setAddTrayOpen] = useState(false)
  const [trayDraftItem, setTrayDraftItem] = useState<ProfileLayoutItem | null>(null)
  const [trayDropMode, setTrayDropMode] = useState(false)
  const [gridDropResetKey, setGridDropResetKey] = useState(0)
  const [profileGridWidth, setProfileGridWidth] = useState(0)
  const activeTab = initialTab

  const isOwnerMode = mode === 'owner'
  const isPublicMode = mode === 'public'
  const canManageProfile = isOwnerMode
  const { data: trail } = useSWR(
    canManageProfile && accessToken && initialTab === 'overview' && orgConfig?.org_id
      ? `${getAPIUrl()}trail/org/${orgConfig.org_id}/trail`
      : null,
    (url) => swrFetcher(url, accessToken),
    { revalidateOnFocus: false }
  )
  const canSeedDevProfile = canManageProfile && process.env.NODE_ENV === 'development'
  const effectiveEditMode = false
  const profile = normalizeProfile(user.profile)
  const headerProfile = canManageProfile ? draft.profile : profile
  const contentProfile = canManageProfile ? draft.profile : profile
  const header = headerProfile.header || {}
  const featured = (canManageProfile ? draft.profile.featured : profile.featured) || normalizeFeatured(null)
  const achievements = profile.achievements || normalizeAchievements(null)
  const timelineEnabled = profile.timelineEnabled ?? false
  const timelinePublicVisible = profile.timelinePublicVisible !== false
  const layout = contentProfile.layout || DEFAULT_PROFILE_LAYOUT
  const renderableLayout = useMemo(
    () => layout.filter((item) => shouldRenderProfileLayoutItem(item, contentProfile, canManageProfile)),
    [layout, contentProfile, canManageProfile]
  )
  const profileGridCols = PROFILE_GRID_COLS
  const profileGridKey = getProfileGridKey(profileGridCols)
  const gridLayout = useMemo(
    () => {
      const nextGridLayout = profileLayoutToGridLayout(renderableLayout, canManageProfile, profileGridCols, profileGridKey)
      if (canManageProfile) return nextGridLayout

      return compactProfileGridLayout(
        nextGridLayout.map((item) => ({
          ...item,
          static: false,
          isDraggable: false,
        })),
        profileGridCols
      ).map((item) => ({
        ...item,
        static: true,
        isDraggable: false,
        isResizable: false,
      }))
    },
    [renderableLayout, canManageProfile, profileGridCols, profileGridKey]
  )
  const profileGridRowHeight = PROFILE_GRID_ROW_HEIGHT
  const coreCourses: any[] = []
  const usedUniqueTypes = useMemo(
    () => new Set(layout.filter((item) => UNIQUE_PROFILE_WIDGETS.includes(item.type)).map((item) => item.type)),
    [layout]
  )
  const usedCoreQuizQuestionKeys = useMemo(
    () => new Set(layout
      .filter((item) => item.type === 'coreQuiz' && item.activityUuid && item.questionUuid)
      .map((item) => `${item.activityUuid}:${item.questionUuid}`)),
    [layout]
  )
  const socials = useMemo(() => header.socials ?? [], [header.socials])
  const avatarUrl = user.avatar_image
    ? getUserAvatarMediaDirectory(user.user_uuid, user.avatar_image)
    : ''
  const publicProfileHref = getUriWithOrg(orgslug, routePaths.org.user(user.username))
  const timelineHref = getUriWithOrg(
    orgslug,
    isPublicMode
      ? routePaths.org.userTimeline(profileUsername || user.username)
      : routePaths.org.portfolioTimeline()
  )
  const showPortfolioChecklist = canManageProfile && activeTab === 'overview'

  const missingSocialTypes = useMemo(
    () => (Object.keys(SOCIAL_CONFIG) as SocialType[]).filter(
      (type) => !socials.some((social) => social.type === type)
    ),
    [socials]
  )

  useEffect(() => {
    draftProfileRef.current = draft.profile
  }, [draft.profile])

  useEffect(() => {
    const grid = profileGridRef.current
    if (!grid) return

    const updateWidth = () => {
      setProfileGridWidth(getElementContentBox(grid).width)
    }
    updateWidth()

    const observer = new ResizeObserver(updateWidth)
    observer.observe(grid)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!trayDraftItem) return
    const clearDraft = () => {
      window.setTimeout(() => {
        if (trayDraftDroppedRef.current) return
        trayDraftItemRef.current = null
        setTrayDraftItem(null)
        setTrayDropMode(false)
        setGridDropResetKey((current) => current + 1)
      }, 0)
    }
    window.addEventListener('dragend', clearDraft)
    window.addEventListener('drop', clearDraft)
    return () => {
      window.removeEventListener('dragend', clearDraft)
      window.removeEventListener('drop', clearDraft)
    }
  }, [trayDraftItem])

  const updateDraftProfile = (updater: React.SetStateAction<ProfileShape>) => {
    setDraft((current) => ({
      ...current,
      profile: typeof updater === 'function'
        ? updater(current.profile)
        : updater,
    }))
  }

  const updateSocial = (type: SocialType, url: string) => {
    updateDraftProfile((current) => ({
      ...current,
      header: {
        ...(current.header || {}),
        socials: (current.header?.socials || []).some((social) => social.type === type)
          ? (current.header?.socials || []).map((social) =>
              social.type === type ? { ...social, url } : social
            )
          : [...(current.header?.socials || []), { type, url }],
      },
    }))
  }

  const addSocial = (type: SocialType) => {
    updateDraftProfile((current) => {
      if ((current.header?.socials || []).some((social) => social.type === type)) return current
      return {
        ...current,
        header: {
          ...(current.header || {}),
          socials: [...(current.header?.socials || []), { type, url: '' }],
        },
      }
    })
  }

  const removeSocial = (type: SocialType) => {
    updateDraftProfile((current) => ({
      ...current,
      header: {
        ...(current.header || {}),
        socials: (current.header?.socials || []).filter((social) => social.type !== type),
      },
    }))
  }

  const clearTrayDraft = () => {
    trayDraftItemRef.current = null
    trayDraftDroppedRef.current = false
    setTrayDraftItem(null)
    setTrayDropMode(false)
    setGridDropResetKey((current) => current + 1)
  }

  const updateFeatured = (nextFeatured: FeaturedSection) => {
    updateDraftProfile((current) => ({
      ...current,
      featured: nextFeatured,
    }))
  }

  const updateTimelinePublicVisible = (visible: boolean) => {
    updateDraftProfile((current) => ({
      ...current,
      timelinePublicVisible: visible,
    }))
  }

  const updateProfileTopFive = (kind: ProfileTopFiveKind, values: string[]) => {
    const nextProfile = {
      ...draftProfileRef.current,
      [kind]: normalizeProfileTopFive(values),
    }
    draftProfileRef.current = nextProfile
    updateDraftProfile(nextProfile)
    void persistProfile({ profileOverride: nextProfile })
  }

  const copyProfileLink = async () => {
    const link = typeof window === 'undefined'
      ? publicProfileHref
      : new URL(publicProfileHref, window.location.origin).toString()

    try {
      await navigator.clipboard.writeText(link)
      toast.success('Portfolio link copied')
    } catch {
      toast.error('Could not copy profile link')
    }
  }

  const seedDevProfile = async () => {
    if (!accessToken) return

    setIsSaving(true)
    const loadingToast = toast.loading('Populating profile')
    try {
      const res = await devSeedProfile(accessToken)
      if (!res.success) throw new Error(res.HTTPmessage)
      const seededUser = res.data?.user || res.data
      setUser(seededUser)
      setDraft((current) => ({
        ...current,
        first_name: seededUser.first_name || '',
        last_name: seededUser.last_name || '',
        username: seededUser.username || current.username,
        bio: seededUser.bio || '',
        profile: normalizeProfile(seededUser.profile),
      }))
      await session?.update?.(true)
      toast.success('Portfolio populated', { id: loadingToast })
    } catch {
      toast.error('Could not populate profile', { id: loadingToast })
    } finally {
      setIsSaving(false)
    }
  }

  const handleAvatarChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file || !accessToken) return

    setUploading('avatar')
    try {
      const res = await updateUserAvatar(user.id, file, accessToken)
      if (!res.success) throw new Error(res.HTTPmessage)
      setUser(res.data)
      await session?.update?.(true)
      toast.success('Portfolio photo updated')
    } catch {
      toast.error('Could not update profile photo')
    } finally {
      setUploading(null)
      event.target.value = ''
    }
  }

  const uploadProfileMedia = async (sectionId: string, file: File) => {
    if (!accessToken) return null

    setUploading(`media:${sectionId}`)
    try {
      const res = await uploadUserProfileFeaturedImage(user.id, file, accessToken)
      if (!res.success) throw new Error(res.HTTPmessage)
      const filename = res.data?.filename
      const userUuid = res.data?.user_uuid || user.user_uuid
      if (!filename || !userUuid) throw new Error('Missing uploaded media filename')
      toast.success('Media uploaded')
      return getUserProfileFeaturedMediaDirectory(userUuid, filename)
    } catch {
      toast.error('Could not upload media')
      return null
    } finally {
      setUploading(null)
    }
  }

  const persistProfile = async ({
    profileOverride,
    bioOverride,
    firstNameOverride,
    lastNameOverride,
  }: {
    profileOverride?: ProfileShape
    bioOverride?: string
    firstNameOverride?: string
    lastNameOverride?: string
  } = {}) => {
    if (!accessToken) return false
    const nextProfile = profileOverride || draft.profile
    const nextBio = bioOverride ?? draft.bio
    const nextFirstName = firstNameOverride ?? draft.first_name
    const nextLastName = lastNameOverride ?? draft.last_name
    const nextSocials = nextProfile.header?.socials || []

    const invalidSocial = nextSocials.find((social) => social.url && !isValidSocialUrl(social.type, social.url))
    if (invalidSocial) {
      toast.error(`Enter a valid ${SOCIAL_CONFIG[invalidSocial.type].label} link`)
      return false
    }

    setIsSaving(true)
    const loadingToast = toast.loading('Saving profile')
    try {
      const payload = {
        ...user,
        first_name: nextFirstName,
        last_name: nextLastName,
        username: user.username,
        bio: nextBio,
        profile: nextProfile,
      }
      const res = await updateProfile(payload, user.id, accessToken)
      if (!res.success) throw new Error(res.HTTPmessage)
      setUser(res.data)
      setDraft((current) => ({
        ...current,
        first_name: res.data.first_name || '',
        last_name: res.data.last_name || '',
        username: res.data.username || current.username,
        bio: res.data.bio || '',
        profile: normalizeProfile(res.data.profile),
      }))
      await session?.update?.(true)
      toast.success('Portfolio saved', { id: loadingToast })
      return true
    } catch {
      toast.error('Could not save profile', { id: loadingToast })
      return false
    } finally {
      setIsSaving(false)
    }
  }

  const handleSave = async (_redirectHref = getUriWithOrg(orgslug, routePaths.org.portfolio())) => {
    return persistProfile()
  }

  const createPortfolioPost = async () => {
    if ((featured.cards || []).length >= 10) {
      toast.error('Portfolio is capped at 10 posts')
      return
    }

    const nextCard = createEmptyFeaturedCard()
    const nextFeatured = {
      ...normalizeFeatured(featured),
      enabled: true,
      cards: [...(featured.cards || []), nextCard],
    }
    const nextProfile = {
      ...draft.profile,
      featured: nextFeatured,
    }

    updateDraftProfile(nextProfile)
    const saved = await persistProfile({ profileOverride: nextProfile })
    if (saved) {
      router.push(getUriWithOrg(orgslug, routePaths.org.portfolioPost(nextCard.slug)))
    }
  }

  const commitProfileLayout = (nextProfile: ProfileShape) => {
    draftProfileRef.current = nextProfile
    updateDraftProfile(nextProfile)
    void persistProfile({ profileOverride: nextProfile })
  }

  const updateProfileGridDraft = (nextGridLayout: ReactGridLayoutItems) => {
    const nextProfile = mergeGridIntoProfile(draftProfileRef.current, nextGridLayout, profileGridCols, profileGridKey)
    draftProfileRef.current = nextProfile
    pendingReorderProfileRef.current = nextProfile
    updateDraftProfile(nextProfile)
  }

  const persistProfileGridLayout = (nextGridLayout?: ReactGridLayoutItems) => {
    const nextProfile = nextGridLayout
      ? mergeGridIntoProfile(
        draftProfileRef.current,
        compactProfileGridLayout(nextGridLayout, profileGridCols),
        profileGridCols,
        profileGridKey
      )
      : pendingReorderProfileRef.current
    pendingReorderProfileRef.current = null
    if (!nextProfile) return
    draftProfileRef.current = nextProfile
    updateDraftProfile(nextProfile)
    void persistProfile({ profileOverride: nextProfile })
  }

  const startProfileGridResize = (
    itemId: string,
    axis: 'left' | 'right' | 'top' | 'bottom',
    event: React.PointerEvent<HTMLButtonElement>
  ) => {
    if (!canManageProfile) return
    event.preventDefault()
    event.stopPropagation()

    const startX = event.clientX
    const startY = event.clientY
    const startLayout = profileLayoutToGridLayout(
      draftProfileRef.current.layout || DEFAULT_PROFILE_LAYOUT,
      canManageProfile,
      profileGridCols,
      profileGridKey
    )
    const startItem = startLayout.find((gridItem) => gridItem.i === itemId)
    if (!startItem) return

    const columnWidth = profileGridWidth
      ? (profileGridWidth - PROFILE_GRID_MARGIN[0] * (profileGridCols - 1)) / profileGridCols
      : profileGridRowHeight
    const widthStep = columnWidth + PROFILE_GRID_MARGIN[0]
    const heightStep = profileGridRowHeight + PROFILE_GRID_MARGIN[1]
    let latestLayout = startLayout

    document.body.style.cursor = axis === 'left' || axis === 'right' ? 'ew-resize' : 'ns-resize'

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const rawDelta = axis === 'left' || axis === 'right'
        ? Math.round((moveEvent.clientX - startX) / widthStep)
        : Math.round((moveEvent.clientY - startY) / heightStep)
      const delta = axis === 'left' || axis === 'top' ? -rawDelta : rawDelta
      const nextW = axis === 'left' || axis === 'right'
        ? Math.min(profileGridCols, Math.max(1, startItem.w + delta))
        : startItem.w
      const nextH = axis === 'top' || axis === 'bottom'
        ? Math.min(3, Math.max(1, startItem.h + delta))
        : startItem.h

      latestLayout = compactProfileGridLayout(
        startLayout.map((gridItem) => (
          gridItem.i === itemId
            ? { ...gridItem, w: nextW, h: nextH, x: Math.min(gridItem.x, profileGridCols - nextW) }
            : gridItem
        )),
        profileGridCols
      )
      updateProfileGridDraft(latestLayout)
    }

    const handlePointerUp = () => {
      document.body.style.cursor = ''
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      persistProfileGridLayout(latestLayout)
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp, { once: true })
  }

  const addProfileSection = (type: ProfileWidgetType, courseUuid?: string, activityUuid?: string, questionUuid?: string) => {
    if (type === 'coreQuiz' && (!courseUuid || !activityUuid || !questionUuid || usedCoreQuizQuestionKeys.has(`${activityUuid}:${questionUuid}`))) return
    if (type === 'coreCourse' && !courseUuid) return
    if (PROFILE_WIDGET_CONFIG[type].unique && layout.some((item) => item.type === type)) return
    const item = createProfileLayoutItem(type, courseUuid, activityUuid, questionUuid)
    item.mobileGrid = clampProfileGridPosition(PROFILE_GRID_DROP_SIZE, type, layout.length, PROFILE_GRID_COLS)
    const section = createProfileSection(item)
    const nextProfile = {
      ...draft.profile,
      layout: [...layout, item],
      sections: section
        ? [...(draft.profile.sections || []), section]
        : (draft.profile.sections || []),
    }
    commitProfileLayout(nextProfile)
    setAddTrayOpen(false)
  }

  const startTrayDrag = (type: ProfileWidgetType, event: React.DragEvent<HTMLButtonElement>, courseUuid?: string, activityUuid?: string, questionUuid?: string) => {
    if (type === 'coreQuiz' && (!courseUuid || !activityUuid || !questionUuid || usedCoreQuizQuestionKeys.has(`${activityUuid}:${questionUuid}`))) return
    if (type === 'coreCourse' && !courseUuid) return
    if (PROFILE_WIDGET_CONFIG[type].unique && layout.some((item) => item.type === type)) return
    const item = createProfileLayoutItem(type, courseUuid, activityUuid, questionUuid)
    const itemIndex = (draftProfileRef.current.layout || DEFAULT_PROFILE_LAYOUT).length
    item.mobileGrid = clampProfileGridPosition(PROFILE_GRID_DROP_SIZE, type, itemIndex, PROFILE_GRID_COLS)

    event.dataTransfer.effectAllowed = 'copy'
    event.dataTransfer.dropEffect = 'copy'
    event.dataTransfer.setData('text/plain', item.id)
    event.dataTransfer.setData('application/x-profile-widget', item.id)
    const dragImage = document.createElement('div')
    dragImage.textContent = PROFILE_WIDGET_CONFIG[type].label
    dragImage.style.position = 'fixed'
    dragImage.style.top = '-1000px'
    dragImage.style.left = '-1000px'
    dragImage.style.border = '1px solid rgb(209 213 219)'
    dragImage.style.borderRadius = '12px'
    dragImage.style.background = 'white'
    dragImage.style.boxShadow = '0 18px 45px rgba(15, 23, 42, 0.2)'
    dragImage.style.color = 'rgb(17 24 39)'
    dragImage.style.font = '600 13px system-ui, sans-serif'
    dragImage.style.padding = '12px 16px'
    document.body.appendChild(dragImage)
    event.dataTransfer.setDragImage(dragImage, 24, 24)
    window.setTimeout(() => dragImage.remove(), 0)
    trayDraftItemRef.current = item
    trayDraftDroppedRef.current = false
    setTrayDraftItem(item)
  }

  const moveTrayDraft = (targetIndex: number) => {
    const item = trayDraftItemRef.current
    if (!item) return
    const currentLayout = draftProfileRef.current.layout || DEFAULT_PROFILE_LAYOUT
    const nextLayout = moveProfileLayoutItem(currentLayout, item.id, targetIndex)
    if (nextLayout === currentLayout) return

    const nextProfile = {
      ...draftProfileRef.current,
      layout: nextLayout,
    }
    draftProfileRef.current = nextProfile
    updateDraftProfile(nextProfile)
  }

  const moveTrayDraftAroundItem = (
    targetItem: ProfileLayoutItem,
    targetIndex: number,
    position: 'before' | 'after'
  ) => {
    const item = trayDraftItemRef.current
    if (!item || item.id === targetItem.id) return
    const currentLayout = draftProfileRef.current.layout || DEFAULT_PROFILE_LAYOUT
    const currentIndex = currentLayout.findIndex((layoutItem) => layoutItem.id === item.id)
    if (currentIndex === -1) return

    const rawTargetIndex = position === 'before' ? targetIndex : targetIndex + 1
    const adjustedTargetIndex = rawTargetIndex > currentIndex ? rawTargetIndex - 1 : rawTargetIndex
    moveTrayDraft(adjustedTargetIndex)
  }

  const finishTrayDrop = () => {
    const item = trayDraftItemRef.current
    if (!item) return

    trayDraftDroppedRef.current = true
    const section = createProfileSection(item)
    const nextProfile = {
      ...draftProfileRef.current,
      sections: section
        ? [...(draftProfileRef.current.sections || []), section]
        : (draftProfileRef.current.sections || []),
    }
    trayDraftItemRef.current = null
    setTrayDraftItem(null)
    setTrayDropMode(false)
    setGridDropResetKey((current) => current + 1)
    commitProfileLayout(nextProfile)
  }

  const finishTrayGridDrop = (
    _nextGridLayout: ReactGridLayoutItems,
    droppedGridItem: ReactGridLayoutItems[number] | undefined
  ) => {
    const item = trayDraftItemRef.current
    if (!item || !droppedGridItem) {
      cancelTrayDrag()
      return
    }

    const dropSize = getProfileGridDropSize(profileGridCols)
    const droppedGrid = clampProfileGridPosition(
      { ...droppedGridItem, ...dropSize },
      item.type,
      (draftProfileRef.current.layout || DEFAULT_PROFILE_LAYOUT).length,
      profileGridCols
    )
    const mobileGrid = clampProfileGridPosition(droppedGrid, item.type, 0, PROFILE_GRID_COLS)
    const nextItem = {
      ...item,
      mobileGrid,
    }
    const section = createProfileSection(nextItem)
    const nextProfile = {
      ...draftProfileRef.current,
      layout: [...(draftProfileRef.current.layout || DEFAULT_PROFILE_LAYOUT), nextItem],
      sections: section
        ? [...(draftProfileRef.current.sections || []), section]
        : (draftProfileRef.current.sections || []),
    }

    trayDraftDroppedRef.current = true
    trayDraftItemRef.current = null
    setTrayDraftItem(null)
    setTrayDropMode(false)
    setGridDropResetKey((current) => current + 1)
    setAddTrayOpen(false)
    pendingReorderProfileRef.current = null
    commitProfileLayout(nextProfile)
  }

  const cancelTrayDrag = () => {
    const item = trayDraftItemRef.current
    if (!item) {
      if (trayDraftItem || trayDropMode) clearTrayDraft()
      return
    }
    if (trayDraftDroppedRef.current) {
      trayDraftDroppedRef.current = false
      return
    }

    clearTrayDraft()
  }

  const handleLayoutReorder = (nextLayout: ProfileLayoutItem[]) => {
    const nextProfile = {
      ...draftProfileRef.current,
      layout: nextLayout,
    }
    draftProfileRef.current = nextProfile
    pendingReorderProfileRef.current = nextProfile
    updateDraftProfile(nextProfile)
  }

  const removeProfileLayoutItem = (item: ProfileLayoutItem) => {
    const nextProfile = {
      ...draftProfileRef.current,
      layout: (draftProfileRef.current.layout || DEFAULT_PROFILE_LAYOUT).filter((layoutItem) => layoutItem.id !== item.id),
      sections: (draftProfileRef.current.sections || []).filter((section) => section.id !== item.id),
    }
    pendingReorderProfileRef.current = null
    commitProfileLayout(nextProfile)
  }

  const toggleProfileQuizQuestionHidden = (itemId: string, questionUuid: string) => {
    const nextLayout = (draftProfileRef.current.layout || DEFAULT_PROFILE_LAYOUT).map((layoutItem) => {
      if (layoutItem.id !== itemId || layoutItem.type !== 'coreQuiz') return layoutItem
      const currentHidden = new Set(layoutItem.hiddenQuestionUuids || [])
      if (currentHidden.has(questionUuid)) currentHidden.delete(questionUuid)
      else currentHidden.add(questionUuid)
      return {
        ...layoutItem,
        hiddenQuestionUuids: Array.from(currentHidden),
      }
    })
    const nextProfile = {
      ...draftProfileRef.current,
      layout: nextLayout,
    }
    pendingReorderProfileRef.current = null
    commitProfileLayout(nextProfile)
  }

  const finishReorderDrag = () => {
    const nextProfile = pendingReorderProfileRef.current
    pendingReorderProfileRef.current = null
    void persistProfile(nextProfile ? { profileOverride: nextProfile } : undefined)
  }

  const updateCustomSection = (sectionId: string, patch: Partial<ProfileCustomSection>) => {
    updateDraftProfile((current) => ({
      ...current,
      sections: (current.sections || []).map((section) =>
        section.id === sectionId ? { ...section, ...patch } : section
      ),
    }))
  }

  const saveCustomSections = () => {
    void persistProfile()
  }

  const renderProfileLayoutSection = (item: ProfileLayoutItem) => {
    const grid = getProfileGridForItem(item, 0, profileGridCols, profileGridKey)
    if (trayDraftItem?.id === item.id) return <EmptyWidgetPreview type={item.type} />
    if (item.type === 'timeline') {
      if (!canManageProfile && (!timelineEnabled || !timelinePublicVisible)) return null
      return (
        <TimelineOverviewSection
          timeline={profile.timeline || []}
          href={timelineHref}
          grid={grid}
          canManage={canManageProfile}
        />
      )
    }
    if (item.type === 'portfolio') {
      return (
        <FeaturedCarousel
          featured={featured}
          editMode={false}
          grid={grid}
          accessToken={accessToken}
          userId={user.id}
          userUuid={user.user_uuid}
          orgslug={orgslug}
          profileUsername={profileUsername || user.username}
          ownerView={canManageProfile}
          publicVisible={isPublicMode ? featured.publicVisible : true}
          actions={canManageProfile ? (
            <Button type="button" variant="surface" size="icon" onClick={createPortfolioPost} disabled={isSaving} aria-label="Add portfolio post">
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            </Button>
          ) : null}
          onChange={updateFeatured}
          onPublicVisibleChange={(visible) => updateFeatured({ ...featured, publicVisible: visible })}
        />
      )
    }
    if (item.type === 'achievements') {
      return (
        <ProfileAchievementsSection
          achievements={achievements}
          orgslug={orgslug}
          profileUsername={profileUsername}
          grid={grid}
          editMode={effectiveEditMode}
          canEdit={canManageProfile}
          publicVisible={isPublicMode ? achievements.publicVisible : true}
          orgConfig={orgConfig}
          orgId={orgId}
          collections={collections}
          profile={profile}
          onChange={(nextAchievements) => updateDraftProfile((current) => ({
            ...current,
            achievements: nextAchievements,
          }))}
          onPublicVisibleChange={(visible) => updateDraftProfile((current) => ({
            ...current,
            achievements: { ...achievements, publicVisible: visible },
          }))}
        />
      )
    }
    if (item.type === 'values' || item.type === 'strengths') {
      const selected = item.type === 'values'
        ? contentProfile.values || []
        : contentProfile.strengths || []
      if (!canManageProfile && selected.length === 0) return null
      return (
        <ProfileTopFiveWidget
          kind={item.type}
          selected={selected}
          grid={grid}
          canEdit={canManageProfile}
          onConfirm={(values) => updateProfileTopFive(item.type as ProfileTopFiveKind, values)}
        />
      )
    }
    if (item.type === 'coreCourse') {
      return null
    }
    if (item.type === 'coreQuiz') {
      return null
    }
    if (item.type === 'instagramPreview' || item.type === 'youtubePreview') {
      const type = item.type === 'instagramPreview' ? 'instagram' : 'youtube'
      const social = (contentProfile.header?.socials || []).find((candidate) => candidate.type === type)
      if (!canManageProfile && !social?.url) return null
      return (
        <SocialPreviewWidget
          type={type}
          social={social}
          grid={grid}
          canEdit={canManageProfile}
          onChange={(url) => updateSocial(type, url)}
          onBlur={() => void persistProfile()}
        />
      )
    }
    const section = contentProfile.sections?.find((candidate) => candidate.id === item.id)
    return section ? (
      <CustomProfileSectionView
        section={section}
        grid={grid}
        canEdit={canManageProfile}
        onChange={(patch) => updateCustomSection(item.id, patch)}
        onBlur={saveCustomSections}
        uploadingMedia={uploading === `media:${item.id}`}
        onUploadMedia={(file) => uploadProfileMedia(item.id, file)}
      />
    ) : <EmptyWidgetPreview type={item.type} />
  }

  return (
    <main className="min-h-screen">
      <div
        ref={profileContentRef}
        className="mx-auto w-full px-0 pt-0 pb-6 sm:px-6 sm:py-6 lg:px-8"
      >
        {isPublicMode && isSelf ? (
          <div className="mx-4 mt-4 flex flex-col gap-3 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 sm:mx-0 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-medium text-gray-700">
              You are viewing your public profile.
            </p>
            <Button asChild variant="surface" size="sm">
              <Link href={getUriWithOrg(orgslug, routePaths.org.portfolio())}>View full profile</Link>
            </Button>
          </div>
        ) : null}
        <ProfileHeaderModal
          open={headerModalOpen}
          onOpenChange={setHeaderModalOpen}
          user={user}
          draft={draft}
          avatarUrl={avatarUrl || getUriWithOrg(orgslug, '/empty_avatar.png')}
          socials={socials}
          missingSocialTypes={missingSocialTypes}
          canManageProfile={canManageProfile}
          isSaving={isSaving}
          uploadingAvatar={uploading === 'avatar'}
          onAvatarChange={handleAvatarChange}
          onDraftChange={(patch) => setDraft((current) => ({ ...current, ...patch }))}
          onAddSocial={addSocial}
          onUpdateSocial={updateSocial}
          onRemoveSocial={removeSocial}
          onSave={handleSave}
        />
        <div className="px-4 sm:px-0">
          <ContentPageHeader
            orgslug={orgslug}
            tabs={[
              { href: routePaths.org.portfolio(), label: 'Portfolio', active: activeTab === 'overview' },
              { href: routePaths.org.portfolioTimeline(), label: 'Timeline', active: activeTab === 'timeline' },
              { href: routePaths.org.portfolioResume(), label: 'Resume' },
            ]}
            noHorizontalBleed
            noBottomMargin
          />
        </div>
        {activeTab === 'overview' ? (
          <div className="grid gap-8 px-4 pb-12 pt-6 sm:px-0">
            <div className="min-w-0">
              <SimpleProfileHeader
                orgslug={orgslug}
                user={user}
                draft={draft}
                avatarUrl={avatarUrl || getUriWithOrg(orgslug, '/empty_avatar.png')}
                socials={socials}
                canManageProfile={canManageProfile}
                isSaving={isSaving}
                canSeedDevProfile={canSeedDevProfile}
                onOpen={() => setHeaderModalOpen(true)}
                onCopyProfileLink={copyProfileLink}
                onSeedDevProfile={seedDevProfile}
              />
              <div ref={profileGridRef} className="min-w-0 pb-4">
              {profileGridWidth > 0 ? (
                <GridLayout
                  key={`profile-grid-${profileGridCols}-${gridDropResetKey}`}
                  width={profileGridWidth}
                  layout={gridLayout}
                  autoSize
                  gridConfig={{
                    cols: profileGridCols,
                    rowHeight: profileGridRowHeight,
                    margin: PROFILE_GRID_MARGIN,
                    containerPadding: [0, 0],
                  }}
                  dragConfig={{
                    enabled: canManageProfile,
                    bounded: true,
                    cancel: 'input, textarea, button, a, select, label, [contenteditable="true"], [data-profile-grid-control="true"]',
                    threshold: 6,
                  }}
                  resizeConfig={{ enabled: false }}
                  dropConfig={{
                    enabled: canManageProfile && Boolean(trayDraftItem),
                    defaultItem: getProfileGridDropSize(profileGridCols),
                  }}
                  droppingItem={trayDraftItem ? {
                    i: trayDraftItem.id,
                    x: 0,
                    y: 0,
                    ...getProfileGridDropSize(profileGridCols),
                  } : undefined}
                  onDropDragOver={() => (trayDraftItem ? getProfileGridDropSize(profileGridCols) : false)}
                  onDrop={(nextLayout, droppedGridItem) => {
                    if (canManageProfile) finishTrayGridDrop(nextLayout, droppedGridItem)
                  }}
                  onLayoutChange={(nextLayout) => {
                    if (canManageProfile) updateProfileGridDraft(nextLayout)
                  }}
                  onDragStop={(nextLayout) => {
                    if (canManageProfile) persistProfileGridLayout(nextLayout)
                  }}
                  className="profile-grid-layout"
                >
                {renderableLayout.map((item) => {
                  const rendered = renderProfileLayoutSection(item)
                  if (!rendered) return null
                  const grid = getProfileGridForItem(item, 0, profileGridCols, profileGridKey)
                  return (
                    <div key={item.id} className="group/portfolio-grid-item h-full w-full min-w-0 overflow-visible">
                      <div className={`relative h-full w-full min-w-0 rounded-xl transition-shadow ${canManageProfile ? 'cursor-grab ring-1 ring-transparent hover:ring-gray-300 active:cursor-grabbing' : ''}`}>
                        <div className="h-full w-full min-w-0 overflow-visible rounded-3xl">
                          <div className="h-full w-full min-w-0 overflow-visible">
                            {rendered}
                          </div>
                        </div>
                        {canManageProfile ? (
                          <>
                            <button
                              type="button"
                              data-profile-grid-control="true"
                              onClick={() => removeProfileLayoutItem(item)}
                              className="absolute -right-3 -top-3 z-20 flex h-8 w-8 items-center justify-center rounded-full bg-white text-gray-500 opacity-0 shadow-sm ring-1 ring-gray-200 transition-all hover:text-red-500 group-hover/portfolio-grid-item:opacity-100"
                              aria-label="Delete section"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              data-profile-grid-control="true"
                              onPointerDown={(event) => startProfileGridResize(item.id, 'left', event)}
                              className="absolute -left-3 top-1/2 z-20 flex h-12 w-6 -translate-y-1/2 cursor-ew-resize items-center justify-center rounded-full bg-white text-gray-400 opacity-0 shadow-sm ring-1 ring-gray-200 transition-all hover:text-gray-900 group-hover/portfolio-grid-item:opacity-100"
                              aria-label={`Resize section width from left, current width ${grid.w} columns`}
                              title="Drag to resize width"
                            >
                              <span className="h-6 w-1 rounded-full bg-current" />
                            </button>
                            <button
                              type="button"
                              data-profile-grid-control="true"
                              onPointerDown={(event) => startProfileGridResize(item.id, 'right', event)}
                              className="absolute -right-3 top-1/2 z-20 flex h-12 w-6 -translate-y-1/2 cursor-ew-resize items-center justify-center rounded-full bg-white text-gray-400 opacity-0 shadow-sm ring-1 ring-gray-200 transition-all hover:text-gray-900 group-hover/portfolio-grid-item:opacity-100"
                              aria-label={`Resize section width from right, current width ${grid.w} columns`}
                              title="Drag to resize width"
                            >
                              <span className="h-6 w-1 rounded-full bg-current" />
                            </button>
                            {item.type !== 'achievements' ? (
                              <>
                                <button
                                  type="button"
                                  data-profile-grid-control="true"
                                  onPointerDown={(event) => startProfileGridResize(item.id, 'top', event)}
                                  className="absolute -top-3 left-1/2 z-20 flex h-6 w-12 -translate-x-1/2 cursor-ns-resize items-center justify-center rounded-full bg-white text-gray-400 opacity-0 shadow-sm ring-1 ring-gray-200 transition-all hover:text-gray-900 group-hover/portfolio-grid-item:opacity-100"
                                  aria-label={`Resize section height from top, current height ${grid.h} rows`}
                                  title="Drag to resize height"
                                >
                                  <span className="h-1 w-6 rounded-full bg-current" />
                                </button>
                                <button
                                  type="button"
                                  data-profile-grid-control="true"
                                  onPointerDown={(event) => startProfileGridResize(item.id, 'bottom', event)}
                                  className="absolute -bottom-3 left-1/2 z-20 flex h-6 w-12 -translate-x-1/2 cursor-ns-resize items-center justify-center rounded-full bg-white text-gray-400 opacity-0 shadow-sm ring-1 ring-gray-200 transition-all hover:text-gray-900 group-hover/portfolio-grid-item:opacity-100"
                                  aria-label={`Resize section height from bottom, current height ${grid.h} rows`}
                                  title="Drag to resize height"
                                >
                                  <span className="h-1 w-6 rounded-full bg-current" />
                                </button>
                              </>
                            ) : null}
                          </>
                        ) : null}
                      </div>
                    </div>
                  )
                })}
                </GridLayout>
              ) : null}
              </div>
            </div>
          </div>
        ) : null}
        {activeTab === 'timeline' ? (
          <ProfileTimeline
            initialUser={{ ...user, profile }}
            orgslug={orgslug}
            profileUsername={profileUsername}
            editMode={effectiveEditMode}
            embedded
            canEdit={effectiveEditMode}
            enabled={timelineEnabled}
            publicVisible={isPublicMode ? timelinePublicVisible : true}
            onEnabledChange={(value) => updateDraftProfile((current) => ({ ...current, timelineEnabled: value }))}
            onPublicVisibleChange={updateTimelinePublicVisible}
            onUserChange={(updatedUser) => {
              setUser(updatedUser)
              updateDraftProfile(normalizeProfile(updatedUser.profile))
            }}
          />
        ) : null}
      </div>
      {showPortfolioChecklist ? (
        <LayoutRightSidebarPortal>
          <div className="lg:sticky lg:top-6 lg:mt-20 lg:self-start">
            <PortfolioTodoPanel
              profile={contentProfile}
              user={{ ...user, bio: draft.bio, avatar_image: user.avatar_image }}
              orgslug={orgslug}
              trail={trail}
            />
          </div>
        </LayoutRightSidebarPortal>
      ) : null}
      {canManageProfile && activeTab === 'overview' ? (
        <ProfileAddTray
          open={addTrayOpen}
          anchorRef={profileContentRef}
          usedUniqueTypes={usedUniqueTypes}
          usedCoreQuizQuestionKeys={usedCoreQuizQuestionKeys}
          coreCourses={coreCourses}
          dragging={trayDropMode}
          onToggle={() => setAddTrayOpen((current) => !current)}
          onClose={() => setAddTrayOpen(false)}
          onAdd={addProfileSection}
          onDragStart={startTrayDrag}
          onDragging={() => {
            if (trayDraftItemRef.current) setTrayDropMode(true)
          }}
          onDragEnd={cancelTrayDrag}
          onCancelDrop={() => {
            cancelTrayDrag()
            setAddTrayOpen(false)
          }}
        />
      ) : null}
    </main>
  )
}

export function OwnerProfilePageClient(props: OwnerProfilePageClientProps) {
  return <ProfilePageClient {...props} mode="owner" />
}

export function PublicProfilePageClient(props: PublicProfilePageClientProps) {
  return <ProfilePageClient {...props} mode="public" />
}

export default OwnerProfilePageClient
