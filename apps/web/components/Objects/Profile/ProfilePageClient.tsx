'use client'

import React, { useEffect, useId, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import {
  Camera,
  Check,
  ChevronRight,
  Compass,
  Copy,
  Edit3,
  Eye,
  FileText,
  Globe,
  HeartPulse,
  HelpCircle,
  Instagram,
  Linkedin,
  Loader2,
  Plus,
  Share2,
  Star,
  UserRound,
  X,
} from 'lucide-react'
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
import {
  JOURNAL_CANVASES,
  type JournalCanvasConfig,
  type JournalCanvasId,
  type JournalCardConfig,
  type JournalCardEntry,
  type JournalShape,
} from '@components/Objects/Profile/ProfileJournalContent'
import { normalizeAchievements, ProfileAchievementsSection } from '@components/Objects/Profile/ProfileAchievements'
import {
  FeaturedCarousel,
  getPortfolioAuthorName,
  normalizeFeatured,
  type FeaturedSection,
} from '@components/Objects/Profile/ProfilePortfolio'
import ProfileTimeline, { normalizeTimeline } from '@components/Objects/Profile/ProfileTimeline'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { getUserAvatarMediaDirectory } from '@services/media/media'
import { updateProfile } from '@services/settings/profile'
import { updateUserAvatar } from '@services/users/users'

type SocialType = 'website' | 'linkedin' | 'instagram' | 'x'

type SocialLink = {
  type: SocialType
  url: string
}

type ProfileHeader = {
  coverImage?: string
  socials?: SocialLink[]
}

type ProfileShape = {
  header?: ProfileHeader
  featured?: FeaturedSection
  achievements?: any
  journal?: JournalShape
  timelineEnabled?: boolean
  timelinePublicVisible?: boolean
  timeline?: any[]
  sections?: any[]
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
type ProfileTab = 'overview' | 'timeline' | JournalCanvasId
type OwnerJournalPageClientProps = {
  initialUser: any
  orgslug: string
}

const JOURNAL_TABS: Array<{
  id: JournalCanvasId
  label: string
  icon: React.ComponentType<{ className?: string }>
}> = [
  { id: 'identity', label: 'Identity', icon: UserRound },
  { id: 'lifestyle', label: 'Lifestyle', icon: HeartPulse },
  { id: 'navigation', label: 'Navigation', icon: Compass },
]

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
  x: {
    label: 'X',
    placeholder: 'https://x.com/username',
    icon: X,
    hostPattern: /(^|\.)x\.com$|(^|\.)twitter\.com$/i,
    inputPrefix: '@',
    inputPlaceholder: 'username',
  },
}

function normalizeJournal(journal: any): JournalShape {
  const normalized: JournalShape = { canvases: {} }
  if (!journal || typeof journal !== 'object') return normalized

  JOURNAL_CANVASES.forEach((canvas) => {
    const rawCards = journal.canvases?.[canvas.id]?.cards
    if (!rawCards || typeof rawCards !== 'object') return

    normalized.canvases[canvas.id] = {
      cards: Object.fromEntries(
        Object.entries(rawCards).map(([cardId, value]: [string, any]) => [
          cardId,
          {
            fields: value?.fields && typeof value.fields === 'object'
              ? Object.fromEntries(
                Object.entries(value.fields).map(([fieldId, fieldValue]) => [
                  fieldId,
                  typeof fieldValue === 'string' ? fieldValue : '',
                ])
              )
              : {},
            starredFieldId: typeof value?.starredFieldId === 'string' ? value.starredFieldId : undefined,
            selectedOption: typeof value?.selectedOption === 'string' ? value.selectedOption : undefined,
            selectedOptions: Array.isArray(value?.selectedOptions)
              ? value.selectedOptions.filter((item: unknown) => typeof item === 'string')
              : [],
            starredOptions: Array.isArray(value?.starredOptions)
              ? value.starredOptions.filter((item: unknown) => typeof item === 'string')
              : [],
          },
        ])
      ),
    }
  })

  return normalized
}

function normalizeProfile(profile: any): ProfileShape {
  if (!profile) return { header: { socials: [] }, featured: normalizeFeatured(null), achievements: normalizeAchievements(null), journal: normalizeJournal(null), timelineEnabled: false, timeline: [], sections: [] }
  if (typeof profile === 'string') {
    try {
      return normalizeProfile(JSON.parse(profile))
    } catch {
      return { header: { socials: [] }, featured: normalizeFeatured(null), achievements: normalizeAchievements(null), journal: normalizeJournal(null), timelineEnabled: false, timeline: [], sections: [] }
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
    journal: normalizeJournal(profile.journal),
    timelineEnabled: Boolean(profile.timelineEnabled),
    timeline: normalizeTimeline(profile.timeline),
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
    if (type === 'x' && (hostname === 'x.com' || hostname === 'twitter.com')) return cleanSocialHandle(parts[0] || '')
  } catch {
    // Fall back to lightweight handle parsing below.
  }

  if (type === 'website') return trimmed.replace(/^https?:\/\//i, '').replace(/\/$/, '')
  if (type === 'linkedin') return cleanSocialHandle(trimmed.replace(/^(www\.)?linkedin\.com\/in\//i, ''))
  return cleanSocialHandle(trimmed.replace(/^(www\.)?(instagram\.com|x\.com|twitter\.com)\//i, ''))
}

function normalizeSocialInput(type: SocialType, value: string) {
  const inputValue = getSocialInputValue(type, value)
  if (!inputValue) return ''
  if (type === 'website') return /^https?:\/\//i.test(inputValue) ? inputValue : `https://${inputValue}`
  if (type === 'linkedin') return `https://linkedin.com/in/${inputValue}`
  if (type === 'instagram') return `https://instagram.com/${inputValue}`
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
  if (type === 'x') return { backgroundColor: '#000000' }
  return { backgroundColor: '#111827' }
}

const AVATAR_SOCIAL_SCALE = 198

function getAvatarSocialGeometry(size: number, socialCount: number, expanded = false) {
  const socialScale = AVATAR_SOCIAL_SCALE
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

function getAvatarNameGeometry(size: number, firstName: string, lastName: string) {
  const names = [firstName.trim(), lastName.trim()].filter(Boolean)
  if (names.length === 0) return null

  const fullName = names.join(' ')
  const maxWidth = size * 0.8
  const paddingX = size * 0.045
  const paddingY = size * 0.032
  const baseFontSize = size * 0.085
  const minFontSize = size * 0.052
  const fullNameWidth = estimateTextWidth(fullName, baseFontSize)
  const longestNameWidth = Math.max(...names.map((name) => estimateTextWidth(name, baseFontSize)))
  const lines = fullNameWidth + (paddingX * 2) <= maxWidth ? [fullName] : names
  const widestLine = Math.max(...lines.map((line) => estimateTextWidth(line, baseFontSize)))
  const fontSize = Math.max(minFontSize, Math.min(baseFontSize, (maxWidth - (paddingX * 2)) / Math.max(1, longestNameWidth / baseFontSize)))
  const lineHeight = fontSize * 1.08
  const width = Math.min(maxWidth, Math.max(...lines.map((line) => estimateTextWidth(line, fontSize))) + (paddingX * 2))
  const height = (lines.length * lineHeight) + (paddingY * 2)
  const radius = (fontSize / 2) + paddingY

  return {
    lines,
    width,
    height,
    fontSize,
    lineHeight,
    radius,
    paddingX,
    paddingY,
    needsWordBreak: widestLine + (paddingX * 2) > maxWidth,
  }
}

function getAvatarClipPath(size: number, socialCount: number, nameGeometry: ReturnType<typeof getAvatarNameGeometry> = null, socialsExpanded = false) {
  const baseGeometry = getAvatarSocialGeometry(size, Math.max(1, socialCount), socialsExpanded)
  const radius = baseGeometry.innerRadius
  if (socialCount === 0 && !nameGeometry) {
    return `M ${radius} 0 H ${size - radius} Q ${size} 0 ${size} ${radius} V ${size - radius} Q ${size} ${size} ${size - radius} ${size} H ${radius} Q 0 ${size} 0 ${size - radius} V ${radius} Q 0 0 ${radius} 0 Z`
  }

  const socialGeometry = socialCount > 0 ? getAvatarSocialGeometry(size, socialCount, socialsExpanded) : null
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
  const clipPath = getAvatarClipPath(actualSize, socialSlotCount, nameGeometry, socialsExpanded)
  const { bubble, contentWidth, channelWidth, gap, padding } = getAvatarSocialGeometry(actualSize, socialSlotCount, socialsExpanded)
  const bubbleSize = Math.round(bubble)
  const socialContentWidth = Math.round(contentWidth)
  const avatarImageUrl = avatarUrl || '/empty_avatar.png'
  const socialsTop = socialSlotCount > 0
    ? getAvatarSocialGeometry(actualSize, socialSlotCount, socialsExpanded).channelTop
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
        aria-label="Profile photo"
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
          className="absolute left-0 top-0 flex flex-col justify-center font-black leading-none text-gray-950"
          style={{
            width: nameGeometry.width,
            height: nameGeometry.height,
            paddingLeft: nameGeometry.paddingX,
            paddingRight: nameGeometry.paddingX,
            paddingTop: nameGeometry.paddingY,
            paddingBottom: nameGeometry.paddingY,
            fontSize: nameGeometry.fontSize,
            lineHeight: `${nameGeometry.lineHeight}px`,
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

function getJournalEntry(journal: JournalShape, canvasId: JournalCanvasId, cardId: string): JournalCardEntry {
  return journal.canvases[canvasId]?.cards?.[cardId] || { fields: {} }
}

function getStarredFieldId(
  card: JournalCardConfig,
  entry: JournalCardEntry
) {
  const savedFieldId = entry.starredFieldId
  if (savedFieldId && card.fields.some((field) => field.id === savedFieldId)) return savedFieldId
  return card.fields[0]?.id || ''
}

function getJournalHighlight(
  card: JournalCardConfig,
  entry: JournalCardEntry
) {
  if (card.type === 'singleChoice') {
    const selected = card.options?.find((option) => option.id === entry.selectedOption)
    return {
      label: selected?.label || card.title,
      response: selected?.description || card.info,
    }
  }

  const starredFieldId = getStarredFieldId(card, entry)
  const field = card.fields.find((item) => item.id === starredFieldId) || card.fields[0]
  const response = field ? entry.fields[field.id]?.trim() : ''

  return {
    label: field?.label || card.title,
    response: response || card.info,
  }
}

function getRatingHighlights(
  card: JournalCardConfig,
  entry: JournalCardEntry
) {
  const ratings = card.fields
    .map((field) => ({
      field,
      score: Number(entry.fields[field.id] || 0),
    }))
    .filter((item) => Number.isFinite(item.score) && item.score > 0)

  const top = [...ratings]
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)

  const average = ratings.length
    ? ratings.reduce((sum, item) => sum + item.score, 0) / ratings.length
    : 0

  return { top, average }
}

function RatingAverageIndicator({
  average,
  color,
}: {
  average: number
  color: string
}) {
  const normalized = Math.max(0, Math.min(1, average / 5))
  const circumference = 78
  const arcLength = circumference * 0.78

  return (
    <div className="flex h-20 w-20 shrink-0 flex-col items-center justify-center">
      <div className="relative flex h-14 w-16 items-center justify-center">
        <svg viewBox="0 0 64 64" className="absolute inset-0 h-full w-full">
        <path
          d="M 12 44 A 24 24 0 1 1 52 44"
          fill="none"
          stroke="rgba(255,255,255,0.72)"
          strokeWidth="6"
          strokeLinecap="round"
          pathLength={circumference}
        />
        <path
          d="M 12 44 A 24 24 0 1 1 52 44"
          fill="none"
          stroke={color}
          strokeWidth="6"
          strokeLinecap="round"
          pathLength={circumference}
          strokeDasharray={`${arcLength * normalized} ${circumference}`}
        />
        </svg>
        <div className="text-xl font-black leading-none" style={{ color }}>
          {average.toFixed(1)}
        </div>
      </div>
      <div className="-mt-1 text-[10px] font-bold uppercase tracking-wide text-gray-600">
        Average
      </div>
    </div>
  )
}

function isJournalCardComplete(
  card: JournalCardConfig,
  entry: JournalCardEntry
) {
  if (card.type === 'multiSelect') return (entry.starredOptions || []).length >= 3
  if (card.type === 'singleChoice') return Boolean(entry.selectedOption)
  return card.fields.every((field) => entry.fields[field.id]?.trim())
}

function getJournalCardSections(canvas: JournalCanvasConfig) {
  const sectionNames = Array.from(new Set(canvas.cards.map((card) => card.section || '')))
  return sectionNames.map((section) => ({
    section,
    cards: canvas.cards.filter((card) => (card.section || '') === section),
  }))
}

function getJournalFieldSections(card: JournalCardConfig) {
  const sectionNames = Array.from(new Set(card.fields.map((field) => field.section || '')))
  return sectionNames.map((section) => ({
    section,
    fields: card.fields.filter((field) => (field.section || '') === section),
  }))
}

function getJournalCanvasProgress(journal: JournalShape, canvas: JournalCanvasConfig) {
  const total = canvas.cards.length
  const completed = canvas.cards.filter((card) =>
    isJournalCardComplete(card, getJournalEntry(journal, canvas.id, card.id))
  ).length

  return {
    completed,
    total,
    percent: total > 0 ? Math.round((completed / total) * 100) : 0,
  }
}

function ProgressGauge({
  percent,
  color = '#111827',
  className = '',
}: {
  percent: number
  color?: string
  className?: string
}) {
  const normalized = Math.max(0, Math.min(100, percent))
  const circumference = 44

  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <circle
        cx="24"
        cy="24"
        r="20"
        fill="none"
        stroke="#e5e7eb"
        strokeWidth="4"
      />
      <circle
        cx="24"
        cy="24"
        r="20"
        fill="none"
        stroke={color}
        strokeWidth="4"
        strokeLinecap="round"
        pathLength={circumference}
        strokeDasharray={`${(circumference * normalized) / 100} ${circumference}`}
        transform="rotate(-90 24 24)"
      />
    </svg>
  )
}

function ProfileJournalTabs({
  orgslug,
  activeTab,
  onChange,
}: {
  orgslug: string
  activeTab: JournalCanvasId
  // eslint-disable-next-line no-unused-vars
  onChange?(tab: JournalCanvasId): void
}) {
  return (
    <nav className="px-4 sm:px-0" aria-label="Journal sections">
      <div className="flex items-center gap-6 overflow-x-auto border-b border-gray-200 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {JOURNAL_TABS.map((tab) => {
          const Icon = tab.icon
          const selected = activeTab === tab.id
          const className = `flex shrink-0 items-center gap-2 border-b-2 px-0 pb-3 text-sm font-medium transition-colors ${
            selected
              ? 'border-gray-950 text-gray-950'
              : 'border-transparent text-gray-500 hover:text-gray-800'
          }`
          const content = (
            <>
              <Icon className="h-4 w-4" />
              <span>{tab.label}</span>
            </>
          )
          if (onChange) {
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onChange(tab.id)}
                className={className}
                aria-current={selected ? 'page' : undefined}
              >
                {content}
              </button>
            )
          }

          return (
            <Link
              key={tab.id}
              href={getUriWithOrg(orgslug, routePaths.org.journal(tab.id))}
              className={className}
              aria-current={selected ? 'page' : undefined}
            >
              {content}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

function ProfileOverviewDestinations({
  journal,
  orgslug,
}: {
  journal: JournalShape
  orgslug: string
}) {
  const progress = JOURNAL_CANVASES.reduce(
    (totals, canvas) => {
      const canvasProgress = getJournalCanvasProgress(journal, canvas)
      return {
        completed: totals.completed + canvasProgress.completed,
        total: totals.total + canvasProgress.total,
      }
    },
    { completed: 0, total: 0 }
  )
  const progressPercent = progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0

  return (
    <section className="px-4 pb-2 sm:px-0">
      <h2 className="mb-3 text-2xl font-semibold text-gray-950">Launch Journal</h2>
      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <p className="text-sm font-medium text-gray-700">
          You&apos;re {progressPercent}% of the way to completing your launch journal.
        </p>
        <p className="mt-1 text-xs text-gray-500">
          {progress.completed}/{progress.total} cards complete across identity, lifestyle, and navigation.
        </p>
        <div className="mt-5 flex justify-between gap-3">
          {JOURNAL_CANVASES.map((canvas) => {
            const Icon = canvas.icon
            const canvasProgress = getJournalCanvasProgress(journal, canvas)
            return (
              <Link
                key={canvas.id}
                href={getUriWithOrg(orgslug, routePaths.org.journal(canvas.id))}
                className="flex min-w-0 flex-1 flex-col items-center gap-2 text-center"
              >
                <span className="relative flex h-20 w-20 items-center justify-center">
                  <ProgressGauge percent={canvasProgress.percent} className="absolute inset-0 h-full w-full" />
                  <span className="flex h-14 w-14 items-center justify-center rounded-full bg-gray-950 text-white shadow-sm">
                    <Icon className="h-6 w-6" />
                  </span>
                </span>
                <span className="text-xs font-semibold leading-4 text-gray-800">{canvas.title}</span>
              </Link>
            )
          })}
        </div>
      </div>
    </section>
  )
}

function JournalEditorTray({
  canvas,
  card,
  entry,
  open,
  canEdit,
  startInMain,
  onOpenChange,
  onSave,
}: {
  canvas: JournalCanvasConfig
  card: JournalCardConfig
  entry: JournalCardEntry
  open: boolean
  canEdit: boolean
  startInMain: boolean
  // eslint-disable-next-line no-unused-vars
  onOpenChange(open: boolean): void
  // eslint-disable-next-line no-unused-vars
  onSave(entry: JournalCardEntry): void
}) {
  const Icon = card.icon || canvas.icon
  const cardColor = card.color
  const [view, setView] = useState<'info' | 'main'>('info')
  const [fields, setFields] = useState<Record<string, string>>(entry.fields || {})
  const [starredFieldId, setStarredFieldId] = useState('')
  const [selectedOption, setSelectedOption] = useState(entry.selectedOption || '')
  const [selectedOptions, setSelectedOptions] = useState<string[]>(entry.selectedOptions || [])
  const [starredOptions, setStarredOptions] = useState<string[]>(entry.starredOptions || [])
  const [activeChoice, setActiveChoice] = useState<string | null>(null)
  const [, setDraggingChoice] = useState<string | null>(null)
  const complete = card.type === 'multiSelect'
    ? starredOptions.length >= 3
    : card.type === 'singleChoice'
      ? Boolean(selectedOption)
      : card.fields.every((field) => fields[field.id]?.trim())

  useEffect(() => {
    if (!open) return
    setView(startInMain ? 'main' : 'info')
    setFields(entry.fields || {})
    setStarredFieldId(getStarredFieldId(card, entry))
    setSelectedOption(entry.selectedOption || '')
    setSelectedOptions(entry.selectedOptions || [])
    setStarredOptions(entry.starredOptions || [])
    setActiveChoice(null)
    setDraggingChoice(null)
  }, [card, entry, open, startInMain])

  if (!open) return null

  const closeWithSave = () => {
    if (canEdit) {
      onSave(card.type === 'multiSelect'
        ? { fields: {}, selectedOptions, starredOptions }
        : card.type === 'singleChoice'
          ? { fields: {}, selectedOption }
          : { fields, starredFieldId: starredFieldId || card.fields[0]?.id })
    }
    onOpenChange(false)
  }

  const selectOption = (option: string) => {
    if (!canEdit || selectedOptions.includes(option) || selectedOptions.length >= 16) return
    setSelectedOptions((current) => current.includes(option) ? current : [...current, option])
  }

  const handleOptionPress = (option: string) => {
    if (!canEdit) return
    if (selectedOptions.includes(option)) {
      setActiveChoice((current) => current === option ? null : option)
      return
    }
    selectOption(option)
  }

  const dropOption = (option: string) => {
    setSelectedOptions((current) => current.filter((item) => item !== option))
    setStarredOptions((current) => current.filter((item) => item !== option))
    setActiveChoice(null)
  }

  const starOption = (option: string) => {
    if (starredOptions.includes(option) || starredOptions.length >= 3) return
    if (!selectedOptions.includes(option)) {
      if (selectedOptions.length >= 16) return
      setSelectedOptions((current) => current.includes(option) ? current : [...current, option])
    }
    setStarredOptions((current) => current.includes(option) ? current : [...current, option])
    setActiveChoice(null)
  }

  const unstarOption = (option: string) => {
    setStarredOptions((current) => current.filter((item) => item !== option))
    setActiveChoice(null)
  }

  return (
    <div className="fixed inset-0 z-[var(--z-modal)] flex items-end justify-center bg-black/40 backdrop-blur-[2px] sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={`journal-editor-${card.id}`}
        className="flex max-h-[88vh] w-full max-w-2xl origin-bottom flex-col rounded-t-3xl border-2 bg-white shadow-2xl shadow-black/15 animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-5 sm:max-h-[82vh] sm:origin-center sm:rounded-2xl"
        style={{ borderColor: cardColor.dark }}
      >
        {view === 'info' ? (
          <>
            <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-5 py-5 sm:px-6">
              <div className="flex min-w-0 items-center gap-3">
                <span
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white"
                  style={{ backgroundColor: cardColor.dark }}
                >
                  <Icon className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <h2
                    id={`journal-editor-${card.id}`}
                    className="text-xl font-semibold"
                    style={{ color: cardColor.dark }}
                  >
                    {card.title}
                  </h2>
                  <p className="text-sm text-gray-500">{canvas.title}</p>
                </div>
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={closeWithSave}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 hover:text-gray-900"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6 sm:px-6">
              <p className="text-base leading-7 text-gray-700">{card.info}</p>
            </div>
            <div className="border-t border-gray-100 px-5 py-4 sm:px-6">
              <Button type="button" onClick={() => setView('main')} className="w-full bg-black text-white hover:bg-black/90 sm:w-auto">
                Next
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between gap-4 border-b border-gray-100 px-5 py-4 sm:px-6">
              <div className="flex min-w-0 items-center gap-3">
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                  style={{ backgroundColor: cardColor.light, color: cardColor.dark }}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <h2
                    id={`journal-editor-${card.id}`}
                    className="text-base font-semibold"
                    style={{ color: cardColor.dark }}
                  >
                    {card.title}
                  </h2>
                  <p className="text-xs text-gray-500">
                    {complete ? 'Ready to save' : card.type === 'multiSelect' ? 'Star 3 choices to finish' : card.type === 'singleChoice' ? 'Choose 1 option to finish' : 'Fill every field to finish'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  aria-label="Show info"
                  title="Show info"
                  onClick={() => setView('info')}
                  className="flex h-9 w-9 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 hover:text-gray-900"
                >
                  <HelpCircle className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  aria-label="Close"
                  onClick={closeWithSave}
                  className="flex h-9 w-9 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 hover:text-gray-900"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            {card.type === 'multiSelect' ? (
              <div className="border-b border-gray-100 bg-white px-5 py-3 sm:px-6">
                <div className="mb-2 flex items-center justify-between gap-3 text-xs font-semibold text-gray-500">
                  <span>Starred choices</span>
                  <span>{selectedOptions.length}/16 selected</span>
                </div>
                <div
                  className="grid min-h-11 grid-cols-3 gap-2 rounded-xl border border-dashed border-amber-300 bg-amber-50 p-2"
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault()
                    const option = event.dataTransfer.getData('text/plain')
                    if (option) starOption(option)
                    setDraggingChoice(null)
                  }}
                >
                  {[0, 1, 2].map((index) => {
                    const option = starredOptions[index]
                    return option ? (
                      <button
                        key={option}
                        type="button"
                        draggable
                        onDragStart={(event) => {
                          event.dataTransfer.setData('text/plain', option)
                          setDraggingChoice(option)
                        }}
                        onDragEnd={() => setDraggingChoice(null)}
                        onClick={() => setActiveChoice((current) => current === option ? null : option)}
                        className="relative rounded-full bg-amber-200 px-3 py-1.5 text-xs font-bold text-amber-900 shadow-sm"
                      >
                        {option}
                        {activeChoice === option ? (
                          <span className="absolute left-1/2 top-full z-20 mt-2 flex -translate-x-1/2 gap-1 rounded-full border border-gray-200 bg-white p-1 shadow-lg">
                            <button type="button" aria-label="Unstar" onClick={(event) => { event.stopPropagation(); unstarOption(option) }} className="rounded-full p-1 text-amber-500 hover:bg-amber-50">
                              <Star className="h-3.5 w-3.5 fill-current" />
                            </button>
                            <button type="button" aria-label="Remove" onClick={(event) => { event.stopPropagation(); dropOption(option) }} className="rounded-full p-1 text-gray-500 hover:bg-gray-100">
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </span>
                        ) : null}
                      </button>
                    ) : (
                      <span key={index} className="rounded-full border border-dashed border-amber-300 bg-white/70 px-3 py-1.5 text-center text-xs text-amber-700">
                        Star slot
                      </span>
                    )
                  })}
                </div>
              </div>
            ) : null}
            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5 sm:px-6">
              {card.type === 'multiSelect' ? (
                <div
                  className="space-y-5"
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault()
                    const option = event.dataTransfer.getData('text/plain')
                    if (option) unstarOption(option)
                    setDraggingChoice(null)
                  }}
                >
                  {card.optionSections?.map((section) => {
                    const availableOptions = section.options.filter((option) => !starredOptions.includes(option))
                    return (
                      <div key={section.title} className="space-y-2">
                        <h3 className="text-sm font-black uppercase tracking-wide" style={{ color: cardColor.dark }}>
                          {section.title}
                        </h3>
                        <div className="flex flex-wrap gap-2">
                          {availableOptions.map((option) => (
                            <span key={option} className="relative inline-flex">
                              <button
                                type="button"
                                draggable={canEdit}
                                onDragStart={(event) => {
                                  event.dataTransfer.setData('text/plain', option)
                                  selectOption(option)
                                  setDraggingChoice(option)
                                }}
                                onDragEnd={() => setDraggingChoice(null)}
                                onClick={() => handleOptionPress(option)}
                                disabled={!canEdit || (!selectedOptions.includes(option) && selectedOptions.length >= 16)}
                                className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-all hover:-translate-y-0.5 hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-40 ${
                                  selectedOptions.includes(option)
                                    ? 'border-gray-300 bg-gray-100 text-gray-800 shadow-sm'
                                    : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                                }`}
                              >
                                {option}
                              </button>
                              {activeChoice === option && selectedOptions.includes(option) ? (
                                <span className="absolute left-1/2 top-[-34px] z-20 flex -translate-x-1/2 gap-1 rounded-full border border-gray-200 bg-white p-1 shadow-lg">
                                  <button
                                    type="button"
                                    aria-label="Star"
                                    onClick={(event) => { event.stopPropagation(); starOption(option) }}
                                    disabled={starredOptions.length >= 3}
                                    className="rounded-full p-1 text-amber-500 hover:bg-amber-50 disabled:cursor-not-allowed disabled:text-gray-300 disabled:hover:bg-transparent"
                                  >
                                    <Star className="h-3.5 w-3.5" />
                                  </button>
                                  <button type="button" aria-label="Remove" onClick={(event) => { event.stopPropagation(); dropOption(option) }} className="rounded-full p-1 text-gray-500 hover:bg-gray-100">
                                    <X className="h-3.5 w-3.5" />
                                  </button>
                                </span>
                              ) : null}
                            </span>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : card.type === 'singleChoice' ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {card.options?.map((option) => {
                    const selected = selectedOption === option.id
                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => setSelectedOption(option.id)}
                        disabled={!canEdit}
                        className={`min-h-32 rounded-2xl border-2 bg-white p-4 text-left transition-all ${
                          selected
                            ? 'shadow-lg'
                            : 'border-gray-200 hover:-translate-y-0.5 hover:border-gray-300 hover:shadow-sm'
                        } disabled:cursor-not-allowed disabled:opacity-60`}
                        style={selected ? { borderColor: cardColor.dark, backgroundColor: cardColor.light } : undefined}
                        aria-pressed={selected}
                      >
                        <span className="flex items-start justify-between gap-3">
                          <span>
                            <span className="block text-base font-black" style={{ color: selected ? cardColor.dark : undefined }}>
                              {option.label}
                            </span>
                            <span className="mt-2 block text-sm leading-5 text-gray-700">
                              {option.description}
                            </span>
                          </span>
                          <span
                            className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                              selected ? 'text-white' : 'border-gray-300'
                            }`}
                            style={selected ? { borderColor: cardColor.dark, backgroundColor: cardColor.dark } : undefined}
                          >
                            {selected ? <Check className="h-3 w-3" /> : null}
                          </span>
                        </span>
                      </button>
                    )
                  })}
                </div>
              ) : card.type === 'rating' ? (
                getJournalFieldSections(card).map((fieldGroup) => (
                  <div key={fieldGroup.section || 'default'} className="space-y-3">
                    {fieldGroup.section ? (
                      <h3 className="text-sm font-black uppercase tracking-wide" style={{ color: cardColor.dark }}>
                        {fieldGroup.section}
                      </h3>
                    ) : null}
                    {fieldGroup.fields.map((field) => {
                      const score = Number(fields[field.id] || 0)
                      return (
                        <div key={field.id} className="rounded-2xl border border-gray-200 bg-white p-4">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                              <div className="text-sm font-semibold text-gray-900">{field.label}</div>
                              {field.subtitle ? (
                                <div className="mt-1 text-xs text-gray-500">{field.subtitle}</div>
                              ) : null}
                            </div>
                            <div className="flex items-center gap-1">
                              {[1, 2, 3, 4, 5].map((value) => (
                                <button
                                  key={value}
                                  type="button"
                                  aria-label={`${field.label}: ${value} out of 5`}
                                  onClick={() => setFields((current) => ({ ...current, [field.id]: String(value) }))}
                                  disabled={!canEdit}
                                  className={`flex h-9 w-9 items-center justify-center rounded-full transition-all hover:scale-110 ${
                                    score >= value ? 'text-amber-500' : 'text-gray-300 hover:text-amber-300'
                                  }`}
                                >
                                  <Star className={`h-5 w-5 ${score >= value ? 'fill-current' : ''}`} />
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ))
              ) : getJournalFieldSections(card).map((fieldGroup) => (
                <div key={fieldGroup.section || 'default'} className="space-y-3">
                  {fieldGroup.section ? (
                    <h3 className="text-sm font-black uppercase tracking-wide" style={{ color: cardColor.dark }}>
                      {fieldGroup.section}
                    </h3>
                  ) : null}
                  {fieldGroup.fields.map((field) => {
                    const isStarred = starredFieldId === field.id
                    const showStarSlot = card.fields.length > 1
                    return (
                      <label key={field.id} className="group block space-y-2">
                        <span className="text-sm font-medium text-gray-800">{field.label}</span>
                        <span className="flex items-stretch gap-2">
                          <span className="min-w-0 flex-1">
                            {field.multiline ? (
                              <Textarea
                                value={fields[field.id] || ''}
                                onChange={(event) => setFields((current) => ({ ...current, [field.id]: event.target.value }))}
                                placeholder={field.placeholder}
                                disabled={!canEdit}
                                className="min-h-32 resize-none"
                              />
                            ) : (
                              <Input
                                value={fields[field.id] || ''}
                                onChange={(event) => setFields((current) => ({ ...current, [field.id]: event.target.value }))}
                                placeholder={field.placeholder}
                                disabled={!canEdit}
                              />
                            )}
                          </span>
                          <button
                            type="button"
                            aria-label={`Feature ${field.label} in summary`}
                            title="Feature in summary"
                            onClick={(event) => {
                              event.preventDefault()
                              setStarredFieldId(field.id)
                            }}
                            disabled={!canEdit}
                            className={`mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-all duration-200 ${
                              isStarred
                                ? 'scale-105 bg-amber-100 text-amber-500 shadow-[0_0_18px_rgba(245,158,11,0.35)]'
                                : showStarSlot
                                  ? 'text-amber-400 opacity-0 hover:bg-amber-50 group-hover:opacity-60 hover:opacity-100'
                                  : 'text-amber-400'
                            }`}
                          >
                            <Star className={`h-4 w-4 ${isStarred ? 'fill-current' : ''}`} />
                          </button>
                        </span>
                      </label>
                    )
                  })}
                </div>
              ))}
            </div>
            <div className="border-t border-gray-100 px-5 py-4 sm:px-6">
              <Button
                type="button"
                onClick={closeWithSave}
                disabled={!complete}
                className="w-full bg-black text-white hover:bg-black/90 sm:w-auto"
              >
                Done
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function JournalSection({
  journal,
  canEdit,
  saving,
  orgslug,
  selectedCanvasId,
  workspace = false,
  onChange,
}: {
  journal: JournalShape
  canEdit: boolean
  saving: boolean
  orgslug: string
  selectedCanvasId?: JournalCanvasId
  workspace?: boolean
  // eslint-disable-next-line no-unused-vars
  onChange(nextJournal: JournalShape): void
}) {
  const [openCard, setOpenCard] = useState<{ canvasId: JournalCanvasId, cardId: string } | null>(null)
  const [openAddSection, setOpenAddSection] = useState<string | null>(null)
  const [descriptionExpanded, setDescriptionExpanded] = useState(false)
  const selectedCanvas = JOURNAL_CANVASES.find((canvas) => canvas.id === selectedCanvasId) || null
  const editorCanvas = JOURNAL_CANVASES.find((canvas) => canvas.id === openCard?.canvasId) || null

  const updateEntry = (canvasId: JournalCanvasId, cardId: string, entry: JournalCardEntry) => {
    onChange({
      canvases: {
        ...journal.canvases,
        [canvasId]: {
          cards: {
            ...(journal.canvases[canvasId]?.cards || {}),
            [cardId]: entry,
          },
        },
      },
    })
  }

  if (!selectedCanvas) {
    return (
      <section className="px-4 py-6 sm:px-0">
        <div className="mb-5 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold text-gray-950">Journal</h2>
            <p className="mt-1 text-sm text-gray-500">Choose a canvas to capture structured profile details.</p>
          </div>
          {saving ? (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Saving
            </div>
          ) : null}
        </div>
        <div className="grid gap-3">
          {JOURNAL_CANVASES.map((canvas) => {
            const Icon = canvas.icon
            return (
              <Link
                key={canvas.id}
                href={getUriWithOrg(orgslug, routePaths.org.journal(canvas.id))}
                className="flex w-full items-center gap-4 rounded-2xl border border-gray-200 bg-white p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-gray-300 hover:shadow-md"
              >
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gray-950 text-white">
                  <Icon className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-base font-semibold text-gray-950">{canvas.title}</span>
                  <span className="mt-1 block text-sm leading-5 text-gray-500">{canvas.description}</span>
                </span>
                <ChevronRight className="h-5 w-5 shrink-0 text-gray-400" />
              </Link>
            )
          })}
        </div>
      </section>
    )
  }

  const CanvasIcon = selectedCanvas.icon
  const totalCards = selectedCanvas.cards.length
  const completedCards = selectedCanvas.cards.filter((card) =>
    isJournalCardComplete(card, getJournalEntry(journal, selectedCanvas.id, card.id))
  ).length
  const progressPercent = totalCards > 0 ? (completedCards / totalCards) * 100 : 0
  const descriptionCanExpand = selectedCanvas.description.length > 80

  return (
    <section className={workspace ? 'min-h-screen' : 'px-4 py-6 sm:px-0'}>
      <div className={`mb-4 bg-gradient-to-br from-sky-100 via-white to-emerald-100 p-4 sm:rounded-lg ${
        workspace ? '-mx-4 sm:mx-0' : '-mx-4 sm:mx-0'
      }`}>
        <div className="flex items-center justify-between gap-4 rounded-lg bg-white/95 px-4 py-3 shadow-sm ring-1 ring-black/5">
          <div className="flex min-w-0 flex-1 items-center gap-4">
            <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-gray-950 text-white shadow-sm">
              <CanvasIcon className="h-8 w-8" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-semibold text-gray-950">{selectedCanvas.title}</h2>
              <div className="mt-2 flex items-center gap-3">
                <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-gray-100">
                  <div
                    className="h-full rounded-full bg-gray-950 transition-[width] duration-300"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                <span className="shrink-0 text-sm font-semibold tabular-nums text-gray-600">
                  {completedCards}/{totalCards}
                </span>
              </div>
              <p className={`mt-2 text-sm text-gray-500 ${descriptionExpanded ? '' : 'line-clamp-1'}`}>
                {selectedCanvas.description}
              </p>
              {descriptionCanExpand ? (
                <button
                  type="button"
                  aria-label={descriptionExpanded ? 'Collapse description' : 'Expand description'}
                  onClick={() => setDescriptionExpanded((current) => !current)}
                  className="mt-1 flex h-6 w-6 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                >
                  <ChevronRight className={`h-4 w-4 transition-transform ${descriptionExpanded ? '-rotate-90' : 'rotate-90'}`} />
                </button>
              ) : null}
            </div>
          </div>
          {saving ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-gray-500" /> : null}
        </div>
      </div>
      <div className={`space-y-7 ${workspace ? 'px-4 py-6 sm:px-0 sm:py-8' : ''}`}>
        {getJournalCardSections(selectedCanvas).map((sectionGroup) => (
          <div key={sectionGroup.section || 'default'}>
            {sectionGroup.section ? (
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
                {sectionGroup.section}
              </h3>
            ) : null}
            <div className="grid grid-cols-2 gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,150px),1fr))] sm:gap-4 md:[grid-template-columns:repeat(auto-fit,minmax(190px,240px))]">
              {sectionGroup.cards.map((card) => {
                const cardEntry = getJournalEntry(journal, selectedCanvas.id, card.id)
                const hasStarted = isJournalCardComplete(card, cardEntry)
                const highlight = getJournalHighlight(card, cardEntry)
                const ratingHighlight = card.type === 'rating' ? getRatingHighlights(card, cardEntry) : null
                const choiceHighlight = card.type === 'multiSelect' ? cardEntry.starredOptions || [] : []
                const CardIcon = card.icon || selectedCanvas.icon
                if (!hasStarted) return null

                return (
                  <button
                    key={card.id}
                    type="button"
                    onClick={() => setOpenCard({ canvasId: selectedCanvas.id, cardId: card.id })}
                    className="group flex aspect-[4/3] min-h-36 origin-center flex-col overflow-hidden rounded-2xl border-4 border-white p-0 text-left shadow-[0_14px_30px_rgba(15,23,42,0.14)] transition-all duration-200 hover:-translate-y-1 hover:rotate-[-1deg] hover:scale-[1.02] hover:shadow-[0_20px_40px_rgba(15,23,42,0.18)] active:translate-y-0 active:rotate-3 active:scale-95"
                    style={{ backgroundColor: card.color.light }}
                  >
                    <div className="flex items-center gap-2 px-3 py-3" style={{ color: card.color.dark }}>
                      <CardIcon className="h-5 w-5 shrink-0" />
                      <h3 className="min-w-0 truncate text-base font-black">{card.title}</h3>
                    </div>
                    <div className="min-w-0 flex-1 px-3 py-3">
                      {choiceHighlight.length > 0 ? (
                        <div>
                          <div className="mb-2 text-[11px] font-black uppercase tracking-wide" style={{ color: card.color.dark }}>
                            Top choices
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {choiceHighlight.map((option) => (
                              <span key={option} className="rounded-full bg-white/75 px-2 py-1 text-xs font-bold text-gray-700 shadow-sm">
                                {option}
                              </span>
                            ))}
                          </div>
                        </div>
                      ) : ratingHighlight ? (
                        <div className="flex h-full items-center gap-3">
                          <div className="min-w-0 flex-1 space-y-1.5">
                            <div className="text-[11px] font-black uppercase tracking-wide" style={{ color: card.color.dark }}>
                              Top
                            </div>
                            {ratingHighlight.top.map((item) => (
                              <div key={item.field.id} className="text-xs font-bold text-gray-700">
                                <span className="min-w-0 truncate">{item.field.label}</span>
                              </div>
                            ))}
                          </div>
                          <div className="h-16 w-px shrink-0 bg-white/70" />
                          <RatingAverageIndicator average={ratingHighlight.average} color={card.color.dark} />
                        </div>
                      ) : (
                        <p className="line-clamp-4 text-xs font-medium leading-5 text-gray-700">
                          <span className="mb-1 block text-[11px] font-black uppercase tracking-wide" style={{ color: card.color.dark }}>
                            {highlight.label}
                          </span>
                          <span className="block italic">"{highlight.response}"</span>
                        </p>
                      )}
                    </div>
                  </button>
                )
              })}
              {sectionGroup.cards.some((card) => !isJournalCardComplete(card, getJournalEntry(journal, selectedCanvas.id, card.id))) ? (
                <button
                  type="button"
                  onClick={() => setOpenAddSection((current) => current === sectionGroup.section ? null : sectionGroup.section)}
                  className="group flex aspect-[4/3] min-h-36 flex-col items-center justify-center rounded-2xl border border-dashed border-gray-300 bg-transparent p-4 text-gray-400 transition-colors hover:border-gray-500 hover:text-gray-800"
                  aria-label={`Add ${sectionGroup.section || selectedCanvas.title} tile`}
                >
                  <Plus className="h-6 w-6" />
                </button>
              ) : null}
            </div>
            {openAddSection === sectionGroup.section ? (
              <div className="mt-3 overflow-hidden rounded-2xl border border-gray-200 bg-white">
                <div className="flex gap-3 overflow-x-auto p-3 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {sectionGroup.cards
                    .filter((card) => !isJournalCardComplete(card, getJournalEntry(journal, selectedCanvas.id, card.id)))
                    .map((card) => {
                      const CardIcon = card.icon || selectedCanvas.icon
                      return (
                        <button
                          key={card.id}
                          type="button"
                          onClick={() => {
                            setOpenCard({ canvasId: selectedCanvas.id, cardId: card.id })
                            setOpenAddSection(null)
                          }}
                          className="flex h-28 w-40 shrink-0 flex-col justify-between rounded-xl border-2 border-white p-3 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:rotate-[-1deg] hover:shadow-md"
                          style={{ backgroundColor: card.color.light }}
                        >
                          <span
                            className="flex h-9 w-9 items-center justify-center rounded-lg text-white"
                            style={{ backgroundColor: card.color.dark }}
                          >
                            <CardIcon className="h-4 w-4" />
                          </span>
                          <span>
                            <span className="block text-sm font-semibold" style={{ color: card.color.dark }}>{card.title}</span>
                            <span className="mt-1 block text-xs text-gray-600">Add tile</span>
                          </span>
                        </button>
                      )
                    })}
                </div>
              </div>
            ) : null}
          </div>
        ))}
      </div>
      {editorCanvas && openCard ? (
        <JournalEditorTray
          canvas={editorCanvas}
          card={editorCanvas.cards.find((card) => card.id === openCard.cardId) || editorCanvas.cards[0]}
          entry={getJournalEntry(journal, openCard.canvasId, openCard.cardId)}
          open
          canEdit={canEdit}
          startInMain={isJournalCardComplete(
            editorCanvas.cards.find((card) => card.id === openCard.cardId) || editorCanvas.cards[0],
            getJournalEntry(journal, openCard.canvasId, openCard.cardId)
          )}
          onOpenChange={(isOpen) => {
            if (!isOpen) setOpenCard(null)
          }}
          onSave={(entry) => updateEntry(openCard.canvasId, openCard.cardId, entry)}
        />
      ) : null}
    </section>
  )
}

function getInitialJournalCanvasId(value: string | null): JournalCanvasId {
  return JOURNAL_CANVASES.some((canvas) => canvas.id === value)
    ? value as JournalCanvasId
    : 'identity'
}

export function OwnerJournalPageClient({
  initialUser,
  orgslug,
}: OwnerJournalPageClientProps) {
  const searchParams = useSearchParams()
  const session = useLHSession() as any
  const accessToken = session?.data?.tokens?.access_token
  const [user, setUser] = useState(initialUser)
  const [isSaving, setIsSaving] = useState(false)
  const [activeCanvasId, setActiveCanvasId] = useState<JournalCanvasId>(() =>
    getInitialJournalCanvasId(searchParams.get('canvas'))
  )
  const profile = normalizeProfile(user.profile)
  const journal = profile.journal || normalizeJournal(null)

  const updateJournal = async (nextJournal: JournalShape) => {
    const nextProfile = {
      ...normalizeProfile(user.profile),
      journal: nextJournal,
    }

    if (!accessToken) return

    setIsSaving(true)
    try {
      const payload = {
        ...user,
        profile: nextProfile,
      }
      const res = await updateProfile(payload, user.id, accessToken)
      if (!res.success) throw new Error(res.HTTPmessage)
      setUser(res.data)
      await session?.update?.(true)
    } catch {
      toast.error('Could not save journal')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <main className="min-h-screen">
      <div className="mx-auto w-full max-w-5xl px-0 pt-4 pb-6 sm:px-6 sm:py-6 lg:px-8">
        <ProfileJournalTabs
          orgslug={orgslug}
          activeTab={activeCanvasId}
          onChange={setActiveCanvasId}
        />
        <JournalSection
          journal={journal}
          canEdit
          saving={isSaving}
          orgslug={orgslug}
          selectedCanvasId={activeCanvasId}
          onChange={updateJournal}
        />
      </div>
    </main>
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
  const session = useLHSession() as any
  const accessToken = session?.data?.tokens?.access_token
  const [user, setUser] = useState(initialUser)
  const [draft, setDraft] = useState(() => ({
    first_name: initialUser.first_name || '',
    last_name: initialUser.last_name || '',
    username: initialUser.username || '',
    bio: initialUser.bio || '',
    profile: normalizeProfile(initialUser.profile),
  }))
  const [isSaving, setIsSaving] = useState(false)
  const [uploading, setUploading] = useState<'avatar' | null>(null)
  const [bioExpanded, setBioExpanded] = useState(false)
  const [bioEditing, setBioEditing] = useState(false)
  const [socialsExpanded, setSocialsExpanded] = useState(false)
  const [portfolioEditing, setPortfolioEditing] = useState(false)
  const activeTab = initialTab

  const isOwnerMode = mode === 'owner'
  const isPublicMode = mode === 'public'
  const canManageProfile = isOwnerMode
  const effectiveEditMode = false
  const profile = normalizeProfile(user.profile)
  const headerProfile = canManageProfile ? draft.profile : profile
  const header = headerProfile.header || {}
  const featured = (portfolioEditing ? draft.profile.featured : profile.featured) || normalizeFeatured(null)
  const achievements = profile.achievements || normalizeAchievements(null)
  const journal = headerProfile.journal || normalizeJournal(null)
  const timelineEnabled = profile.timelineEnabled ?? false
  const timelinePublicVisible = profile.timelinePublicVisible !== false
  const socials = useMemo(() => header.socials ?? [], [header.socials])
  const avatarUrl = user.avatar_image
    ? getUserAvatarMediaDirectory(user.user_uuid, user.avatar_image)
    : ''
  const publicProfileHref = getUriWithOrg(orgslug, routePaths.org.user(user.username))
  const resumeHref = getUriWithOrg(orgslug, routePaths.org.profileResume())

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
        socials: (current.header?.socials || []).map((social) =>
          social.type === type ? { ...social, url } : social
        ),
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
      toast.success('Profile link copied')
    } catch {
      toast.error('Could not copy profile link')
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
      toast.success('Profile photo updated')
    } catch {
      toast.error('Could not update profile photo')
    } finally {
      setUploading(null)
      event.target.value = ''
    }
  }

  const persistProfile = async ({
    profileOverride,
    bioOverride,
  }: {
    profileOverride?: ProfileShape
    bioOverride?: string
  } = {}) => {
    if (!accessToken) return false
    const nextProfile = profileOverride || draft.profile
    const nextBio = bioOverride ?? draft.bio
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
        first_name: draft.first_name,
        last_name: draft.last_name,
        username: user.username,
        bio: nextBio,
        profile: nextProfile,
      }
      const res = await updateProfile(payload, user.id, accessToken)
      if (!res.success) throw new Error(res.HTTPmessage)
      setUser(res.data)
      await session?.update?.(true)
      toast.success('Profile saved', { id: loadingToast })
      return true
    } catch {
      toast.error('Could not save profile', { id: loadingToast })
      return false
    } finally {
      setIsSaving(false)
    }
  }

  const handleSave = async (_redirectHref = getUriWithOrg(orgslug, routePaths.org.profile())) => {
    return persistProfile()
  }

  const cancelBioEdit = () => {
    setDraft((current) => ({ ...current, bio: user.bio || '' }))
    setBioEditing(false)
  }

  const saveBioEdit = async () => {
    const saved = await persistProfile({ bioOverride: draft.bio })
    if (saved) setBioEditing(false)
  }

  const cancelPortfolioEdit = () => {
    setDraft((current) => ({
      ...current,
      profile: normalizeProfile(user.profile),
    }))
    setPortfolioEditing(false)
  }

  const savePortfolioEdit = async () => {
    const saved = await handleSave(getUriWithOrg(orgslug, routePaths.org.profile()))
    if (saved) setPortfolioEditing(false)
  }

  const updateJournal = async (nextJournal: JournalShape) => {
    const nextProfile = {
      ...normalizeProfile((effectiveEditMode ? draft.profile : user.profile)),
      journal: nextJournal,
    }

    updateDraftProfile(nextProfile)

    if (!canManageProfile || !accessToken) return

    setIsSaving(true)
    try {
      const payload = {
        ...user,
        first_name: effectiveEditMode ? draft.first_name : user.first_name,
        last_name: effectiveEditMode ? draft.last_name : user.last_name,
        username: user.username,
        bio: effectiveEditMode ? draft.bio : user.bio,
        profile: nextProfile,
      }
      const res = await updateProfile(payload, user.id, accessToken)
      if (!res.success) throw new Error(res.HTTPmessage)
      setUser(res.data)
      await session?.update?.(true)
    } catch {
      toast.error('Could not save journal')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <main className="min-h-screen">
      <div className="mx-auto w-full max-w-5xl px-0 pt-0 pb-6 sm:px-6 sm:py-6 lg:px-8">
        {isPublicMode && isSelf ? (
          <div className="mx-4 mt-4 flex flex-col gap-3 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 sm:mx-0 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-medium text-gray-700">
              You are viewing your public profile.
            </p>
            <Button asChild variant="outline" size="sm">
              <Link href={getUriWithOrg(orgslug, routePaths.org.profile())}>View full profile</Link>
            </Button>
          </div>
        ) : null}
        <section className="relative px-4 py-6 sm:px-0">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
            <div className="w-full shrink-0 sm:w-auto">
              <div className="relative w-full sm:hidden">
                <ProfileHeaderAvatar
                  size={198}
                  avatarUrl={avatarUrl || getUriWithOrg(orgslug, '/empty_avatar.png')}
                  socials={socials}
                  userId={user.id}
                  firstName={user.first_name}
                  lastName={user.last_name}
                  showNameCutout
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
              <div className="hidden sm:block">
                <ProfileHeaderAvatar
                  size={270}
                  avatarUrl={avatarUrl || getUriWithOrg(orgslug, '/empty_avatar.png')}
                  socials={socials}
                  userId={user.id}
                  firstName={user.first_name}
                  lastName={user.last_name}
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

            <div className="min-w-0 flex-1 space-y-3">
              <div className="min-w-0">
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div>
                      <h1 className="hidden text-3xl font-semibold text-gray-950 sm:block">
                        {user.first_name} {user.last_name}
                      </h1>
                    </div>
                  </div>
                </div>
              </div>

              <div className="group relative max-w-2xl">
                {bioEditing ? (
                  <Textarea
                    value={draft.bio}
                    onChange={(event) => setDraft((current) => ({ ...current, bio: event.target.value }))}
                    onFocus={() => setSocialsExpanded(false)}
                    placeholder="Write a short profile"
                    className="min-h-40 pr-20"
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
                {canManageProfile ? (
                  <div className="absolute right-0 top-0 flex items-center gap-1">
                    {bioEditing ? (
                      <>
                        <Button type="button" variant="outline" size="icon" onClick={cancelBioEdit} aria-label="Cancel bio edit" className="h-8 w-8">
                          <X className="h-4 w-4" />
                        </Button>
                        <Button type="button" size="icon" onClick={saveBioEdit} disabled={isSaving} aria-label="Save bio" className="h-8 w-8 bg-emerald-500 text-white hover:bg-emerald-600">
                          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                        </Button>
                      </>
                    ) : (
                      <Button type="button" variant="outline" size="icon" onClick={() => setBioEditing(true)} aria-label="Edit bio" className="h-8 w-8">
                        <Edit3 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </section>
        {(canManageProfile || isPublicMode) ? (
          <div className="px-4 pb-4 sm:px-0">
            <div className="flex flex-wrap items-center gap-2">
              {canManageProfile ? (
                <Button asChild variant="outline">
                  <Link href={publicProfileHref}>
                    <Eye size={16} className="mr-2" />
                    Public profile
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
                  {canManageProfile ? (
                    <DropdownMenuItem asChild>
                      <Link href={resumeHref}>
                        <FileText className="h-4 w-4" />
                        <span>Resume</span>
                      </Link>
                    </DropdownMenuItem>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        ) : null}
        {activeTab === 'overview' ? (
          canManageProfile ? <ProfileOverviewDestinations journal={journal} orgslug={orgslug} /> : null
        ) : activeTab !== 'timeline' ? (
          <ProfileJournalTabs orgslug={orgslug} activeTab={activeTab} />
        ) : null}
        {activeTab === 'overview' ? (
          <>
            <FeaturedCarousel
              featured={featured}
              editMode={portfolioEditing}
              accessToken={accessToken}
              userId={user.id}
              userUuid={user.user_uuid}
              orgslug={orgslug}
              authorName={getPortfolioAuthorName(user)}
              updatedAtFallback={user.update_date}
              profileUsername={profileUsername || user.username}
              ownerView={canManageProfile}
              publicVisible={isPublicMode || portfolioEditing ? featured.publicVisible : true}
              actions={canManageProfile ? (
                <div className="flex items-center gap-2">
                  {portfolioEditing ? (
                    <>
                      <Button type="button" variant="outline" size="icon" onClick={cancelPortfolioEdit} aria-label="Cancel portfolio edits">
                        <X className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        onClick={savePortfolioEdit}
                        disabled={isSaving}
                        aria-label="Save portfolio edits"
                        className="bg-emerald-500 text-white hover:bg-emerald-600"
                      >
                        {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                      </Button>
                    </>
                  ) : (
                    <Button type="button" variant="outline" size="icon" onClick={() => setPortfolioEditing(true)} aria-label="Edit portfolio">
                      <Edit3 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ) : null}
              onChange={updateFeatured}
              onPublicVisibleChange={(visible) => updateFeatured({ ...featured, publicVisible: visible })}
            />
            <ProfileAchievementsSection
              achievements={achievements}
              orgslug={orgslug}
              profileUsername={profileUsername}
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
          </>
        ) : null}
        {activeTab !== 'overview' && activeTab !== 'timeline' ? (
          <JournalSection
            journal={journal}
            canEdit={canManageProfile}
            saving={isSaving}
            orgslug={orgslug}
            selectedCanvasId={activeTab}
            onChange={updateJournal}
          />
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
