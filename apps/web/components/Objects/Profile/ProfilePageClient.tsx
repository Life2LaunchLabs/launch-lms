'use client'

import React, { useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Edit3,
  Eye,
  FileText,
  Globe,
  ImageIcon,
  Instagram,
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
import UserAvatar from '@components/Objects/UserAvatar'
import { normalizeAchievements, ProfileAchievementsSection } from '@components/Objects/Profile/ProfileAchievements'
import { normalizeTimeline, ProfileTimelineSummary } from '@components/Objects/Profile/ProfileTimeline'
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

function getCardImage(card?: FeaturedCard) {
  return card?.imageUrl || ''
}

function getDisplayUrl(value: string) {
  try {
    const url = new URL(normalizeUrl(value))
    return `${url.hostname}${url.pathname === '/' ? '' : url.pathname}`.replace(/\/$/, '')
  } catch {
    return value
  }
}

function getToneClasses(tone: FeaturedCard['textTone']) {
  if (tone === 'light') {
    return {
      title: 'text-white placeholder:text-white/55',
      body: 'text-white/90 placeholder:text-white/55',
      link: 'text-white hover:text-white',
      muted: 'text-white/75',
      line: 'border-white/25',
      panel: 'bg-black/12',
      control: 'bg-black/20 text-white placeholder:text-white/55',
      topGradient: 'from-black/80',
      bottomGradient: 'from-black/80',
    }
  }

  return {
    title: 'text-gray-950 placeholder:text-gray-500',
    body: 'text-gray-800 placeholder:text-gray-500',
    link: 'text-gray-950 hover:text-gray-950',
    muted: 'text-gray-700',
    line: 'border-gray-950/15',
    panel: 'bg-white/12',
    control: 'bg-white/20 text-gray-950 placeholder:text-gray-500',
    topGradient: 'from-white/85',
    bottomGradient: 'from-white/95',
  }
}

function FeaturedDisplayCard({
  card,
  active,
}: {
  card: FeaturedCard
  active: boolean
}) {
  const image = getCardImage(card)
  const tone = getToneClasses(card.textTone)

  return (
    <div
      className={`relative flex h-[270px] w-[min(82vw,360px)] flex-col overflow-hidden rounded-[28px] border bg-white p-1 transition-all duration-300 sm:h-[285px] sm:w-[380px] ${
        active ? 'border-[3px] border-gray-950' : 'border border-gray-200'
      }`}
    >
      {image ? (
        <img src={image} alt="" className="absolute inset-1 h-[calc(100%-8px)] w-[calc(100%-8px)] rounded-[24px] object-cover" />
      ) : (
        <div className="absolute inset-1 rounded-[24px] bg-[linear-gradient(135deg,#eef2ff,#f8fafc,#dcfce7)]" />
      )}
      <div className={`absolute inset-x-1 top-1 h-32 rounded-t-[24px] bg-gradient-to-b ${tone.topGradient} to-transparent`} />
      <div className={`absolute inset-x-1 bottom-1 h-32 rounded-b-[24px] bg-gradient-to-t ${tone.bottomGradient} to-transparent`} />
      <div className="relative flex min-h-0 flex-1 flex-col p-5">
        <div className="space-y-2">
          <h3 className={`text-2xl font-black leading-none ${tone.title}`}>
            {card.title || 'Featured link'}
          </h3>
          {card.subtext ? (
            <p className={`text-lg leading-7 ${tone.body}`}>{card.subtext}</p>
          ) : null}
        </div>
        <div className={`mt-auto border-t pt-3 ${tone.line}`}>
          <a
            href={normalizeUrl(card.url)}
            target="_blank"
            rel="noopener noreferrer"
            className={`flex items-center gap-2 text-base font-semibold hover:underline ${tone.link}`}
          >
            <Link2 className="h-4 w-4" />
            <span className="truncate">{getDisplayUrl(card.url)}</span>
          </a>
        </div>
      </div>
    </div>
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
  const [linkModeCardId, setLinkModeCardId] = useState<string | null>(null)
  const [linkDraft, setLinkDraft] = useState('')
  const [isScraping, setIsScraping] = useState(false)
  const [isUploadingImage, setIsUploadingImage] = useState(false)
  const [pendingPreview, setPendingPreview] = useState<ResourceUrlPreview | null>(null)
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
      toast.error('Featured carousel is capped at 10 cards')
      return
    }
    const nextCard = createEmptyFeaturedCard()
    updateFeatured({ enabled: true, cards: [...cards, nextCard] })
    setActiveIndex(cards.length)
    setLinkModeCardId(nextCard.id)
    setLinkDraft('')
    setPendingPreview(null)
  }

  const deleteCard = (cardId: string) => {
    const nextCards = cards.filter((card) => card.id !== cardId)
    updateFeatured({ cards: nextCards })
    setActiveIndex((current) => Math.max(0, Math.min(current, nextCards.length - 1)))
    if (linkModeCardId === cardId) setLinkModeCardId(null)
  }

  const moveTo = (index: number) => {
    if (!cards.length) return
    const next = (index + cards.length) % cards.length
    setActiveIndex(next)
    setLinkModeCardId(null)
    setPendingPreview(null)
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
    setLinkModeCardId(null)
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
      toast.success('Featured image uploaded')
    } catch {
      toast.error('Could not upload featured image')
    } finally {
      setIsUploadingImage(false)
      event.target.value = ''
    }
  }

  const handleMobileScroll = () => {
    const scroller = mobileScrollerRef.current
    if (!scroller || cards.length === 0) return
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

  if (!editMode && (!enabled || !publicVisible || cards.length === 0)) return null

  return (
    <section className="mt-4 px-4 sm:px-0">
      <div className="mb-3 flex items-center justify-between gap-4">
        <h2 className="text-2xl font-semibold text-gray-950">Featured</h2>
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
                <div className="relative">
                  {linkModeCardId !== activeCard.id ? (
                    <button
                      type="button"
                      aria-label="Delete featured card"
                      onClick={() => deleteCard(activeCard.id)}
                      className="absolute right-3 top-3 z-20 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-gray-700 shadow-sm hover:text-red-600"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  ) : null}

                  {linkModeCardId === activeCard.id ? (
                    <div className="relative flex h-[270px] w-[min(82vw,360px)] flex-col justify-center overflow-hidden rounded-[28px] border border-gray-200 bg-white p-5 shadow-lg sm:h-[285px] sm:w-[380px]">
                      {activeCard.url && (
                        <button
                          type="button"
                          aria-label="Back to details"
                          onClick={() => {
                            setLinkModeCardId(null)
                            setPendingPreview(null)
                          }}
                          className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 text-gray-700"
                        >
                          <ArrowLeft className="h-4 w-4" />
                        </button>
                      )}
                      <div className="space-y-4">
                        <div>
                          <h3 className="text-2xl font-semibold text-gray-950">Add a featured link</h3>
                          <p className="mt-2 text-sm text-gray-500">Paste a link and I will try to pull in its title, text, and image.</p>
                        </div>
                        <Input
                          value={linkDraft}
                          onChange={(event) => setLinkDraft(event.target.value)}
                          onPaste={(event) => {
                            const pasted = event.clipboardData.getData('text')
                            setLinkDraft(pasted)
                            window.setTimeout(() => scrapeLink(activeCard.id, pasted), 0)
                          }}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') scrapeLink(activeCard.id, linkDraft)
                          }}
                          placeholder="https://example.com"
                          className="h-12"
                        />
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
                    <div className="relative flex h-[270px] w-[min(82vw,360px)] flex-col overflow-hidden rounded-[28px] border-[3px] border-gray-950 bg-white p-1 sm:h-[285px] sm:w-[380px]">
                      {activeCard.imageUrl ? (
                        <img src={activeCard.imageUrl} alt="" className="absolute inset-1 h-[calc(100%-8px)] w-[calc(100%-8px)] rounded-[24px] object-cover" />
                      ) : (
                        <div className="absolute inset-1 rounded-[24px] bg-[linear-gradient(135deg,#eef2ff,#f8fafc,#dcfce7)]" />
                      )}
                      {(() => {
                        const tone = getToneClasses(activeCard.textTone)
                        return (
                      <>
                      <div className={`absolute inset-x-1 top-1 h-32 rounded-t-[24px] bg-gradient-to-b ${tone.topGradient} to-transparent`} />
                      <div className={`absolute inset-x-1 bottom-1 h-32 rounded-b-[24px] bg-gradient-to-t ${tone.bottomGradient} to-transparent`} />
                      <div className="relative flex min-h-0 flex-1 flex-col p-5 pt-12">
                        <div className="absolute left-7 top-5 z-10 flex items-center gap-2 rounded-full bg-white/75 px-2 py-1 text-xs text-gray-700 backdrop-blur-sm">
                          <span>Text</span>
                          <button
                            type="button"
                            onClick={() => updateCard(activeCard.id, { textTone: 'dark' })}
                            className={`rounded-full px-2 py-0.5 ${activeCard.textTone === 'dark' ? 'bg-gray-950 text-white' : 'text-gray-600'}`}
                          >
                            Dark
                          </button>
                          <button
                            type="button"
                            onClick={() => updateCard(activeCard.id, { textTone: 'light' })}
                            className={`rounded-full px-2 py-0.5 ${activeCard.textTone === 'light' ? 'bg-gray-950 text-white' : 'text-gray-600'}`}
                          >
                            Light
                          </button>
                        </div>
                        <div className="space-y-3">
                          <Input
                            value={activeCard.title}
                            onChange={(event) => updateCard(activeCard.id, { title: event.target.value })}
                            placeholder="Title"
                            className={`border-0 bg-transparent px-0 text-2xl font-black shadow-none focus-visible:ring-0 ${tone.title}`}
                          />
                          <Textarea
                            value={activeCard.subtext}
                            onChange={(event) => updateCard(activeCard.id, { subtext: event.target.value })}
                            placeholder="Subtext"
                            className={`min-h-14 resize-none border-0 bg-transparent px-0 text-base shadow-none focus-visible:ring-0 ${tone.body}`}
                          />
                          <div className={`flex items-center gap-2 rounded-lg px-3 py-2 backdrop-blur-sm ${tone.panel}`}>
                            <ImageIcon className={`h-4 w-4 ${tone.muted}`} />
                            <Input
                              value={activeCard.imageUrl}
                              onChange={(event) => updateCard(activeCard.id, { imageUrl: event.target.value })}
                              placeholder="Background image URL"
                              className={`h-8 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0 ${tone.body}`}
                            />
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
                              className="h-8 bg-white/80 px-2 text-xs text-gray-900 hover:bg-white"
                            >
                              {isUploadingImage ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
                            </Button>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setLinkDraft(activeCard.url)
                            setLinkModeCardId(activeCard.id)
                          }}
                          className={`relative mt-auto flex items-center gap-2 border-t pt-3 text-left text-base font-semibold hover:underline ${tone.line} ${tone.link}`}
                        >
                          <Link2 className="h-4 w-4" />
                          <span className="truncate">{activeCard.url ? getDisplayUrl(activeCard.url) : 'Add link'}</span>
                        </button>
                      </div>
                      </>
                        )
                      })()}
                    </div>
                  )}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={addCard}
                  className="flex h-[200px] w-[min(82vw,360px)] flex-col items-center justify-center rounded-[28px] border border-dashed border-gray-300 text-gray-500 hover:border-gray-500 hover:text-gray-900"
                >
                  <Plus className="mb-2 h-6 w-6" />
                  Add featured card
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
                  aria-label={`Select featured card ${index + 1}`}
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
                    setLinkModeCardId(null)
                    setPendingPreview(null)
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      setActiveIndex(index)
                      setLinkModeCardId(null)
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
                aria-label="Add featured card"
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
              className="scrollbar-hide -mx-4 flex w-screen snap-x snap-mandatory gap-4 overflow-x-auto px-[9vw] pb-4 sm:mx-0 sm:hidden [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {cards.map((card, index) => (
                <div key={`mobile-${card.id}`} className="snap-center">
                  <FeaturedDisplayCard card={card} active={index === activeIndex} />
                </div>
              ))}
            </div>

            <div className="relative hidden h-[290px] w-full items-center justify-center sm:flex sm:h-[305px]">
              {cards.map((card, index) => {
                const offset = index - activeIndex
                if (Math.abs(offset) > 2) return null
                const active = offset === 0
                return (
                  <div
                    key={`desktop-${card.id}`}
                    className="absolute hidden transition-all duration-300 sm:block"
                    style={{
                      transform: active
                        ? 'translateX(0) scale(1)'
                        : `translateX(${offset * 76}px) scale(${1 - Math.abs(offset) * 0.08})`,
                      opacity: active ? 1 : 0.42 - Math.abs(offset) * 0.1,
                      zIndex: 10 - Math.abs(offset),
                    }}
                  >
                    <FeaturedDisplayCard card={card} active={active} />
                  </div>
                )
              })}
              {cards.length > 1 ? (
                <>
                  <button
                    type="button"
                    aria-label="Previous featured card"
                    onClick={() => moveTo(activeIndex - 1)}
                    className="absolute left-1/2 z-30 hidden h-11 w-11 -translate-x-[250px] items-center justify-center rounded-full bg-white/90 text-gray-900 shadow-md hover:bg-white sm:flex"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <button
                    type="button"
                    aria-label="Next featured card"
                    onClick={() => moveTo(activeIndex + 1)}
                    className="absolute right-1/2 z-30 hidden h-11 w-11 translate-x-[250px] items-center justify-center rounded-full bg-white/90 text-gray-900 shadow-md hover:bg-white sm:flex"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>
                </>
              ) : null}
            </div>
            {cards.length > 1 ? (
              <div className="mt-3 flex items-center justify-center gap-2">
                {cards.map((card, index) => (
                  <button
                    key={card.id}
                    type="button"
                    aria-label={`Show featured card ${index + 1}`}
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

  const isOwnerMode = mode === 'owner'
  const isPublicMode = mode === 'public'
  const canManageProfile = isOwnerMode
  const effectiveEditMode = editMode && canManageProfile
  const profile = effectiveEditMode ? draft.profile : normalizeProfile(user.profile)
  const header = profile.header || {}
  const featured = profile.featured || normalizeFeatured(null)
  const achievements = profile.achievements || normalizeAchievements(null)
  const timeline = profile.timeline || []
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
            <div className="relative shrink-0">
              <div className="sm:hidden">
                <UserAvatar
                  width={112}
                  rounded="rounded-full"
                  avatar_url={avatarUrl}
                  predefined_avatar={avatarUrl ? undefined : 'empty'}
                  userId={String(user.id)}
                  shadow="shadow-none"
                />
              </div>
              <div className="hidden sm:block">
                <UserAvatar
                  width={168}
                  rounded="rounded-full"
                  avatar_url={avatarUrl}
                  predefined_avatar={avatarUrl ? undefined : 'empty'}
                  userId={String(user.id)}
                  shadow="shadow-none"
                />
              </div>
              {effectiveEditMode && (
                <>
                  <input
                    id="profile-avatar-upload"
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    className="hidden"
                    onChange={handleAvatarChange}
                  />
                  <button
                    type="button"
                    aria-label="Upload profile photo"
                    onClick={() => document.getElementById('profile-avatar-upload')?.click()}
                    className="absolute bottom-0 right-0 flex h-9 w-9 items-center justify-center rounded-full bg-black text-white shadow-md sm:h-10 sm:w-10"
                    disabled={uploading === 'avatar'}
                  >
                    <Camera size={18} />
                  </button>
                </>
              )}
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
                      <div className="sm:col-span-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600">
                        @{user.username}
                      </div>
                    </div>
                  ) : (
                    <div>
                      <h1 className="text-3xl font-semibold text-gray-950">
                        {user.first_name} {user.last_name}
                      </h1>
                      <p className="mt-1 text-sm text-gray-500">@{user.username}</p>
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
                ) : visibleSocials.length > 0 ? (
                  <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
                    <div className="flex w-max max-w-none items-center gap-2">
                    {visibleSocials.map((social) => {
                      const config = SOCIAL_CONFIG[social.type]
                      const Icon = config.icon
                      return (
                        <a
                          key={social.type}
                          href={getSocialHref(social)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-gray-200 bg-transparent text-gray-600 transition-colors hover:border-gray-300 hover:text-gray-950"
                          aria-label={config.label}
                          title={config.label}
                        >
                          <Icon className="h-4 w-4" />
                        </a>
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
        <ProfileTimelineSummary
          timeline={timeline}
          orgslug={orgslug}
          profileUsername={profileUsername}
          editMode={effectiveEditMode}
          canEdit={canManageProfile}
          enabled={timelineEnabled}
          publicVisible={isPublicMode ? timelinePublicVisible : true}
          onEnabledChange={(value) => updateDraftProfile((current) => ({ ...current, timelineEnabled: value }))}
          onPublicVisibleChange={updateTimelinePublicVisible}
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
