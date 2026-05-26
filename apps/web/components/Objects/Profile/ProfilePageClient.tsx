'use client'

import React, { useEffect, useId, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import {
  Camera,
  Check,
  ChevronRight,
  Copy,
  Edit3,
  Eye,
  FileText,
  Globe,
  Instagram,
  Linkedin,
  Loader2,
  Plus,
  Share2,
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
import { normalizeAchievements, ProfileAchievementsSection } from '@components/Objects/Profile/ProfileAchievements'
import {
  FeaturedCarousel,
  getPortfolioAuthorName,
  normalizeFeatured,
  type FeaturedSection,
} from '@components/Objects/Profile/ProfilePortfolio'
import ProfileTimeline, { normalizeTimeline, type TimelineEntry } from '@components/Objects/Profile/ProfileTimeline'
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
type ProfileTab = 'overview' | 'timeline'

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

function normalizeProfile(profile: any): ProfileShape {
  if (!profile) return { header: { socials: [] }, featured: normalizeFeatured(null), achievements: normalizeAchievements(null), timelineEnabled: false, timeline: [], sections: [] }
  if (typeof profile === 'string') {
    try {
      return normalizeProfile(JSON.parse(profile))
    } catch {
      return { header: { socials: [] }, featured: normalizeFeatured(null), achievements: normalizeAchievements(null), timelineEnabled: false, timeline: [], sections: [] }
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
        fontSize: `clamp(${minRem}rem, calc(100cqw / ${fitFactor}), ${maxRem}rem)`,
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
  canManage,
}: {
  timeline: TimelineEntry[]
  href: string
  canManage: boolean
}) {
  const recentEntries = getRecentTimelineEntries(timeline)

  if (!canManage && recentEntries.length === 0) return null

  return (
    <section className="px-4 py-6 sm:px-0">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-2xl font-semibold text-gray-950">Timeline</h2>
        <Link
          href={href}
          className="flex items-center gap-1.5 text-sm font-semibold text-gray-600 transition-colors hover:text-gray-950"
        >
          <span>See whole timeline</span>
          <ChevronRight className="h-4 w-4" />
        </Link>
      </div>
      {recentEntries.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {recentEntries.map((entry) => {
            const detail = getTimelineEntryDetail(entry)
            return (
              <article key={entry.id} className="min-h-40 rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
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
                {entry.description ? (
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
  const timelineEnabled = profile.timelineEnabled ?? false
  const timelinePublicVisible = profile.timelinePublicVisible !== false
  const socials = useMemo(() => header.socials ?? [], [header.socials])
  const avatarUrl = user.avatar_image
    ? getUserAvatarMediaDirectory(user.user_uuid, user.avatar_image)
    : ''
  const publicProfileHref = getUriWithOrg(orgslug, routePaths.org.user(user.username))
  const resumeHref = getUriWithOrg(orgslug, routePaths.org.profileResume())
  const timelineHref = getUriWithOrg(
    orgslug,
    isPublicMode
      ? routePaths.org.userTimeline(profileUsername || user.username)
      : routePaths.org.profileTimeline()
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
          <div className="flex flex-col gap-5 sm:grid sm:grid-cols-2 sm:items-start sm:gap-8">
            <div className="w-full shrink-0 sm:order-2">
              <ProfileNameStack
                firstName={user.first_name}
                maxRem={4.25}
                minRem={2.25}
                className="mb-5 sm:hidden"
              />
              <div className="relative w-full sm:hidden">
                <ProfileHeaderAvatar
                  size={198}
                  avatarUrl={avatarUrl || getUriWithOrg(orgslug, '/empty_avatar.png')}
                  socials={socials}
                  userId={user.id}
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
              <div className="hidden w-full sm:block">
                <ProfileHeaderAvatar
                  size={270}
                  avatarUrl={avatarUrl || getUriWithOrg(orgslug, '/empty_avatar.png')}
                  socials={socials}
                  userId={user.id}
                  firstName={user.first_name}
                  lastName={user.last_name}
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
                    <ProfileNameStack
                      firstName={user.first_name}
                      lastName={user.last_name}
                      maxRem={8.5}
                      minRem={3.5}
                      align="right"
                      className="hidden sm:block"
                    />
                  </div>
                </div>
              </div>

              <div className="group relative max-w-2xl sm:ml-auto sm:w-3/4 sm:max-w-none">
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
              {(canManageProfile || isPublicMode) ? (
                <div className="border-t border-gray-200 pt-3 sm:ml-auto sm:w-3/4">
                  <div className="flex flex-wrap items-center gap-2 sm:justify-end">
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
            </div>
          </div>
        </section>
        {activeTab === 'overview' ? (
          <>
            {(canManageProfile || (timelineEnabled && timelinePublicVisible)) ? (
              <TimelineOverviewSection
                timeline={profile.timeline || []}
                href={timelineHref}
                canManage={canManageProfile}
              />
            ) : null}
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
