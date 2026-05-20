'use client'

import React, { useEffect, useId, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  BookOpen,
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Copy,
  Edit3,
  Eye,
  FileText,
  Globe,
  Instagram,
  LayoutGrid,
  Linkedin,
  Link2,
  Loader2,
  Plus,
  Save,
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
import { Switch } from '@components/ui/switch'
import { Textarea } from '@components/ui/textarea'
import { normalizeAchievements, ProfileAchievementsSection } from '@components/Objects/Profile/ProfileAchievements'
import ProfileTimeline, { normalizeTimeline } from '@components/Objects/Profile/ProfileTimeline'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { getUserAvatarMediaDirectory, getUserProfileFeaturedMediaDirectory } from '@services/media/media'
import { getResourceUrlPreview, ResourceUrlPreview } from '@services/resources/resources'
import { updateProfile } from '@services/settings/profile'
import { updateUserAvatar, uploadUserProfileFeaturedImage } from '@services/users/users'

type SocialType = 'website' | 'linkedin' | 'instagram' | 'x'

type SocialLink = {
  type: SocialType
  url: string
}

type ProfileHeader = {
  coverImage?: string
  socials?: SocialLink[]
}

type FeaturedCard = {
  id: string
  url: string
  title: string
  subtext: string
  imageUrl: string
  textTone: 'dark' | 'light'
}

type FeaturedSection = {
  enabled: boolean
  publicVisible: boolean
  cards: FeaturedCard[]
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
  mode: 'owner' | 'public'
  isSelf?: boolean
}

type OwnerProfilePageClientProps = Omit<ProfilePageClientProps, 'mode' | 'isSelf'>
type PublicProfilePageClientProps = Omit<ProfilePageClientProps, 'mode' | 'editMode'>
type ProfileTab = 'overview' | 'journal' | 'timeline'

const PROFILE_TABS: Array<{
  id: ProfileTab
  label: string
  icon: React.ComponentType<{ className?: string }>
}> = [
  { id: 'overview', label: 'Overview', icon: LayoutGrid },
  { id: 'journal', label: 'Journal', icon: BookOpen },
  { id: 'timeline', label: 'Timeline', icon: Clock3 },
]

const SOCIAL_CONFIG: Record<SocialType, {
  label: string
  placeholder: string
  icon: React.ComponentType<{ className?: string }>
  hostPattern: RegExp
}> = {
  website: {
    label: 'Website',
    placeholder: 'https://example.com',
    icon: Globe,
    hostPattern: /.+/,
  },
  linkedin: {
    label: 'LinkedIn',
    placeholder: 'https://linkedin.com/in/username',
    icon: Linkedin,
    hostPattern: /(^|\.)linkedin\.com$/i,
  },
  instagram: {
    label: 'Instagram',
    placeholder: 'https://instagram.com/username',
    icon: Instagram,
    hostPattern: /(^|\.)instagram\.com$/i,
  },
  x: {
    label: 'X',
    placeholder: 'https://x.com/username',
    icon: X,
    hostPattern: /(^|\.)x\.com$|(^|\.)twitter\.com$/i,
  },
}

function normalizeFeatured(featured: any): FeaturedSection {
  return {
    enabled: Boolean(featured?.enabled),
    publicVisible: featured?.publicVisible !== false,
    cards: Array.isArray(featured?.cards)
      ? featured.cards.slice(0, 10).map((card: any) => ({
        id: card.id || `featured-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        url: card.url || '',
        title: card.title || '',
        subtext: card.subtext || '',
        imageUrl: card.imageUrl || card.coverImageUrl || '',
        textTone: card.textTone === 'light' ? 'light' : 'dark',
      }))
      : [],
  }
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

function normalizeUrl(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return ''
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
}

function previewToCardUpdate(preview: ResourceUrlPreview) {
  return {
    url: preview.og_url || preview.url || '',
    title: preview.title || '',
    subtext: preview.description || '',
    imageUrl: preview.og_image || '',
  }
}

function createEmptyFeaturedCard(): FeaturedCard {
  return {
    id: `featured-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    url: '',
    title: '',
    subtext: '',
    imageUrl: '',
    textTone: 'dark',
  }
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

function getAvatarSocialGeometry(size: number, socialCount: number) {
  const socialScale = AVATAR_SOCIAL_SCALE
  const gap = socialScale * 0.055
  const bubble = Math.min(socialScale * 0.22, (socialScale - ((socialCount + 1) * gap)) / Math.max(1, socialCount))
  const padding = socialScale * 0.05
  const channelWidth = bubble + (padding * 2)
  const channelX = size - channelWidth
  const barHeight = (socialCount * bubble) + (Math.max(0, socialCount - 1) * gap)
  const channelTop = Math.max(size * 0.14, size - barHeight - padding)
  const innerRadius = (bubble / 2) + padding

  return {
    bubble,
    channelWidth,
    channelX,
    gap,
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

function getAvatarClipPath(size: number, socialCount: number, nameGeometry: ReturnType<typeof getAvatarNameGeometry> = null) {
  const radius = size * 0.14
  if (socialCount === 0 && !nameGeometry) {
    return `M ${radius} 0 H ${size - radius} Q ${size} 0 ${size} ${radius} V ${size - radius} Q ${size} ${size} ${size - radius} ${size} H ${radius} Q 0 ${size} 0 ${size - radius} V ${radius} Q 0 0 ${radius} 0 Z`
  }

  const socialGeometry = socialCount > 0 ? getAvatarSocialGeometry(size, socialCount) : null
  const channelX = socialGeometry?.channelX ?? size
  const channelTop = socialGeometry?.channelTop ?? size
  const innerRadius = socialGeometry?.innerRadius ?? 0
  const nameWidth = nameGeometry?.width ?? 0
  const nameHeight = nameGeometry?.height ?? 0
  const nameRadius = Math.min(nameGeometry?.radius ?? 0, nameWidth / 2, nameHeight / 2)
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
  editMode,
  uploading,
  onAvatarChange,
}: {
  avatarUrl: string
  socials: SocialLink[]
  size: number
  userId: number | string
  firstName?: string
  lastName?: string
  showNameCutout?: boolean
  fullWidth?: boolean
  editMode: boolean
  uploading: boolean
  // eslint-disable-next-line no-unused-vars
  onAvatarChange(event: React.ChangeEvent<HTMLInputElement>): void
}) {
  const clipId = useId()
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [measuredSize, setMeasuredSize] = useState(size)
  const actualSize = fullWidth ? measuredSize : size
  const safeClipId = `profile-avatar-${clipId.replace(/[^a-zA-Z0-9_-]/g, '')}`
  const visibleSocials = socials.filter((social) => social.url).slice(0, 5)
  const nameGeometry = showNameCutout ? getAvatarNameGeometry(actualSize, firstName || '', lastName || '') : null
  const clipPath = getAvatarClipPath(actualSize, visibleSocials.length, nameGeometry)
  const { bubble, channelWidth, gap } = getAvatarSocialGeometry(actualSize, visibleSocials.length)
  const bubbleSize = Math.round(bubble)
  const avatarImageUrl = avatarUrl || '/empty_avatar.png'

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

      {visibleSocials.length > 0 ? (
        <div
          className="absolute right-0 bottom-0 flex flex-col items-center"
          style={{
            width: channelWidth,
            gap,
          }}
        >
          {visibleSocials.map((social) => {
            const config = SOCIAL_CONFIG[social.type]
            const Icon = config.icon
            return (
              <a
                key={social.type}
                href={getSocialHref(social)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex shrink-0 items-center justify-center rounded-full text-white shadow-sm ring-2 ring-white transition-transform hover:-translate-y-0.5"
                style={{
                  width: bubbleSize,
                  height: bubbleSize,
                  ...getSocialBubbleStyle(social.type),
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

      {editMode ? (
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
            className="absolute left-3 bottom-3 flex h-9 w-9 items-center justify-center rounded-full bg-black text-white shadow-md"
            disabled={uploading}
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera size={18} />}
          </button>
        </>
      ) : null}
    </div>
  )
}

function getCardImage(card?: FeaturedCard) {
  return card?.imageUrl || ''
}

function FeaturedDisplayCard({
  card,
}: {
  card: FeaturedCard
}) {
  const image = getCardImage(card)
  const content = (
    <>
      <div className="aspect-[16/10] w-full overflow-hidden rounded-xl bg-[linear-gradient(135deg,#eef2ff,#f8fafc,#dcfce7)]">
        {image ? (
          <img src={image} alt="" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]" />
        ) : null}
      </div>
      <div className="px-1 pt-4">
        <h3 className="text-lg font-semibold leading-snug text-gray-950">
          {card.title || 'Portfolio item'}
        </h3>
        {card.subtext ? (
          <p className="mt-2 max-h-20 overflow-hidden text-sm leading-5 text-gray-600">
            {card.subtext}
          </p>
        ) : null}
      </div>
    </>
  )

  const className = 'group block h-full w-[min(82vw,320px)] rounded-2xl p-2 transition-all duration-200 hover:-translate-y-1 hover:bg-gray-50 hover:shadow-md sm:w-[300px]'

  if (!card.url) {
    return <article className={className}>{content}</article>
  }

  return (
    <a
      href={normalizeUrl(card.url)}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
    >
      {content}
    </a>
  )
}

function FeaturedCarousel({
  featured,
  editMode,
  accessToken,
  userId,
  userUuid,
  publicVisible = true,
  onChange,
  onPublicVisibleChange,
}: {
  featured: FeaturedSection
  editMode: boolean
  accessToken?: string
  userId: number
  userUuid: string
  publicVisible?: boolean
  // eslint-disable-next-line no-unused-vars
  onChange(next: FeaturedSection): void
  // eslint-disable-next-line no-unused-vars
  onPublicVisibleChange?(visible: boolean): void
}) {
  const cards = featured.cards || []
  const [activeIndex, setActiveIndex] = useState(0)
  const [linkDraft, setLinkDraft] = useState('')
  const [isScraping, setIsScraping] = useState(false)
  const [isUploadingImage, setIsUploadingImage] = useState(false)
  const [pendingPreview, setPendingPreview] = useState<ResourceUrlPreview | null>(null)
  const [canScrollBack, setCanScrollBack] = useState(false)
  const [canScrollForward, setCanScrollForward] = useState(false)
  const mobileScrollerRef = useRef<HTMLDivElement | null>(null)
  const [, setDraggingThumbIndex] = useState<number | null>(null)
  const draggingThumbIndexRef = useRef<number | null>(null)
  const thumbDragMovedRef = useRef(false)

  const activeCard = cards[Math.min(activeIndex, Math.max(cards.length - 1, 0))]
  const enabled = featured.enabled

  const updateFeatured = (next: Partial<FeaturedSection>) => {
    onChange({ ...featured, ...next })
  }

  const updateCard = (cardId: string, patch: Partial<FeaturedCard>) => {
    updateFeatured({
      cards: cards.map((card) => card.id === cardId ? { ...card, ...patch } : card),
    })
  }

  const setEnabled = (value: boolean) => {
    updateFeatured({ enabled: value })
  }

  const addCard = () => {
    if (cards.length >= 10) {
      toast.error('Portfolio is capped at 10 items')
      return
    }
    const nextCard = createEmptyFeaturedCard()
    updateFeatured({ enabled: true, cards: [...cards, nextCard] })
    setActiveIndex(cards.length)
    setLinkDraft('')
    setPendingPreview(null)
  }

  const deleteCard = (cardId: string) => {
    const nextCards = cards.filter((card) => card.id !== cardId)
    updateFeatured({ cards: nextCards })
    setActiveIndex((current) => Math.max(0, Math.min(current, nextCards.length - 1)))
  }

  const scrollPortfolioCardIntoView = (index: number) => {
    const scroller = mobileScrollerRef.current
    const card = scroller?.children.item(index) as HTMLElement | null
    if (!scroller || !card) return

    const left = card.offsetLeft - (scroller.clientWidth - card.offsetWidth) / 2
    scroller.scrollTo({ left: Math.max(0, left), behavior: 'smooth' })
  }

  const updateScrollControls = () => {
    const scroller = mobileScrollerRef.current
    if (!scroller) return

    const maxScrollLeft = scroller.scrollWidth - scroller.clientWidth
    setCanScrollBack(scroller.scrollLeft > 2)
    setCanScrollForward(scroller.scrollLeft < maxScrollLeft - 2)
  }

  const moveTo = (index: number) => {
    if (!cards.length) return
    const next = Math.max(0, Math.min(index, cards.length - 1))
    setActiveIndex(next)
    setPendingPreview(null)
    scrollPortfolioCardIntoView(next)
  }

  const scrollPortfolioPage = (direction: -1 | 1) => {
    const scroller = mobileScrollerRef.current
    if (!scroller) return

    scroller.scrollBy({
      left: direction * scroller.clientWidth * 0.9,
      behavior: 'smooth',
    })
  }

  const applyPreview = (cardId: string, preview: ResourceUrlPreview, overwrite: boolean) => {
    const update = previewToCardUpdate(preview)
    const card = cards.find((item) => item.id === cardId)
    updateCard(cardId, {
      url: normalizeUrl(update.url || linkDraft),
      title: overwrite || !card?.title ? update.title : card.title,
      subtext: overwrite || !card?.subtext ? update.subtext : card.subtext,
      imageUrl: overwrite || !card?.imageUrl ? update.imageUrl : card.imageUrl,
    })
    setPendingPreview(null)
  }

  const scrapeLink = async (cardId: string, rawValue: string) => {
    const url = normalizeUrl(rawValue)
    if (!url || !accessToken) return

    try {
      setIsScraping(true)
      setPendingPreview(null)
      const preview = await getResourceUrlPreview(url, accessToken)
      const card = cards.find((item) => item.id === cardId)
      const hasExistingDetails = Boolean(card?.title || card?.subtext || card?.imageUrl)
      if (hasExistingDetails) {
        updateCard(cardId, { url })
        setPendingPreview(preview)
      } else {
        applyPreview(cardId, preview, true)
      }
    } catch {
      updateCard(cardId, { url })
      toast.error('Could not find details for that link')
    } finally {
      setIsScraping(false)
    }
  }

  const reorderThumb = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return
    if (fromIndex >= cards.length || toIndex >= cards.length) return

    const nextCards = Array.from(cards)
    const [moved] = nextCards.splice(fromIndex, 1)
    nextCards.splice(toIndex, 0, moved)
    updateFeatured({ cards: nextCards })
    setActiveIndex(toIndex)
    setDraggingThumbIndex(toIndex)
    draggingThumbIndexRef.current = toIndex
    thumbDragMovedRef.current = true
  }

  const handleFeaturedImageUpload = async (
    event: React.ChangeEvent<HTMLInputElement>,
    cardId: string
  ) => {
    const file = event.target.files?.[0]
    if (!file || !accessToken) return

    setIsUploadingImage(true)
    try {
      const res = await uploadUserProfileFeaturedImage(userId, file, accessToken)
      if (!res.success) throw new Error(res.HTTPmessage)
      const imageUrl = getUserProfileFeaturedMediaDirectory(
        res.data.user_uuid || userUuid,
        res.data.filename
      )
      updateCard(cardId, { imageUrl })
      toast.success('Portfolio image uploaded')
    } catch {
      toast.error('Could not upload portfolio image')
    } finally {
      setIsUploadingImage(false)
      event.target.value = ''
    }
  }

  const handleMobileScroll = () => {
    const scroller = mobileScrollerRef.current
    if (!scroller || cards.length === 0) return
    updateScrollControls()
    const scrollerCenter = scroller.scrollLeft + scroller.clientWidth / 2
    let closestIndex = 0
    let closestDistance = Number.POSITIVE_INFINITY

    Array.from(scroller.children).forEach((child, index) => {
      const element = child as HTMLElement
      const childCenter = element.offsetLeft + element.offsetWidth / 2
      const distance = Math.abs(childCenter - scrollerCenter)
      if (distance < closestDistance) {
        closestDistance = distance
        closestIndex = index
      }
    })

    setActiveIndex(closestIndex)
  }

  useEffect(() => {
    updateScrollControls()
    window.addEventListener('resize', updateScrollControls)
    return () => window.removeEventListener('resize', updateScrollControls)
  }, [cards.length])

  if (!editMode && (!enabled || !publicVisible || cards.length === 0)) return null

  return (
    <section className="mt-4 px-4 sm:px-0">
      <div className="mb-3 flex items-center justify-between gap-4">
        <h2 className="text-2xl font-semibold text-gray-950">Portfolio</h2>
        {editMode ? (
          <div className="flex flex-col items-end gap-2">
            <label className="flex items-center gap-3">
              <span className="text-sm text-gray-500">{enabled ? 'On your profile' : 'Hidden from profile'}</span>
              <Switch checked={enabled} onCheckedChange={setEnabled} />
            </label>
            <label className="flex items-center gap-3">
              <span className="text-sm text-gray-500">{publicVisible ? 'Visible to others' : 'Hidden from others'}</span>
              <Switch
                checked={publicVisible}
                onCheckedChange={onPublicVisibleChange}
                disabled={!enabled}
              />
            </label>
          </div>
        ) : null}
      </div>

      <div
        className={`origin-top transition-all duration-300 ${
          enabled ? 'scale-100 opacity-100' : 'max-h-0 scale-95 overflow-hidden opacity-0'
        }`}
      >
        {editMode ? (
          <div className="space-y-4">
            <div className="flex min-h-[290px] items-center justify-center">
              {activeCard ? (
                <div className="relative w-[min(82vw,320px)] rounded-2xl bg-white p-2 sm:w-[300px]">
                  <button
                    type="button"
                    aria-label="Delete portfolio item"
                    onClick={() => deleteCard(activeCard.id)}
                    className="absolute right-4 top-4 z-20 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-gray-700 shadow-sm ring-1 ring-gray-200 hover:text-red-600"
                  >
                    <X className="h-4 w-4" />
                  </button>
                  <div className="relative aspect-[16/10] w-full overflow-hidden rounded-xl bg-[linear-gradient(135deg,#eef2ff,#f8fafc,#dcfce7)]">
                    {activeCard.imageUrl ? (
                      <img src={activeCard.imageUrl} alt="" className="h-full w-full object-cover" />
                    ) : null}
                    <input
                      id={`featured-image-upload-${activeCard.id}`}
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif"
                      className="hidden"
                      onChange={(event) => handleFeaturedImageUpload(event, activeCard.id)}
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => document.getElementById(`featured-image-upload-${activeCard.id}`)?.click()}
                      disabled={isUploadingImage}
                      className="absolute bottom-3 right-3 h-8 bg-white/90 px-2 text-xs text-gray-900 hover:bg-white"
                    >
                      {isUploadingImage ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
                    </Button>
                  </div>
                  <div className="space-y-3 px-1 pt-4">
                    <Input
                      value={activeCard.title}
                      onChange={(event) => updateCard(activeCard.id, { title: event.target.value })}
                      placeholder="Title"
                      className="border-0 px-0 text-lg font-semibold text-gray-950 shadow-none focus-visible:ring-0"
                    />
                    <Textarea
                      value={activeCard.subtext}
                      onChange={(event) => updateCard(activeCard.id, { subtext: event.target.value })}
                      placeholder="Description"
                      className="max-h-24 min-h-20 resize-none px-0 text-sm leading-5 text-gray-600 shadow-none focus-visible:ring-0"
                    />
                    <div className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2">
                      <Link2 className="h-4 w-4 shrink-0 text-gray-500" />
                      <Input
                        value={activeCard.url}
                        onChange={(event) => {
                          setLinkDraft(event.target.value)
                          updateCard(activeCard.id, { url: event.target.value })
                        }}
                        onPaste={(event) => {
                          const pasted = event.clipboardData.getData('text')
                          setLinkDraft(pasted)
                          window.setTimeout(() => scrapeLink(activeCard.id, pasted), 0)
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') scrapeLink(activeCard.id, activeCard.url || linkDraft)
                        }}
                        placeholder="https://example.com"
                        className="h-8 border-0 px-0 shadow-none focus-visible:ring-0"
                      />
                    </div>
                    {isScraping ? (
                      <div className="flex items-center gap-2 text-sm text-gray-500">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Searching for link details...
                      </div>
                    ) : null}
                    {pendingPreview ? (
                      <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm">
                        <p className="text-gray-700">Use the details I found, or keep your existing text?</p>
                        <div className="mt-3 flex gap-2">
                          <Button type="button" size="sm" onClick={() => applyPreview(activeCard.id, pendingPreview, true)}>
                            Accept
                          </Button>
                          <Button type="button" size="sm" variant="outline" onClick={() => applyPreview(activeCard.id, pendingPreview, false)}>
                            Keep existing
                          </Button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={addCard}
                  className="flex h-[200px] w-[min(82vw,360px)] flex-col items-center justify-center rounded-[28px] border border-dashed border-gray-300 text-gray-500 hover:border-gray-500 hover:text-gray-900"
                >
                  <Plus className="mb-2 h-6 w-6" />
                  Add portfolio item
                </button>
              )}
            </div>

            <div
              className="scrollbar-hide flex items-center justify-center gap-2 overflow-x-auto px-2 pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              onPointerMove={(event) => {
                const fromIndex = draggingThumbIndexRef.current
                if (fromIndex === null) return

                const target = document
                  .elementFromPoint(event.clientX, event.clientY)
                  ?.closest('[data-featured-thumb-index]')
                const targetIndex = Number((target as HTMLElement | null)?.dataset.featuredThumbIndex)

                if (Number.isInteger(targetIndex) && targetIndex !== fromIndex) {
                  reorderThumb(fromIndex, targetIndex)
                }
              }}
              onPointerUp={() => {
                setDraggingThumbIndex(null)
                draggingThumbIndexRef.current = null
              }}
              onPointerCancel={() => {
                setDraggingThumbIndex(null)
                draggingThumbIndexRef.current = null
              }}
              onPointerLeave={() => {
                setDraggingThumbIndex(null)
                draggingThumbIndexRef.current = null
              }}
            >
              {cards.map((card, index) => (
                <div
                  key={card.id}
                  data-featured-thumb-index={index}
                  role="button"
                  tabIndex={0}
                  aria-label={`Select portfolio item ${index + 1}`}
                  onPointerDown={() => {
                    setDraggingThumbIndex(index)
                    draggingThumbIndexRef.current = index
                    thumbDragMovedRef.current = false
                  }}
                  onClick={() => {
                    if (thumbDragMovedRef.current) {
                      thumbDragMovedRef.current = false
                      return
                    }
                    setActiveIndex(index)
                    setPendingPreview(null)
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      setActiveIndex(index)
                      setPendingPreview(null)
                    }
                  }}
                  className={`h-14 w-14 shrink-0 cursor-grab touch-none overflow-hidden rounded-md border active:cursor-grabbing ${
                    index === activeIndex ? 'border-gray-950 ring-2 ring-gray-950/10' : 'border-gray-200'
                  }`}
                  style={{
                    backgroundImage: getCardImage(card) ? `url(${getCardImage(card)})` : undefined,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                  }}
                >
                  {!getCardImage(card) ? (
                    <span className="flex h-full w-full items-center justify-center bg-gray-100 text-xs font-semibold text-gray-500">
                      {index + 1}
                    </span>
                  ) : null}
                </div>
              ))}
              <button
                type="button"
                aria-label="Add portfolio item"
                onClick={addCard}
                disabled={cards.length >= 10}
                className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md border border-dashed border-gray-300 text-gray-500 hover:border-gray-500 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Plus className="h-5 w-5" />
              </button>
            </div>
          </div>
        ) : (
          <div className="relative flex flex-col items-center overflow-visible py-2">
            <div
              ref={mobileScrollerRef}
              onScroll={handleMobileScroll}
              className="scrollbar-hide -mx-4 flex w-screen snap-x snap-mandatory gap-4 overflow-x-auto px-[9vw] pb-4 sm:mx-0 sm:w-full sm:px-14 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {cards.map((card, index) => (
                <div key={`mobile-${card.id}`} className="snap-center">
                  <FeaturedDisplayCard card={card} />
                </div>
              ))}
            </div>
            {cards.length > 1 ? (
              <>
                {canScrollBack ? (
                  <button
                    type="button"
                    aria-label="Previous portfolio item"
                    onClick={() => scrollPortfolioPage(-1)}
                    className="absolute left-1 top-1/2 z-20 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-gray-900 shadow-sm ring-1 ring-gray-200 hover:bg-white sm:flex"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                ) : null}
                {canScrollForward ? (
                  <button
                    type="button"
                    aria-label="Next portfolio item"
                    onClick={() => scrollPortfolioPage(1)}
                    className="absolute right-1 top-1/2 z-20 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-gray-900 shadow-sm ring-1 ring-gray-200 hover:bg-white sm:flex"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>
                ) : null}
              </>
            ) : null}
            {cards.length > 1 ? (
              <div className="mt-3 flex items-center justify-center gap-2 sm:hidden">
                {cards.map((card, index) => (
                  <button
                    key={card.id}
                    type="button"
                    aria-label={`Show portfolio item ${index + 1}`}
                    onClick={() => moveTo(index)}
                    className={`h-2.5 w-2.5 rounded-full transition-colors ${
                      index === activeIndex ? 'bg-gray-950' : 'bg-gray-300'
                    }`}
                  />
                ))}
              </div>
            ) : null}
          </div>
        )}
      </div>
    </section>
  )
}

function ProfilePageClient({
  initialUser,
  orgslug,
  profileUsername,
  editMode = false,
  mode,
  isSelf = false,
}: ProfilePageClientProps) {
  const router = useRouter()
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
  const [activeTab, setActiveTab] = useState<ProfileTab>('overview')

  const isOwnerMode = mode === 'owner'
  const isPublicMode = mode === 'public'
  const canManageProfile = isOwnerMode
  const effectiveEditMode = editMode && canManageProfile
  const profile = effectiveEditMode ? draft.profile : normalizeProfile(user.profile)
  const header = profile.header || {}
  const featured = profile.featured || normalizeFeatured(null)
  const achievements = profile.achievements || normalizeAchievements(null)
  const timelineEnabled = profile.timelineEnabled ?? false
  const timelinePublicVisible = profile.timelinePublicVisible !== false
  const socials = useMemo(() => header.socials ?? [], [header.socials])
  const avatarUrl = user.avatar_image
    ? getUserAvatarMediaDirectory(user.user_uuid, user.avatar_image)
    : ''
  const visibleSocials = useMemo(
    () => socials.filter((social) => social.url),
    [socials]
  )
  const publicProfileHref = getUriWithOrg(orgslug, routePaths.org.user(user.username))
  const resumeHref = getUriWithOrg(orgslug, routePaths.org.profileResume())

  const missingSocialTypes = useMemo(
    () => (Object.keys(SOCIAL_CONFIG) as SocialType[]).filter(
      (type) => !socials.some((social) => social.type === type)
    ),
    [socials]
  )

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
    updateDraftProfile((current) => ({
      ...current,
      header: {
        ...(current.header || {}),
        socials: [...(current.header?.socials || []), { type, url: '' }],
      },
    }))
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

  const handleSave = async (redirectHref = getUriWithOrg(orgslug, routePaths.org.profile())) => {
    if (!accessToken) return

    const invalidSocial = socials.find((social) => social.url && !isValidSocialUrl(social.type, social.url))
    if (invalidSocial) {
      toast.error(`Enter a valid ${SOCIAL_CONFIG[invalidSocial.type].label} link`)
      return
    }

    setIsSaving(true)
    const loadingToast = toast.loading('Saving profile')
    try {
      const payload = {
        ...user,
        first_name: draft.first_name,
        last_name: draft.last_name,
        username: user.username,
        bio: draft.bio,
        profile: draft.profile,
      }
      const res = await updateProfile(payload, user.id, accessToken)
      if (!res.success) throw new Error(res.HTTPmessage)
      setUser(res.data)
      await session?.update?.(true)
      toast.success('Profile saved', { id: loadingToast })
      router.push(redirectHref)
    } catch {
      toast.error('Could not save profile', { id: loadingToast })
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
              <div className="w-full sm:hidden">
                <ProfileHeaderAvatar
                  size={198}
                  avatarUrl={avatarUrl || getUriWithOrg(orgslug, '/empty_avatar.png')}
                  socials={visibleSocials}
                  userId={user.id}
                  firstName={effectiveEditMode ? draft.first_name : user.first_name}
                  lastName={effectiveEditMode ? draft.last_name : user.last_name}
                  showNameCutout
                  fullWidth
                  editMode={effectiveEditMode}
                  uploading={uploading === 'avatar'}
                  onAvatarChange={handleAvatarChange}
                />
              </div>
              <div className="hidden sm:block">
                <ProfileHeaderAvatar
                  size={270}
                  avatarUrl={avatarUrl || getUriWithOrg(orgslug, '/empty_avatar.png')}
                  socials={visibleSocials}
                  userId={user.id}
                  firstName={effectiveEditMode ? draft.first_name : user.first_name}
                  lastName={effectiveEditMode ? draft.last_name : user.last_name}
                  editMode={effectiveEditMode}
                  uploading={uploading === 'avatar'}
                  onAvatarChange={handleAvatarChange}
                />
              </div>
            </div>

            <div className="min-w-0 flex-1 space-y-3">
              <div className="min-w-0">
                <div className="min-w-0 flex-1">
                  {effectiveEditMode ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Input
                        value={draft.first_name}
                        onChange={(event) => setDraft((current) => ({ ...current, first_name: event.target.value }))}
                        placeholder="First name"
                      />
                      <Input
                        value={draft.last_name}
                        onChange={(event) => setDraft((current) => ({ ...current, last_name: event.target.value }))}
                        placeholder="Last name"
                      />
                    </div>
                  ) : (
                    <div>
                      <h1 className="hidden text-3xl font-semibold text-gray-950 sm:block">
                        {user.first_name} {user.last_name}
                      </h1>
                    </div>
                  )}
                </div>
              </div>

                {effectiveEditMode ? (
                  <Textarea
                    value={draft.bio}
                    onChange={(event) => setDraft((current) => ({ ...current, bio: event.target.value }))}
                    placeholder="Write a short profile"
                    className="min-h-32"
                    maxLength={400}
                  />
                ) : user.bio ? (
                  <div>
                    <p className={`max-w-2xl overflow-hidden text-base leading-7 text-gray-700 transition-[max-height] duration-300 ${
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
                  </div>
                ) : null}

                {effectiveEditMode ? (
                  <div className="space-y-3">
                    <div className="flex flex-wrap gap-2">
                      {missingSocialTypes.map((type) => {
                        const Icon = SOCIAL_CONFIG[type].icon
                        return (
                          <Button
                            key={type}
                            type="button"
                            variant="outline"
                            size="icon"
                            onClick={() => addSocial(type)}
                            className="h-9 w-9 rounded-full"
                            aria-label={`Add ${SOCIAL_CONFIG[type].label}`}
                            title={`Add ${SOCIAL_CONFIG[type].label}`}
                          >
                            <Icon className="h-4 w-4" />
                          </Button>
                        )
                      })}
                    </div>
                    <div className="space-y-2">
                      {socials.map((social) => {
                        const config = SOCIAL_CONFIG[social.type]
                        const Icon = config.icon
                        const valid = social.url ? isValidSocialUrl(social.type, social.url) : true
                        return (
                          <div
                            key={social.type}
                            className={`flex items-center gap-2 rounded-full border px-3 py-2 ${
                              valid ? 'border-gray-200' : 'border-red-300 bg-red-50'
                            }`}
                          >
                            <Icon className="h-4 w-4 text-gray-600" />
                            <Input
                              value={social.url}
                              onChange={(event) => updateSocial(social.type, event.target.value)}
                              placeholder={config.placeholder}
                              className="h-8 border-0 px-0 shadow-none focus-visible:ring-0"
                            />
                            {valid && social.url ? <Check className="h-4 w-4 text-green-600" /> : null}
                            <button
                              type="button"
                              aria-label={`Remove ${config.label}`}
                              onClick={() => removeSocial(social.type)}
                              className="rounded-full p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ) : null}
              {(canManageProfile || isPublicMode) ? (
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  {canManageProfile && (
                    effectiveEditMode ? (
                      <Button type="button" onClick={() => handleSave()} disabled={isSaving} className="bg-black text-white hover:bg-black/90">
                        <Save size={16} className="mr-2" />
                        {isSaving ? 'Saving' : 'Save'}
                      </Button>
                    ) : (
                      <Button asChild variant="outline">
                        <Link href={getUriWithOrg(orgslug, routePaths.org.profileEdit())}>
                          <Edit3 size={16} className="mr-2" />
                          Edit
                        </Link>
                      </Button>
                    )
                  )}
                    {canManageProfile && (
                      effectiveEditMode ? (
                      <Button type="button" variant="outline" onClick={() => handleSave(publicProfileHref)} disabled={isSaving}>
                        <Eye size={16} className="mr-2" />
                        Public profile
                      </Button>
                    ) : (
                      <Button asChild variant="outline">
                        <Link href={publicProfileHref}>
                          <Eye size={16} className="mr-2" />
                          Public profile
                        </Link>
                      </Button>
                    )
                  )}
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
              ) : null}
            </div>
          </div>
        </section>
        <nav className="px-4 sm:px-0" aria-label="Profile sections">
          <div className="flex items-center gap-6 overflow-x-auto border-b border-gray-200 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {PROFILE_TABS.map((tab) => {
              const Icon = tab.icon
              const selected = activeTab === tab.id
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex shrink-0 items-center gap-2 border-b-2 px-0 pb-3 text-sm font-medium transition-colors ${
                    selected
                      ? 'border-gray-950 text-gray-950'
                      : 'border-transparent text-gray-500 hover:text-gray-800'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span>{tab.label}</span>
                </button>
              )
            })}
          </div>
        </nav>
        {activeTab === 'overview' ? (
          <>
            <FeaturedCarousel
              featured={featured}
              editMode={effectiveEditMode}
              accessToken={accessToken}
              userId={user.id}
              userUuid={user.user_uuid}
              publicVisible={isPublicMode ? featured.publicVisible : true}
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
