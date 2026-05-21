'use client'

import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  Camera,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Link2,
  Loader2,
  Plus,
  Save,
  X,
} from 'lucide-react'
import { toast } from 'react-hot-toast'
import { Button } from '@components/ui/button'
import { Input } from '@components/ui/input'
import { Switch } from '@components/ui/switch'
import { Textarea } from '@components/ui/textarea'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { getUserProfileFeaturedMediaDirectory } from '@services/media/media'
import { getResourceUrlPreview, ResourceUrlPreview } from '@services/resources/resources'
import { updateProfile } from '@services/settings/profile'
import { uploadUserProfileFeaturedImage } from '@services/users/users'

export type FeaturedCard = {
  id: string
  slug: string
  url: string
  title: string
  subtext: string
  body: string
  imageUrl: string
  textTone: 'dark' | 'light'
  updatedAt?: string
  includeButton?: boolean
  actionButtonText?: string
  actionUrl?: string
}

export type FeaturedSection = {
  enabled: boolean
  publicVisible: boolean
  cards: FeaturedCard[]
}

type FeaturedCarouselProps = {
  featured: FeaturedSection
  editMode: boolean
  accessToken?: string
  userId: number
  userUuid: string
  orgslug: string
  authorName: string
  updatedAtFallback?: string
  profileUsername?: string
  ownerView: boolean
  publicVisible?: boolean
  onChange(next: FeaturedSection): void
  onPublicVisibleChange?(visible: boolean): void
}

type PortfolioPostPageClientProps = {
  initialUser: any
  orgslug: string
  postSlug: string
  mode: 'owner' | 'public'
  profileUsername?: string
}

const PORTFOLIO_GRADIENTS = [
  'linear-gradient(135deg,#dbeafe 0%,#fef3c7 45%,#fce7f3 100%)',
  'linear-gradient(135deg,#dcfce7 0%,#e0f2fe 48%,#fae8ff 100%)',
  'linear-gradient(135deg,#fef9c3 0%,#fed7aa 45%,#e9d5ff 100%)',
  'linear-gradient(135deg,#ccfbf1 0%,#ede9fe 50%,#ffe4e6 100%)',
  'linear-gradient(135deg,#e0e7ff 0%,#f0fdf4 44%,#fee2e2 100%)',
]

const SHORT_DATE_FORMATTER = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
})

function slugifyPortfolioTitle(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72)
}

function getPortfolioSlug(card: any) {
  const existing = typeof card?.slug === 'string' ? card.slug.trim() : ''
  if (existing) return slugifyPortfolioTitle(existing) || existing
  const titleSlug = slugifyPortfolioTitle(card?.title || '')
  if (titleSlug) return titleSlug
  return slugifyPortfolioTitle(card?.id || '') || `post-${Date.now()}`
}

function getUniquePortfolioSlug(cards: FeaturedCard[], cardId: string, card: any) {
  const baseSlug = getPortfolioSlug(card)
  const usedSlugs = new Set(
    cards
      .filter((item) => item.id !== cardId)
      .map((item) => item.slug)
      .filter(Boolean)
  )
  if (!usedSlugs.has(baseSlug)) return baseSlug

  let index = 2
  let nextSlug = `${baseSlug}-${index}`
  while (usedSlugs.has(nextSlug)) {
    index += 1
    nextSlug = `${baseSlug}-${index}`
  }
  return nextSlug
}

function getPortfolioGradient(card?: Pick<FeaturedCard, 'id' | 'slug'>) {
  const key = `${card?.slug || ''}${card?.id || ''}`
  const sum = key.split('').reduce((total, char) => total + char.charCodeAt(0), 0)
  return PORTFOLIO_GRADIENTS[sum % PORTFOLIO_GRADIENTS.length]
}

function formatPortfolioDate(value?: string) {
  if (!value) return 'Draft'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Draft'
  return SHORT_DATE_FORMATTER.format(date)
}

export function getPortfolioAuthorName(user: any) {
  return [user?.first_name, user?.last_name].filter(Boolean).join(' ').trim() || user?.username || 'Author'
}

function normalizeUrl(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return ''
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
}

function normalizeProfileValue(profile: any) {
  if (!profile) return {}
  if (typeof profile === 'string') {
    try {
      return JSON.parse(profile)
    } catch {
      return {}
    }
  }
  return { ...profile }
}

function previewToCardUpdate(preview: ResourceUrlPreview) {
  return {
    actionUrl: preview.og_url || preview.url || '',
    title: preview.title || '',
    body: preview.description || '',
    imageUrl: preview.og_image || '',
  }
}

export function normalizeFeatured(featured: any): FeaturedSection {
  const seenSlugs = new Map<string, number>()
  return {
    enabled: Boolean(featured?.enabled),
    publicVisible: featured?.publicVisible !== false,
    cards: Array.isArray(featured?.cards)
      ? featured.cards.slice(0, 10).map((card: any) => {
        const id = card.id || `featured-${Date.now()}-${Math.random().toString(16).slice(2)}`
        const baseSlug = getPortfolioSlug({ ...card, id })
        const slugCount = seenSlugs.get(baseSlug) || 0
        seenSlugs.set(baseSlug, slugCount + 1)
        const slug = slugCount > 0 ? `${baseSlug}-${slugCount + 1}` : baseSlug
        const body = typeof card.body === 'string' ? card.body : card.subtext || ''
        const actionUrl = typeof card.actionUrl === 'string' ? card.actionUrl : card.url || ''
        return {
          id,
          slug,
          url: actionUrl,
          title: card.title || '',
          subtext: card.subtext || body,
          body,
          imageUrl: card.imageUrl || card.coverImageUrl || '',
          textTone: card.textTone === 'light' ? 'light' : 'dark',
          updatedAt: typeof card.updatedAt === 'string' ? card.updatedAt : undefined,
          includeButton: Boolean(card.includeButton),
          actionButtonText: typeof card.actionButtonText === 'string' ? card.actionButtonText : '',
          actionUrl,
        }
      })
      : [],
  }
}

function createEmptyFeaturedCard(): FeaturedCard {
  return {
    id: `featured-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    slug: `post-${Date.now().toString(36)}`,
    url: '',
    title: '',
    subtext: '',
    body: '',
    imageUrl: '',
    textTone: 'dark',
    updatedAt: new Date().toISOString(),
    includeButton: false,
    actionButtonText: '',
    actionUrl: '',
  }
}

function getCardImage(card?: FeaturedCard) {
  return card?.imageUrl || ''
}

function PortfolioPreviewImage({
  card,
  children,
}: {
  card: FeaturedCard
  children?: React.ReactNode
}) {
  const image = getCardImage(card)
  return (
    <div
      className="relative aspect-[16/10] w-full overflow-hidden rounded-lg"
      style={{ background: getPortfolioGradient(card) }}
    >
      {image ? (
        <img src={image} alt="" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]" />
      ) : null}
      {children}
    </div>
  )
}

function getPortfolioCoverClipPath(
  width: number,
  height: number,
  titleWidth: number,
  titleHeight: number
) {
  const radius = Math.min(10, width / 2, height / 2)
  if (!titleWidth || !titleHeight) {
    return `M ${radius} 0 H ${width - radius} Q ${width} 0 ${width} ${radius} V ${height - radius} Q ${width} ${height} ${width - radius} ${height} H ${radius} Q 0 ${height} 0 ${height - radius} V ${radius} Q 0 0 ${radius} 0 Z`
  }

  const insetWidth = Math.min(titleWidth, width - radius)
  const insetHeight = Math.min(titleHeight, height - radius)
  const innerRadius = Math.min(12, insetWidth / 2, insetHeight / 2)
  const insetTop = height - insetHeight

  return [
    `M ${radius} 0`,
    `H ${width - radius}`,
    `Q ${width} 0 ${width} ${radius}`,
    `V ${height - radius}`,
    `Q ${width} ${height} ${width - radius} ${height}`,
    `H ${insetWidth + innerRadius}`,
    `Q ${insetWidth} ${height} ${insetWidth} ${height - innerRadius}`,
    `V ${insetTop + innerRadius}`,
    `Q ${insetWidth} ${insetTop} ${insetWidth - innerRadius} ${insetTop}`,
    `H ${innerRadius}`,
    `Q 0 ${insetTop} 0 ${insetTop - innerRadius}`,
    `V ${radius}`,
    `Q 0 0 ${radius} 0`,
    'Z',
  ].join(' ')
}

function PortfolioCover({
  card,
  titleText,
  title,
  titleClassName = 'text-lg',
  children,
}: {
  card: FeaturedCard
  titleText: string
  title: React.ReactNode
  titleClassName?: string
  children?: React.ReactNode
}) {
  const clipId = useId()
  const safeClipId = `portfolio-cover-${clipId.replace(/[^a-zA-Z0-9_-]/g, '')}`
  const containerRef = useRef<HTMLDivElement | null>(null)
  const measureTitleRef = useRef<HTMLDivElement | null>(null)
  const [size, setSize] = useState({ width: 1, height: 1 })
  const [titleSize, setTitleSize] = useState({ width: 0, height: 0 })
  const [titleMaxWidth, setTitleMaxWidth] = useState(1)
  const image = getCardImage(card)
  const clipPath = getPortfolioCoverClipPath(size.width, size.height, titleSize.width, titleSize.height)

  useLayoutEffect(() => {
    const container = containerRef.current
    const titleNode = measureTitleRef.current
    if (!container || !titleNode) return

    const measure = () => {
      const containerRect = container.getBoundingClientRect()
      const nextWidth = Math.max(1, Math.round(containerRect.width))
      const nextHeight = Math.max(1, Math.round(containerRect.height))
      const nextMaxTitleWidth = nextWidth * (window.matchMedia('(min-width: 640px)').matches ? 0.72 : 0.82)
      titleNode.style.maxWidth = `${nextMaxTitleWidth}px`
      const titleRect = titleNode.getBoundingClientRect()
      setSize({ width: nextWidth, height: nextHeight })
      setTitleMaxWidth(nextMaxTitleWidth)
      setTitleSize({
        width: Math.min(Math.ceil(titleRect.width), nextWidth),
        height: Math.min(Math.ceil(titleRect.height), nextHeight),
      })
    }

    measure()
    const resizeObserver = new ResizeObserver(measure)
    resizeObserver.observe(container)
    resizeObserver.observe(titleNode)
    return () => resizeObserver.disconnect()
  }, [titleText])

  return (
    <div ref={containerRef} className="relative aspect-[16/10] w-full overflow-visible">
      <svg
        viewBox={`0 0 ${size.width} ${size.height}`}
        className="h-full w-full overflow-visible"
        aria-hidden="true"
      >
        <defs>
          <clipPath id={safeClipId}>
            <path d={clipPath} />
          </clipPath>
        </defs>
        <foreignObject width={size.width} height={size.height} clipPath={`url(#${safeClipId})`}>
          <div className="h-full w-full" style={{ background: getPortfolioGradient(card) }} />
        </foreignObject>
        {image ? (
          <image
            href={image}
            width={size.width}
            height={size.height}
            preserveAspectRatio="xMidYMid slice"
            clipPath={`url(#${safeClipId})`}
          />
        ) : null}
      </svg>
      <div
        ref={measureTitleRef}
        className={`pointer-events-none invisible absolute bottom-0 left-0 inline-block break-words px-3 py-2 font-black leading-none text-gray-950 ${titleClassName}`}
        style={{ maxWidth: titleMaxWidth, width: 'max-content' }}
        aria-hidden="true"
      >
        {titleText || 'Untitled post'}
      </div>
      <div
        className={`absolute bottom-0 left-0 break-words px-3 py-2 font-black leading-none text-gray-950 ${titleClassName}`}
        style={{
          width: titleSize.width || undefined,
          height: titleSize.height || undefined,
          maxWidth: titleMaxWidth,
        }}
      >
        {title}
      </div>
      {children}
    </div>
  )
}

function FeaturedDisplayCard({
  card,
  href,
  authorName,
  updatedAtFallback,
}: {
  card: FeaturedCard
  href: string
  authorName: string
  updatedAtFallback?: string
}) {
  return (
    <Link
      href={href}
      className="group block h-full w-[min(82vw,340px)] rounded-lg p-2 transition-all duration-200 hover:-translate-y-1 hover:bg-gray-50 hover:shadow-md sm:w-[320px]"
    >
      <PortfolioPreviewImage card={card} />
      <div className="px-1 pt-4">
        <h3 className="break-words text-lg font-semibold leading-snug text-gray-950">
          {card.title || 'Untitled post'}
        </h3>
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-medium uppercase tracking-wide text-gray-500">
          <span>{authorName}</span>
          <span aria-hidden="true">/</span>
          <span>Updated {formatPortfolioDate(card.updatedAt || updatedAtFallback)}</span>
        </div>
        {card.body ? (
          <p className="mt-2 line-clamp-3 text-sm leading-5 text-gray-600">
            {card.body}
          </p>
        ) : null}
      </div>
    </Link>
  )
}

export function FeaturedCarousel({
  featured,
  editMode,
  accessToken,
  userId,
  userUuid,
  orgslug,
  authorName,
  updatedAtFallback,
  profileUsername,
  ownerView,
  publicVisible = true,
  onChange,
  onPublicVisibleChange,
}: FeaturedCarouselProps) {
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
      cards: cards.map((card) => card.id === cardId ? {
        ...card,
        ...patch,
        slug: patch.title !== undefined
          ? getUniquePortfolioSlug(cards, cardId, { ...card, ...patch })
          : (patch.slug || card.slug),
        updatedAt: new Date().toISOString(),
      } : card),
    })
  }

  const addCard = () => {
    if (cards.length >= 10) {
      toast.error('Portfolio is capped at 10 posts')
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
    scroller.scrollBy({ left: direction * scroller.clientWidth * 0.9, behavior: 'smooth' })
  }

  const applyPreview = (cardId: string, preview: ResourceUrlPreview, overwrite: boolean) => {
    const update = previewToCardUpdate(preview)
    const card = cards.find((item) => item.id === cardId)
    updateCard(cardId, {
      url: normalizeUrl(update.actionUrl || linkDraft),
      actionUrl: normalizeUrl(update.actionUrl || linkDraft),
      title: overwrite || !card?.title ? update.title : card?.title || '',
      body: overwrite || !card?.body ? update.body : card?.body || '',
      subtext: overwrite || !card?.subtext ? update.body : card?.subtext || '',
      imageUrl: overwrite || !card?.imageUrl ? update.imageUrl : card?.imageUrl || '',
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
        updateCard(cardId, { url, actionUrl: url })
        setPendingPreview(preview)
      } else {
        applyPreview(cardId, preview, true)
      }
    } catch {
      updateCard(cardId, { url, actionUrl: url })
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
      const imageUrl = getUserProfileFeaturedMediaDirectory(res.data.user_uuid || userUuid, res.data.filename)
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

  const getPostHref = (card: FeaturedCard) => getUriWithOrg(
    orgslug,
    ownerView
      ? routePaths.org.profilePortfolioPost(card.slug)
      : routePaths.org.userPortfolioPost(profileUsername || '', card.slug)
  )

  return (
    <section className="mt-4 px-4 sm:px-0">
      <div className="mb-3 flex items-center justify-between gap-4">
        <h2 className="text-2xl font-semibold text-gray-950">Portfolio</h2>
        {editMode ? (
          <div className="flex flex-col items-end gap-2">
            <label className="flex items-center gap-3">
              <span className="text-sm text-gray-500">{enabled ? 'On your profile' : 'Hidden from profile'}</span>
              <Switch checked={enabled} onCheckedChange={(value) => updateFeatured({ enabled: value })} />
            </label>
            <label className="flex items-center gap-3">
              <span className="text-sm text-gray-500">{publicVisible ? 'Visible to others' : 'Hidden from others'}</span>
              <Switch checked={publicVisible} onCheckedChange={onPublicVisibleChange} disabled={!enabled} />
            </label>
          </div>
        ) : null}
      </div>

      <div className={`origin-top transition-all duration-300 ${enabled ? 'scale-100 opacity-100' : 'max-h-0 scale-95 overflow-hidden opacity-0'}`}>
        {editMode ? (
          <div className="space-y-4">
            <div className="flex min-h-[290px] items-center justify-center">
              {activeCard ? (
                <div className="relative w-[min(82vw,360px)] rounded-lg bg-white p-2 sm:w-[340px]">
                  <button
                    type="button"
                    aria-label="Delete portfolio post"
                    onClick={() => deleteCard(activeCard.id)}
                    className="absolute right-4 top-4 z-20 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-gray-700 shadow-sm ring-1 ring-gray-200 hover:text-red-600"
                  >
                    <X className="h-4 w-4" />
                  </button>
                  <PortfolioPreviewImage card={activeCard}>
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
                  </PortfolioPreviewImage>
                  <div className="space-y-3 px-1 pt-4">
                    <Input
                      value={activeCard.title}
                      onChange={(event) => updateCard(activeCard.id, { title: event.target.value })}
                      placeholder="Post title"
                      className="border-0 px-0 text-lg font-semibold text-gray-950 shadow-none focus-visible:ring-0"
                    />
                    <Textarea
                      value={activeCard.body}
                      onChange={(event) => updateCard(activeCard.id, { body: event.target.value, subtext: event.target.value })}
                      placeholder="Write the post body"
                      className="min-h-28 resize-none px-0 text-sm leading-5 text-gray-600 shadow-none focus-visible:ring-0"
                    />
                    <div className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2">
                      <Link2 className="h-4 w-4 shrink-0 text-gray-500" />
                      <Input
                        value={activeCard.actionUrl || activeCard.url}
                        onChange={(event) => {
                          setLinkDraft(event.target.value)
                          updateCard(activeCard.id, { url: event.target.value, actionUrl: event.target.value })
                        }}
                        onPaste={(event) => {
                          const pasted = event.clipboardData.getData('text')
                          setLinkDraft(pasted)
                          window.setTimeout(() => scrapeLink(activeCard.id, pasted), 0)
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') scrapeLink(activeCard.id, activeCard.actionUrl || activeCard.url || linkDraft)
                        }}
                        placeholder="Optional source link for preview details"
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
                  Add portfolio post
                </button>
              )}
            </div>

            <div
              className="scrollbar-hide flex items-center justify-center gap-2 overflow-x-auto px-2 pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              onPointerMove={(event) => {
                const fromIndex = draggingThumbIndexRef.current
                if (fromIndex === null) return
                const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-featured-thumb-index]')
                const targetIndex = Number((target as HTMLElement | null)?.dataset.featuredThumbIndex)
                if (Number.isInteger(targetIndex) && targetIndex !== fromIndex) reorderThumb(fromIndex, targetIndex)
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
                  aria-label={`Select portfolio post ${index + 1}`}
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
                aria-label="Add portfolio post"
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
              {cards.map((card) => (
                <div key={`mobile-${card.id}`} className="snap-center">
                  <FeaturedDisplayCard
                    card={card}
                    href={getPostHref(card)}
                    authorName={authorName}
                    updatedAtFallback={updatedAtFallback}
                  />
                </div>
              ))}
            </div>
            {cards.length > 1 ? (
              <>
                {canScrollBack ? (
                  <button
                    type="button"
                    aria-label="Previous portfolio post"
                    onClick={() => scrollPortfolioPage(-1)}
                    className="absolute left-1 top-1/2 z-20 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-gray-900 shadow-sm ring-1 ring-gray-200 hover:bg-white sm:flex"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                ) : null}
                {canScrollForward ? (
                  <button
                    type="button"
                    aria-label="Next portfolio post"
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
                    aria-label={`Show portfolio post ${index + 1}`}
                    onClick={() => moveTo(index)}
                    className={`h-2.5 w-2.5 rounded-full transition-colors ${index === activeIndex ? 'bg-gray-950' : 'bg-gray-300'}`}
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

export function PortfolioPostPageClient({
  initialUser,
  orgslug,
  postSlug,
  mode,
  profileUsername,
}: PortfolioPostPageClientProps) {
  const router = useRouter()
  const session = useLHSession() as any
  const accessToken = session?.data?.tokens?.access_token
  const [user, setUser] = useState(initialUser)
  const [profile, setProfile] = useState(() => {
    const normalizedProfile = normalizeProfileValue(initialUser.profile)
    return {
      ...normalizedProfile,
      featured: normalizeFeatured(normalizedProfile.featured),
    }
  })
  const [isSaving, setIsSaving] = useState(false)
  const [isUploadingImage, setIsUploadingImage] = useState(false)
  const isOwnerMode = mode === 'owner'
  const featured: FeaturedSection = profile.featured || normalizeFeatured(null)
  const [postId, setPostId] = useState(() => featured.cards.find((card: FeaturedCard) => card.slug === postSlug)?.id || '')
  const post = featured.cards.find((card: FeaturedCard) => card.id === postId) || featured.cards.find((card: FeaturedCard) => card.slug === postSlug)
  const authorName = getPortfolioAuthorName(user)
  const backHref = getUriWithOrg(
    orgslug,
    isOwnerMode ? routePaths.org.profile() : routePaths.org.user(profileUsername || user.username)
  )

  const updatePost = (patch: Partial<FeaturedCard>) => {
    if (!post) return
    setProfile((current: any) => {
      const currentFeatured = current.featured || normalizeFeatured(null)
      return {
        ...current,
        featured: {
          ...currentFeatured,
          cards: currentFeatured.cards.map((card: FeaturedCard) => card.id === post.id ? {
            ...card,
            ...patch,
            slug: patch.title !== undefined
              ? getUniquePortfolioSlug(currentFeatured.cards, card.id, { ...card, ...patch })
              : (patch.slug || card.slug),
            updatedAt: new Date().toISOString(),
          } : card),
        },
      }
    })
  }

  const handleSave = async () => {
    if (!accessToken || !post) return
    setIsSaving(true)
    const loadingToast = toast.loading('Saving portfolio post')
    try {
      const res = await updateProfile({ ...user, profile }, user.id, accessToken)
      if (!res.success) throw new Error(res.HTTPmessage)
      const savedProfile = normalizeProfileValue(res.data.profile)
      const nextProfile = {
        ...savedProfile,
        featured: normalizeFeatured(savedProfile.featured),
      }
      const savedPost = nextProfile.featured?.cards.find((card: FeaturedCard) => card.id === post.id)
      setUser(res.data)
      setProfile(nextProfile)
      if (savedPost) setPostId(savedPost.id)
      await session?.update?.(true)
      toast.success('Portfolio post saved', { id: loadingToast })
      if (savedPost && savedPost.slug !== postSlug) {
        router.replace(getUriWithOrg(orgslug, routePaths.org.profilePortfolioPost(savedPost.slug)))
      }
    } catch {
      toast.error('Could not save portfolio post', { id: loadingToast })
    } finally {
      setIsSaving(false)
    }
  }

  const handleCoverUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file || !accessToken || !post) return
    setIsUploadingImage(true)
    try {
      const res = await uploadUserProfileFeaturedImage(user.id, file, accessToken)
      if (!res.success) throw new Error(res.HTTPmessage)
      const imageUrl = getUserProfileFeaturedMediaDirectory(res.data.user_uuid || user.user_uuid, res.data.filename)
      updatePost({ imageUrl })
      toast.success('Cover uploaded')
    } catch {
      toast.error('Could not upload cover')
    } finally {
      setIsUploadingImage(false)
      event.target.value = ''
    }
  }

  if (!post || (!isOwnerMode && (!featured.enabled || featured.publicVisible === false))) {
    return (
      <main className="min-h-screen">
        <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
          <Button asChild variant="ghost" className="mb-6 px-0">
            <Link href={backHref}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to profile
            </Link>
          </Button>
          <div className="rounded-lg border border-gray-200 bg-white p-6">
            <h1 className="text-2xl font-semibold text-gray-950">Portfolio post not found</h1>
            <p className="mt-2 text-gray-600">This post is unavailable or has been hidden.</p>
          </div>
        </div>
      </main>
    )
  }

  const actionUrl = normalizeUrl(post.actionUrl || post.url)

  return (
    <main className="min-h-screen">
      <article className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-5 flex items-center justify-between gap-4">
          <Button asChild variant="ghost" className="px-0">
            <Link href={backHref}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to profile
            </Link>
          </Button>
          {isOwnerMode ? (
            <Button type="button" onClick={handleSave} disabled={isSaving} className="bg-black text-white hover:bg-black/90">
              <Save className="mr-2 h-4 w-4" />
              {isSaving ? 'Saving' : 'Save'}
            </Button>
          ) : null}
        </div>

        <PortfolioCover
          card={post}
          titleText={post.title || 'Untitled post'}
          title={isOwnerMode ? (
            <textarea
              value={post.title}
              onChange={(event) => updatePost({ title: event.target.value })}
              placeholder="Post title"
              rows={1}
              className="block h-full w-full resize-none overflow-hidden border-0 bg-transparent p-0 text-3xl font-black leading-none text-gray-950 outline-none"
            />
          ) : (
            <h1 className="break-words text-3xl font-black leading-none text-gray-950">
              {post.title || 'Untitled post'}
            </h1>
          )}
          titleClassName="text-3xl px-4 py-3"
        >
          {isOwnerMode ? (
            <>
              <input
                id={`portfolio-cover-upload-${post.id}`}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="hidden"
                onChange={handleCoverUpload}
              />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => document.getElementById(`portfolio-cover-upload-${post.id}`)?.click()}
                disabled={isUploadingImage}
                className="absolute bottom-3 right-3 h-8 bg-white/90 px-2 text-xs text-gray-900 hover:bg-white"
              >
                {isUploadingImage ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
              </Button>
            </>
          ) : null}
        </PortfolioCover>

        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-500">
          <span className="font-medium text-gray-800">{authorName}</span>
          <span aria-hidden="true">/</span>
          <span>Last updated {formatPortfolioDate(post.updatedAt || user.update_date)}</span>
        </div>

        <div className="mt-8">
          {isOwnerMode ? (
            <Textarea
              value={post.body}
              onChange={(event) => updatePost({ body: event.target.value, subtext: event.target.value })}
              placeholder="Write the post body"
              className="min-h-[320px] resize-y text-base leading-7 text-gray-800"
            />
          ) : (
            <div className="whitespace-pre-wrap text-base leading-7 text-gray-800">
              {post.body || 'No post body yet.'}
            </div>
          )}
        </div>

        <div className="mt-10 border-t border-gray-200 pt-6">
          {isOwnerMode ? (
            <div className="space-y-4">
              <label className="flex items-center justify-center gap-3">
                <span className="text-sm font-medium text-gray-600">{post.includeButton ? 'Button included' : 'Include button'}</span>
                <Switch checked={Boolean(post.includeButton)} onCheckedChange={(checked) => updatePost({ includeButton: checked })} />
              </label>
              {post.includeButton ? (
                <div className="mx-auto max-w-md space-y-3">
                  <div className="rounded-full border border-gray-200 bg-white px-5 py-2 shadow-sm">
                    <Input
                      value={post.actionButtonText || ''}
                      onChange={(event) => updatePost({ actionButtonText: event.target.value })}
                      placeholder="Button label"
                      className="h-8 border-0 bg-transparent px-0 text-center font-medium shadow-none focus-visible:ring-0"
                    />
                  </div>
                  <div className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2">
                    <Link2 className="h-4 w-4 shrink-0 text-gray-500" />
                    <Input
                      value={post.actionUrl || post.url}
                      onChange={(event) => updatePost({ actionUrl: event.target.value, url: event.target.value })}
                      placeholder="https://example.com"
                      className="h-8 border-0 px-0 shadow-none focus-visible:ring-0"
                    />
                  </div>
                </div>
              ) : null}
            </div>
          ) : post.includeButton && actionUrl ? (
            <div className="flex justify-center">
              <Button asChild className="rounded-full bg-black px-5 text-white hover:bg-black/90">
                <a href={actionUrl} target="_blank" rel="noopener noreferrer">
                  {post.actionButtonText || 'Open link'}
                  <ExternalLink className="ml-2 h-4 w-4" />
                </a>
              </Button>
            </div>
          ) : null}
        </div>
      </article>
    </main>
  )
}
