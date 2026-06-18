'use client'

import React, { useEffect, useId, useMemo, useRef, useState } from 'react'
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
  Image as ImageIcon,
  Instagram,
  Italic,
  Link2,
  Linkedin,
  List,
  ListOrdered,
  Loader2,
  Lock,
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
} from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import GridLayout, { type Layout as ReactGridLayoutItems, verticalCompactor } from 'react-grid-layout'
import { toast } from 'react-hot-toast'
import { Button } from '@components/ui/button'
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
  getPortfolioAuthorName,
  normalizeFeatured,
  type FeaturedSection,
} from '@components/Objects/Portfolio/ProfilePortfolio'
import ProfileTimeline, { normalizeTimeline, type TimelineEntry } from '@components/Objects/Portfolio/ProfileTimeline'
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

type ProfileWidgetType = 'timeline' | 'portfolio' | 'achievements' | 'coreCourse' | 'coreQuiz' | 'instagramPreview' | 'youtubePreview' | 'title' | 'text' | 'link' | 'media'

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

const UNIQUE_PROFILE_WIDGETS: ProfileWidgetType[] = ['timeline', 'portfolio', 'achievements', 'instagramPreview', 'youtubePreview']
const DISABLED_PROFILE_WIDGETS = new Set<ProfileWidgetType>(['coreCourse', 'coreQuiz'])
const DEFAULT_PROFILE_LAYOUT: ProfileLayoutItem[] = [
  { id: 'timeline', type: 'timeline' },
  { id: 'portfolio', type: 'portfolio' },
  { id: 'achievements', type: 'achievements' },
]
const PROFILE_GRID_DESKTOP_COLS = 3
const PROFILE_GRID_MOBILE_COLS = 2
const PROFILE_GRID_MOBILE_MAX_WIDTH = 720
const PROFILE_GRID_MARGIN: readonly [number, number] = [16, 16]
const PROFILE_GRID_DESKTOP_ROW_HEIGHT = 131
const PROFILE_GRID_MOBILE_ROW_HEIGHT = 131
const PROFILE_GRID_DROP_SIZE: Pick<ProfileGridPosition, 'w' | 'h'> = { w: 1, h: 1 }

const PROFILE_WIDGET_CONFIG: Record<ProfileWidgetType, {
  label: string
  icon: React.ComponentType<{ className?: string }>
  unique: boolean
}> = {
  timeline: { label: 'Timeline', icon: ChevronRight, unique: true },
  portfolio: { label: 'Portfolio', icon: FileText, unique: true },
  achievements: { label: 'Badges', icon: Award, unique: true },
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
  cols = PROFILE_GRID_DESKTOP_COLS
): ProfileGridPosition {
  const defaults = getProfileGridDefaultSize(type)
  const w = Math.min(cols, Math.max(1, Number(grid?.w || defaults.w)))
  const h = Math.min(3, Math.max(1, Number(grid?.h || defaults.h)))
  const x = Math.min(cols - w, Math.max(0, Number.isFinite(grid?.x) ? Number(grid?.x) : 0))
  const y = Math.max(0, Number.isFinite(grid?.y) ? Number(grid?.y) : index * defaults.h)
  return { x, y, w, h }
}

function getProfileGridKey(cols: number): ProfileGridKey {
  return cols <= PROFILE_GRID_MOBILE_COLS ? 'mobileGrid' : 'grid'
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
  cols = PROFILE_GRID_DESKTOP_COLS,
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
  cols = PROFILE_GRID_DESKTOP_COLS,
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

function compactProfileGridLayout(layout: ReactGridLayoutItems, cols = PROFILE_GRID_DESKTOP_COLS): ReactGridLayoutItems {
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
        mobileGrid: item?.mobileGrid ? clampProfileGridPosition(item.mobileGrid, type, items.length, PROFILE_GRID_MOBILE_COLS) : undefined,
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
        mobileGrid: item?.mobileGrid ? clampProfileGridPosition(item.mobileGrid, type, items.length, PROFILE_GRID_MOBILE_COLS) : undefined,
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
        mobileGrid: item?.mobileGrid ? clampProfileGridPosition(item.mobileGrid, type, items.length, PROFILE_GRID_MOBILE_COLS) : undefined,
      })
      return items
    }
    items.push({
      id: item?.id || createProfileLayoutItem(type).id,
      type,
      grid,
      mobileGrid: item?.mobileGrid ? clampProfileGridPosition(item.mobileGrid, type, items.length, PROFILE_GRID_MOBILE_COLS) : undefined,
    })
    return items
  }, [])
  return normalized.map((item, index) => ({
    ...item,
    grid: clampProfileGridPosition(item.grid, item.type, index),
    mobileGrid: item.mobileGrid ? clampProfileGridPosition(item.mobileGrid, item.type, index, PROFILE_GRID_MOBILE_COLS) : undefined,
  }))
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
  if (!profile) return { header: { socials: [] }, featured: normalizeFeatured(null), achievements: normalizeAchievements(null), timelineEnabled: false, timeline: [], layout: DEFAULT_PROFILE_LAYOUT, sections: [] }
  if (typeof profile === 'string') {
    try {
      return normalizeProfile(JSON.parse(profile))
    } catch {
      return { header: { socials: [] }, featured: normalizeFeatured(null), achievements: normalizeAchievements(null), timelineEnabled: false, timeline: [], layout: DEFAULT_PROFILE_LAYOUT, sections: [] }
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
      className={`block w-full overflow-visible whitespace-nowrap border-0 bg-transparent p-0 ${alignClass} font-black leading-[0.82] text-gray-950 outline-none transition-colors placeholder:text-gray-300 focus:text-emerald-700 disabled:cursor-wait disabled:opacity-70 ${className}`}
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

function getTimelineEntryDetail(entry: TimelineEntry) {
  if (entry.category === 'work') return entry.employer
  if (entry.category === 'education') return entry.institution
  return ''
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

  if (isCompact) {
    return (
      <section className="flex h-full min-w-0 min-h-0 items-center justify-between gap-4 rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold text-gray-950">Timeline</h2>
          <p className="mt-1 truncate text-sm font-medium text-gray-500">
            {recentEntries.length} recent {recentEntries.length === 1 ? 'entry' : 'entries'}
          </p>
        </div>
        <Link
          href={href}
          className="inline-flex h-9 shrink-0 items-center rounded-full bg-gray-950 px-3 text-sm font-semibold text-white hover:bg-gray-800"
        >
          Open
        </Link>
      </section>
    )
  }

  return (
    <section className="flex h-full min-w-0 min-h-0 flex-col rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className={`${isNarrow ? 'text-xl' : 'text-2xl'} min-w-0 truncate font-semibold text-gray-950`}>Timeline</h2>
        <Link
          href={href}
          className="flex items-center gap-1.5 text-sm font-semibold text-gray-600 transition-colors hover:text-gray-950"
        >
          <span>See whole timeline</span>
          <ChevronRight className="h-4 w-4" />
        </Link>
      </div>
      {recentEntries.length > 0 ? (
        <div className={`${isNarrow ? 'grid grid-cols-1 gap-3 overflow-y-auto pr-1' : 'flex gap-4 overflow-x-auto pb-1'} min-h-0 flex-1`}>
          {recentEntries.map((entry) => {
            const detail = getTimelineEntryDetail(entry)
            return (
              <article key={entry.id} className={`${isNarrow ? 'min-h-32' : 'w-56 min-w-56'} rounded-lg border border-gray-200 bg-white p-4 shadow-sm`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold capitalize text-gray-600">
                    {entry.category}
                  </span>
                  {entry.isOngoing ? (
                    <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                      Current
                    </span>
                  ) : null}
                </div>
                <p className="mt-4 line-clamp-2 text-base font-semibold leading-6 text-gray-950">{entry.title}</p>
                <p className="mt-2 text-sm text-gray-500">{formatProfileTimelineRange(entry)}</p>
                {detail ? <p className="mt-2 truncate text-sm font-medium text-gray-700">{detail}</p> : null}
                {entry.description && !isNarrow ? (
                  <p className="mt-3 line-clamp-2 text-sm leading-6 text-gray-600">{entry.description}</p>
                ) : null}
              </article>
            )
          })}
        </div>
      ) : (
        <div className="rounded-lg border-2 border-dotted border-emerald-400 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-4 rounded-lg bg-emerald-50/50 p-5">
            <div>
              <p className="text-sm font-semibold text-emerald-950">Add timeline events</p>
              <p className="mt-1 text-sm leading-6 text-emerald-800">
                Capture work, education, and life moments to show them here.
              </p>
            </div>
            <Link
              href={href}
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white shadow-sm transition-colors hover:bg-emerald-600"
              aria-label="Add timeline events"
            >
              <ChevronRight className="h-6 w-6" />
            </Link>
          </div>
        </div>
      )}
    </section>
  )
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
    <section className="flex h-full min-w-0 min-h-0 flex-col rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
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
                className="min-w-0 flex-1 border-0 bg-transparent p-0 font-medium text-gray-700 outline-none placeholder:text-gray-300 focus:text-emerald-700"
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
                className="inline-flex h-9 items-center rounded-full bg-gray-950 px-3 text-sm font-semibold text-white hover:bg-gray-800"
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
      <section className="flex h-full min-w-0 items-center justify-between gap-4 rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold text-gray-950">{pageLabel}</h3>
        </div>
        <Link
          href={quizHref}
          className="inline-flex h-9 shrink-0 items-center rounded-full bg-gray-950 px-3 text-sm font-semibold text-white hover:bg-gray-800"
        >
          Open
        </Link>
      </section>
    )
  }

  return (
    <section className="flex h-full min-w-0 min-h-0 flex-col overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
      <div className={`${isNarrow ? 'p-2' : 'p-2.5'} border-b border-gray-100`}>
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <h3 className={`${isNarrow ? 'text-base' : 'text-lg'} truncate font-bold text-gray-950`}>{pageLabel}</h3>
              </div>
              <Link
                href={quizHref}
                className="inline-flex w-fit shrink-0 items-center gap-2 rounded-full bg-gray-950 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800"
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
              className="mt-4 inline-flex items-center gap-2 rounded-full bg-gray-950 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800"
            >
              Get started
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        )}
      </div>
    </section>
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
    <section className="group/portfolio-media relative h-full min-h-0 overflow-hidden rounded-xl bg-white">
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
      <section className="flex h-full items-center rounded-xl bg-white px-4 py-3">
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
    )
  }
  if (section.type === 'text') {
    return (
      <section className="flex h-full min-h-0 flex-col rounded-xl bg-white p-4">
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
    )
  }
  if (section.type === 'link') {
    const href = normalizeSocialInput('website', section.url || '')
    return (
      <section className="flex h-full items-center rounded-xl bg-white">
        <div className="flex h-full w-full items-center justify-between gap-4 rounded-lg border border-gray-200 bg-white p-5 text-gray-950 shadow-sm">
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
    { title: 'Features', types: ['portfolio', 'timeline', 'achievements'] },
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
          className="pointer-events-auto absolute bottom-0 right-0 z-10 flex h-14 w-14 items-center justify-center rounded-full bg-gray-950 text-white shadow-xl transition-colors hover:bg-black"
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
          className="pointer-events-auto absolute bottom-0 right-0 flex h-14 w-14 items-center justify-center rounded-full bg-gray-950 text-white shadow-xl transition-colors hover:bg-black"
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
}: ProfilePageClientProps) {
  const router = useRouter()
  const session = useLHSession() as any
  const accessToken = session?.data?.tokens?.access_token
  const bioTextareaRef = useRef<HTMLTextAreaElement | null>(null)
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
  const [bioExpanded, setBioExpanded] = useState(false)
  const [socialsExpanded, setSocialsExpanded] = useState(false)
  const [addTrayOpen, setAddTrayOpen] = useState(false)
  const [trayDraftItem, setTrayDraftItem] = useState<ProfileLayoutItem | null>(null)
  const [trayDropMode, setTrayDropMode] = useState(false)
  const [gridDropResetKey, setGridDropResetKey] = useState(0)
  const [profileGridWidth, setProfileGridWidth] = useState(0)
  const activeTab = initialTab

  const isOwnerMode = mode === 'owner'
  const isPublicMode = mode === 'public'
  const canManageProfile = isOwnerMode
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
  const profileGridCols = profileGridWidth > 0 && profileGridWidth <= PROFILE_GRID_MOBILE_MAX_WIDTH
    ? PROFILE_GRID_MOBILE_COLS
    : PROFILE_GRID_DESKTOP_COLS
  const profileGridKey = getProfileGridKey(profileGridCols)
  const gridLayout = useMemo(
    () => profileLayoutToGridLayout(layout, canManageProfile, profileGridCols, profileGridKey),
    [layout, canManageProfile, profileGridCols, profileGridKey]
  )
  const profileGridRowHeight = useMemo(() => {
    return profileGridCols <= PROFILE_GRID_MOBILE_COLS
      ? PROFILE_GRID_MOBILE_ROW_HEIGHT
      : PROFILE_GRID_DESKTOP_ROW_HEIGHT
  }, [profileGridCols])
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
  const resumeHref = getUriWithOrg(orgslug, routePaths.org.portfolioResume())
  const timelineHref = getUriWithOrg(
    orgslug,
    isPublicMode
      ? routePaths.org.userTimeline(profileUsername || user.username)
      : routePaths.org.portfolioTimeline()
  )

  const missingSocialTypes = useMemo(
    () => (Object.keys(SOCIAL_CONFIG) as SocialType[]).filter(
      (type) => !socials.some((social) => social.type === type)
    ),
    [socials]
  )

  useEffect(() => {
    if (!socialsExpanded) return
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.closest('[data-profile-socials="true"]')) return
      setSocialsExpanded(false)
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [socialsExpanded])

  useEffect(() => {
    const textarea = bioTextareaRef.current
    if (!textarea || !canManageProfile) return
    textarea.style.height = 'auto'
    textarea.style.height = `${textarea.scrollHeight}px`
  }, [draft.bio, canManageProfile])

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
    const nextProfile = {
      ...draft.profile,
      header: {
        ...(draft.profile.header || {}),
        socials: (draft.profile.header?.socials || []).filter((social) => social.type !== type),
      },
    }
    updateDraftProfile(nextProfile)
    void persistProfile({ profileOverride: nextProfile })
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

  const saveNameField = async (field: 'first_name' | 'last_name') => {
    const nextFirstName = field === 'first_name' ? draft.first_name.trim() : draft.first_name
    const nextLastName = field === 'last_name' ? draft.last_name.trim() : draft.last_name
    const currentFirstName = user.first_name || ''
    const currentLastName = user.last_name || ''

    if (nextFirstName === currentFirstName && nextLastName === currentLastName) return

    setDraft((current) => ({
      ...current,
      first_name: nextFirstName,
      last_name: nextLastName,
    }))
    await persistProfile({
      firstNameOverride: nextFirstName,
      lastNameOverride: nextLastName,
    })
  }

  const saveBioField = async () => {
    if ((draft.bio || '') === (user.bio || '')) return
    await persistProfile({ bioOverride: draft.bio })
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
    item.grid = clampProfileGridPosition(PROFILE_GRID_DROP_SIZE, type, layout.length, PROFILE_GRID_DESKTOP_COLS)
    item.mobileGrid = clampProfileGridPosition(PROFILE_GRID_DROP_SIZE, type, layout.length, PROFILE_GRID_MOBILE_COLS)
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
    item.grid = clampProfileGridPosition(PROFILE_GRID_DROP_SIZE, type, itemIndex, PROFILE_GRID_DESKTOP_COLS)
    item.mobileGrid = clampProfileGridPosition(PROFILE_GRID_DROP_SIZE, type, itemIndex, PROFILE_GRID_MOBILE_COLS)

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
    const desktopGrid = profileGridKey === 'grid'
      ? clampProfileGridPosition(droppedGrid, item.type, 0, PROFILE_GRID_DESKTOP_COLS)
      : clampProfileGridPosition(item.grid, item.type, 0, PROFILE_GRID_DESKTOP_COLS)
    const mobileGrid = profileGridKey === 'mobileGrid'
      ? clampProfileGridPosition(droppedGrid, item.type, 0, PROFILE_GRID_MOBILE_COLS)
      : clampProfileGridPosition(item.mobileGrid || item.grid, item.type, 0, PROFILE_GRID_MOBILE_COLS)
    const nextItem = {
      ...item,
      grid: desktopGrid,
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
          authorName={getPortfolioAuthorName(user)}
          updatedAtFallback={user.update_date}
          profileUsername={profileUsername || user.username}
          ownerView={canManageProfile}
          publicVisible={isPublicMode ? featured.publicVisible : true}
          actions={canManageProfile ? (
            <Button type="button" variant="outline" size="icon" onClick={createPortfolioPost} disabled={isSaving} aria-label="Add portfolio post">
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
      <div ref={profileContentRef} className="mx-auto w-full max-w-5xl px-0 pt-0 pb-6 sm:px-6 sm:py-6 lg:px-8">
        {isPublicMode && isSelf ? (
          <div className="mx-4 mt-4 flex flex-col gap-3 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 sm:mx-0 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-medium text-gray-700">
              You are viewing your public profile.
            </p>
            <Button asChild variant="outline" size="sm">
              <Link href={getUriWithOrg(orgslug, routePaths.org.portfolio())}>View full profile</Link>
            </Button>
          </div>
        ) : null}
        <section className="relative px-4 py-6 sm:px-0">
          <div className="flex flex-col gap-5 sm:grid sm:grid-cols-2 sm:items-start sm:gap-8">
            <div className="w-full shrink-0 sm:order-2">
              <div className="relative w-full sm:hidden">
                <ProfileHeaderAvatar
                  size={198}
                  avatarUrl={avatarUrl || getUriWithOrg(orgslug, '/empty_avatar.png')}
                  socials={socials}
                  userId={user.id}
                  lastName={canManageProfile ? draft.last_name : user.last_name}
                  showNameCutout={!canManageProfile}
                  fullWidth
                  canEditSocials={canManageProfile}
                  socialsExpanded={socialsExpanded}
                  uploading={uploading === 'avatar'}
                  missingSocialTypes={missingSocialTypes}
                  onAvatarChange={handleAvatarChange}
                  onAddSocial={addSocial}
                  onUpdateSocial={updateSocial}
                  onRemoveSocial={removeSocial}
                  onSocialsFocus={() => setSocialsExpanded(true)}
                  onSocialsBlur={() => undefined}
                  onSaveSocials={() => void persistProfile()}
                />
              </div>
              <div className="hidden w-full sm:block">
                <ProfileHeaderAvatar
                  size={270}
                  avatarUrl={avatarUrl || getUriWithOrg(orgslug, '/empty_avatar.png')}
                  socials={socials}
                  userId={user.id}
                  firstName={canManageProfile ? draft.first_name : user.first_name}
                  lastName={canManageProfile ? draft.last_name : user.last_name}
                  fullWidth
                  socialScale={AVATAR_SOCIAL_SCALE * 1.5}
                  canEditSocials={canManageProfile}
                  socialsExpanded={socialsExpanded}
                  uploading={uploading === 'avatar'}
                  missingSocialTypes={missingSocialTypes}
                  onAvatarChange={handleAvatarChange}
                  onAddSocial={addSocial}
                  onUpdateSocial={updateSocial}
                  onRemoveSocial={removeSocial}
                  onSocialsFocus={() => setSocialsExpanded(true)}
                  onSocialsBlur={() => undefined}
                  onSaveSocials={() => void persistProfile()}
                />
              </div>
            </div>

            <div className="min-w-0 flex-1 space-y-4 sm:order-1 sm:text-right">
              <div className="min-w-0">
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    {canManageProfile ? (
                      <>
                        <EditableProfileNameStack
                          firstName={draft.first_name}
                          lastName={draft.last_name}
                          maxRem={4.25}
                          minRem={2.25}
                          className="sm:hidden"
                          onFirstNameChange={(value) => setDraft((current) => ({ ...current, first_name: value }))}
                          onLastNameChange={(value) => setDraft((current) => ({ ...current, last_name: value }))}
                          onFirstNameBlur={() => void saveNameField('first_name')}
                          onLastNameBlur={() => void saveNameField('last_name')}
                        />
                        <EditableProfileNameStack
                          firstName={draft.first_name}
                          lastName={draft.last_name}
                          maxRem={8.5}
                          minRem={3.5}
                          align="right"
                          className="hidden sm:block"
                          onFirstNameChange={(value) => setDraft((current) => ({ ...current, first_name: value }))}
                          onLastNameChange={(value) => setDraft((current) => ({ ...current, last_name: value }))}
                          onFirstNameBlur={() => void saveNameField('first_name')}
                          onLastNameBlur={() => void saveNameField('last_name')}
                        />
                      </>
                    ) : (
                      <>
                        <ProfileNameStack
                          firstName={user.first_name}
                          lastName={user.last_name}
                          maxRem={4.25}
                          minRem={2.25}
                          className="sm:hidden"
                        />
                        <ProfileNameStack
                          firstName={user.first_name}
                          lastName={user.last_name}
                          maxRem={8.5}
                          minRem={3.5}
                          align="right"
                          className="hidden sm:block"
                        />
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="group relative max-w-2xl sm:ml-auto sm:w-3/4 sm:max-w-none">
                {canManageProfile ? (
                  <Textarea
                    ref={bioTextareaRef}
                    value={draft.bio}
                    onChange={(event) => setDraft((current) => ({ ...current, bio: event.target.value }))}
                    onFocus={() => setSocialsExpanded(false)}
                    onBlur={() => void saveBioField()}
                    placeholder="Write a short profile"
                    rows={1}
                    className="min-h-[1.75rem] resize-none overflow-hidden border-0 bg-transparent px-0 py-0 text-base leading-7 text-gray-700 shadow-none outline-none ring-0 transition-colors placeholder:text-gray-400 focus-visible:ring-0 focus-visible:ring-offset-0 sm:text-right"
                    maxLength={400}
                  />
                ) : user.bio ? (
                  <>
                    <p className={`overflow-hidden pr-12 text-base leading-7 text-gray-700 transition-[max-height] duration-300 ${
                      bioExpanded ? 'max-h-[640px]' : 'max-h-24'
                    }`}>
                      {user.bio}
                    </p>
                    {user.bio.length > 180 ? (
                      <button
                        type="button"
                        onClick={() => setBioExpanded((current) => !current)}
                        className="mt-1 text-sm font-medium text-gray-950 hover:underline"
                      >
                        {bioExpanded ? 'Show less' : 'Show more'}
                      </button>
                    ) : null}
                  </>
                ) : (
                  <p className="pr-12 text-base leading-7 text-gray-400">Add a short profile bio.</p>
                )}
              </div>
              {(canManageProfile || isPublicMode) ? (
                <div className="border-t border-gray-200 pt-3 sm:ml-auto sm:w-3/4">
                  <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                    {canSeedDevProfile ? (
                      <Button type="button" variant="outline" onClick={seedDevProfile} disabled={isSaving}>
                        {isSaving ? <Loader2 size={16} className="mr-2 animate-spin" /> : <Sparkles size={16} className="mr-2" />}
                        Cheat Portfolio
                      </Button>
                    ) : null}
                    {canManageProfile ? (
                      <Button asChild variant="outline">
                        <Link href={resumeHref}>
                          <FileText size={16} className="mr-2" />
                          Resume
                        </Link>
                      </Button>
                    ) : null}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button type="button" variant="outline">
                          <Share2 size={16} className="mr-2" />
                          Share
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuItem onClick={copyProfileLink}>
                          <Copy className="h-4 w-4" />
                          <span>Copy link</span>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </section>
        {activeTab === 'overview' ? (
          <div ref={profileGridRef} className="px-4 pb-10 sm:px-0">
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
                {layout.map((item) => {
                  const rendered = renderProfileLayoutSection(item)
                  if (!rendered) return null
                  const grid = getProfileGridForItem(item, 0, profileGridCols, profileGridKey)
                  return (
                    <div key={item.id} className="group/portfolio-grid-item h-full w-full min-w-0">
                      <div className={`relative h-full w-full min-w-0 rounded-xl transition-shadow ${canManageProfile ? 'cursor-grab ring-1 ring-transparent hover:ring-gray-300 active:cursor-grabbing' : ''}`}>
                        <div className="h-full w-full min-w-0 overflow-hidden rounded-xl">
                          <div className="h-full w-full min-w-0 overflow-y-auto">
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
                      </div>
                    </div>
                  )
                })}
              </GridLayout>
            ) : null}
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
