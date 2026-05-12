'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import useSWR from 'swr'
import { ChevronLeft, ChevronRight, Filter, FolderOpen, Layers, List, MoreVertical, Pencil, Plus, Search, Share2, X } from 'lucide-react'
import { useOrg } from '@components/Contexts/OrgContext'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import ResourceCard from '@components/Resources/ResourceCard'
import ChipMultiSelect from '@components/Resources/ChipMultiSelect'
import NewUserResourceChannelModal from '@components/Resources/NewUserResourceChannelModal'
import {
  allResourcesChannelIcon,
  ResourceChannelStyleIcon,
  savedChannelIcon,
} from '@components/Resources/ResourceChannelStyle'
import ResourceShareModal from '@components/Resources/ResourceShareModal'
import GeneralWrapperStyled from '@components/Objects/StyledElements/Wrappers/GeneralWrapper'
import { Button } from '@components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@components/ui/popover'
import FeatureInfoBanner from '@components/Onboarding/FeatureInfoBanner'
import {
  getUriWithOrg,
  routePaths,
} from '@services/config/config'
import {
  getResourceChannels,
  getResources,
  getResourceTags,
  ResourceChannel,
  ResourceTag,
  UserResourceChannel,
} from '@services/resources/resources'
import { getResourceChannelThumbnailMediaDirectory } from '@services/media/media'

const CHANNEL_CARD_PEEK = 24
const SCROLL_DURATION_MS = 240

type ChannelCarouselItem = {
  id: string
  name: string
  thumbnail: string | null
  icon?: string | null
  color?: string | null
  iconColor?: string | null
  SystemIcon?: React.ComponentType<{ size?: number; className?: string }>
  active?: boolean
  onSelect: () => void
}

function easeOutQuint(progress: number) {
  return 1 - Math.pow(1 - progress, 5)
}

function ActiveFilterChip({
  label,
  onRemove,
}: {
  label: string
  onRemove: () => void
}) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
      <span className="whitespace-nowrap">{label}</span>
      <button
        type="button"
        onClick={onRemove}
        className="flex h-4 w-4 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-200 hover:text-slate-700"
        aria-label={`Remove ${label}`}
      >
        <X size={11} />
      </button>
    </span>
  )
}

function ChannelCarouselCard({
  title,
  thumbnail,
  icon,
  color,
  iconColor,
  SystemIcon,
  active,
  onClick,
}: {
  title: string
  thumbnail?: string | null
  icon?: string | null
  color?: string | null
  iconColor?: string | null
  SystemIcon?: React.ComponentType<{ size?: number; className?: string }>
  active?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group flex max-w-[180px] shrink-0 items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors ${
        active ? 'bg-gray-100 text-gray-950 ring-1 ring-gray-200' : 'hover:bg-gray-50'
      }`}
    >
      <div className="h-6 w-6 shrink-0 overflow-hidden rounded-md bg-gray-100">
        {thumbnail ? (
          <img
            src={thumbnail}
            alt={title}
            className="h-full w-full object-cover"
          />
        ) : SystemIcon ? (
          <div className="flex h-full w-full items-center justify-center bg-gray-100 text-gray-500">
            <SystemIcon size={12} />
          </div>
        ) : (
          <ResourceChannelStyleIcon
            icon={icon}
            color={color}
            iconColor={iconColor}
            size={12}
            className="h-full w-full"
          />
        )}
      </div>
      <div className={`min-w-0 truncate text-sm font-semibold ${active ? 'text-gray-950' : 'text-gray-800'}`}>
        {title}
      </div>
    </button>
  )
}

function ChannelTile({
  title,
  description,
  thumbnail,
  icon,
  color,
  iconColor,
  active,
  onClick,
}: {
  title: string
  description?: string | null
  thumbnail?: string | null
  icon?: string | null
  color?: string | null
  iconColor?: string | null
  active?: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 rounded-xl border p-3 text-left transition-colors ${active ? 'border-black bg-gray-50' : 'border-gray-200 bg-white hover:bg-gray-50'}`}
    >
      <div className="h-10 w-10 rounded-lg bg-gray-100 overflow-hidden shrink-0">
        {thumbnail ? (
          <img src={thumbnail} alt={title} className="h-full w-full object-cover" />
        ) : (
          <ResourceChannelStyleIcon
            icon={icon}
            color={color}
            iconColor={iconColor}
            size={16}
            className="h-full w-full"
          />
        )}
      </div>
      <div className="min-w-0">
        <div className="truncate font-medium text-gray-900">{title}</div>
        {description && <div className="truncate text-sm text-gray-500">{description}</div>}
      </div>
    </button>
  )
}

export default function ResourcesClient({
  orgslug,
  initialChannelUuid,
  initialUserChannelUuid,
  initialSearch,
}: {
  orgslug: string
  initialChannelUuid?: string
  initialUserChannelUuid?: string
  initialSearch?: string
}) {
  const org = useOrg() as any
  const session = useLHSession() as any
  const accessToken = session?.data?.tokens?.access_token
  const orgId = org?.id
  const orgUUID = org?.org_uuid
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [activeChannel, setActiveChannel] = useState<string>(
    initialUserChannelUuid ? 'all' : initialChannelUuid || 'all'
  )
  const [activeUserChannel, setActiveUserChannel] = useState<string>(initialUserChannelUuid || '')
  const [search, setSearch] = useState(initialSearch || '')
  const [searchExpanded, setSearchExpanded] = useState(Boolean(initialSearch))
  const [resourceTypes, setResourceTypes] = useState<string[]>([])
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [accessMode, setAccessMode] = useState('')
  const [provider, setProvider] = useState('')
  const [newChannelModalOpen, setNewChannelModalOpen] = useState(false)
  const [editingChannel, setEditingChannel] = useState<UserResourceChannel | null>(null)
  const [channelActionsOpen, setChannelActionsOpen] = useState(false)
  const [shareChannelOpen, setShareChannelOpen] = useState(false)
  const channelScrollerRef = useRef<HTMLDivElement | null>(null)
  const channelCardRefs = useRef<Array<HTMLDivElement | null>>([])
  const channelAnimationFrameRef = useRef<number | null>(null)
  const channelDragRef = useRef({
    pointerId: -1,
    dragging: false,
    startX: 0,
    startScrollLeft: 0,
  })
  const suppressChannelClickRef = useRef(false)
  const [canScrollChannelsLeft, setCanScrollChannelsLeft] = useState(false)
  const [canScrollChannelsRight, setCanScrollChannelsRight] = useState(false)

  const { data: channelData, mutate: mutateChannels } = useSWR(
    orgId ? ['resource-channels', orgId, accessToken || 'anon'] : null,
    () => getResourceChannels(orgId, accessToken)
  )

  const { data: resourceTags = [] } = useSWR(
    orgId ? ['resource-tags', orgId, accessToken || 'anon'] : null,
    () => getResourceTags(orgId, accessToken)
  )

  const resourceParams = useMemo(() => ({
    channel_uuid: activeChannel !== 'all' ? activeChannel : undefined,
    user_channel_uuid: activeUserChannel || undefined,
    query: search || undefined,
    resource_types: resourceTypes.length > 0 ? resourceTypes.join(',') : undefined,
    tags: selectedTags.length > 0
      ? resourceTags
          .filter((tag) => selectedTags.includes(tag.tag_uuid))
          .map((tag) => tag.name)
          .join(',')
      : undefined,
    access: accessMode || undefined,
    provider: provider || undefined,
  }), [activeChannel, activeUserChannel, search, resourceTypes, selectedTags, resourceTags, accessMode, provider])

  const { data: resources = [] } = useSWR(
    orgId ? ['resources', orgId, resourceParams, accessToken || 'anon'] : null,
    () => getResources(orgId, resourceParams, accessToken)
  )

  const channels = useMemo(() => channelData?.channels || [], [channelData?.channels])
  const userChannels = useMemo(() => channelData?.user_channels || [], [channelData?.user_channels])
  const activeChannelData = channels.find((channel: ResourceChannel) => channel.channel_uuid === activeChannel)
  const activeUserChannelData = userChannels.find((channel: UserResourceChannel) => channel.user_channel_uuid === activeUserChannel)

  const activeThumb = activeChannelData?.thumbnail_image && orgUUID
    ? getResourceChannelThumbnailMediaDirectory(orgUUID, activeChannelData.channel_uuid, activeChannelData.thumbnail_image)
    : null
  const activeUserChannelStyle = activeUserChannelData
    ? {
        icon: activeUserChannelData.icon,
        color: activeUserChannelData.color,
        iconColor: activeUserChannelData.icon_color,
      }
    : null

  const activeChannelName = activeUserChannelData?.name || activeChannelData?.name || 'All Resources'
  const activeChannelDescription = activeUserChannelData
    ? activeUserChannelData.description || `${activeUserChannelData.resource_count} saved resources`
    : activeChannelData
      ? activeChannelData.description || `${activeChannelData.resource_count} resources`
      : 'Browse across every accessible channel'
  const resourcesUrl = getUriWithOrg(orgslug, routePaths.org.resources())
  const activeChannelUrl = activeUserChannelData
    ? `${resourcesUrl}?user_channel=${encodeURIComponent(activeUserChannelData.user_channel_uuid)}`
    : activeChannelData
      ? `${resourcesUrl}?channel=${encodeURIComponent(activeChannelData.channel_uuid)}`
      : resourcesUrl
  const { personalChannelCarouselItems, globalChannelCarouselItems } = useMemo(() => {
    const defaultUserChannel = userChannels.find((channel: UserResourceChannel) => channel.is_default)
    const personalItems: ChannelCarouselItem[] = [
      {
        id: 'saved',
        name: 'Saved',
        thumbnail: null,
        SystemIcon: savedChannelIcon,
        active: defaultUserChannel?.user_channel_uuid === activeUserChannel,
        onSelect: () => {
          if (defaultUserChannel) {
            setActiveUserChannel(defaultUserChannel.user_channel_uuid)
            setActiveChannel('all')
          }
        },
      },
      ...userChannels
        .filter((channel: UserResourceChannel) => !channel.is_default)
        .map((channel: UserResourceChannel) => ({
          id: `user-${channel.user_channel_uuid}`,
          name: channel.name,
          thumbnail: null,
          icon: channel.icon,
          color: channel.color,
          iconColor: channel.icon_color,
          active: channel.user_channel_uuid === activeUserChannel,
          onSelect: () => {
            setActiveUserChannel(channel.user_channel_uuid)
            setActiveChannel('all')
          },
        })),
    ]
    const globalItems: ChannelCarouselItem[] = [
      {
        id: 'all',
        name: 'All Resources',
        thumbnail: null,
        SystemIcon: allResourcesChannelIcon,
        active: activeChannel === 'all' && !activeUserChannel,
        onSelect: () => {
          setActiveChannel('all')
          setActiveUserChannel('')
        },
      },
      ...channels.map((channel: ResourceChannel) => ({
        id: channel.channel_uuid,
        name: channel.name,
        thumbnail: channel.thumbnail_image && orgUUID
          ? getResourceChannelThumbnailMediaDirectory(orgUUID, channel.channel_uuid, channel.thumbnail_image)
          : null,
        active: !activeUserChannel && activeChannel === channel.channel_uuid,
        onSelect: () => {
          setActiveChannel(channel.channel_uuid)
          setActiveUserChannel('')
        },
      })),
    ]
    return {
      personalChannelCarouselItems: personalItems,
      globalChannelCarouselItems: globalItems,
    }
  }, [activeChannel, activeUserChannel, channels, orgUUID, userChannels])

  const updateChannelScrollState = useCallback(() => {
    const container = channelScrollerRef.current
    if (!container) return

    const maxScrollLeft = container.scrollWidth - container.clientWidth
    setCanScrollChannelsLeft(container.scrollLeft > 4)
    setCanScrollChannelsRight(container.scrollLeft < maxScrollLeft - 4)
  }, [])

  const animateChannelsTo = useCallback((targetScrollLeft: number) => {
    const container = channelScrollerRef.current
    if (!container) return

    if (channelAnimationFrameRef.current) {
      cancelAnimationFrame(channelAnimationFrameRef.current)
    }

    const startScrollLeft = container.scrollLeft
    const maxScrollLeft = Math.max(0, container.scrollWidth - container.clientWidth)
    const clampedTarget = Math.max(0, Math.min(targetScrollLeft, maxScrollLeft))
    const startTime = performance.now()

    const step = (now: number) => {
      const elapsed = now - startTime
      const progress = Math.min(elapsed / SCROLL_DURATION_MS, 1)
      const eased = easeOutQuint(progress)
      container.scrollLeft = startScrollLeft + (clampedTarget - startScrollLeft) * eased

      updateChannelScrollState()

      if (progress < 1) {
        channelAnimationFrameRef.current = requestAnimationFrame(step)
      } else {
        channelAnimationFrameRef.current = null
      }
    }

    channelAnimationFrameRef.current = requestAnimationFrame(step)
  }, [updateChannelScrollState])

  const scrollChannelsRight = useCallback(() => {
    const container = channelScrollerRef.current
    if (!container) return

    const maxScrollLeft = Math.max(0, container.scrollWidth - container.clientWidth)
    const viewportRight = container.scrollLeft + container.clientWidth
    const firstClippedIndex = channelCardRefs.current.findIndex((card) => {
      if (!card) return false
      const cardRight = card.offsetLeft + card.offsetWidth
      return cardRight > viewportRight + 2
    })

    if (firstClippedIndex === -1) return

    const targetCard = channelCardRefs.current[firstClippedIndex]
    if (!targetCard) return

    const targetScrollLeft = targetCard.offsetLeft - CHANNEL_CARD_PEEK
    animateChannelsTo(
      maxScrollLeft - targetScrollLeft <= CHANNEL_CARD_PEEK
        ? maxScrollLeft
        : targetScrollLeft
    )
  }, [animateChannelsTo])

  const scrollChannelsLeft = useCallback(() => {
    const container = channelScrollerRef.current
    if (!container) return

    const viewportLeft = container.scrollLeft
    let lastClippedIndex = -1

    channelCardRefs.current.forEach((card, index) => {
      if (!card) return
      if (card.offsetLeft < viewportLeft - 2) {
        lastClippedIndex = index
      }
    })

    if (lastClippedIndex === -1) return

    const targetCard = channelCardRefs.current[lastClippedIndex]
    if (!targetCard) return

    const targetScrollLeft = targetCard.offsetLeft - CHANNEL_CARD_PEEK

    animateChannelsTo(targetScrollLeft <= CHANNEL_CARD_PEEK ? 0 : targetScrollLeft)
  }, [animateChannelsTo])

  const handleChannelPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const container = channelScrollerRef.current
    if (!container) return
    if (event.button !== 0 && event.pointerType === 'mouse') return
    if (channelAnimationFrameRef.current) {
      cancelAnimationFrame(channelAnimationFrameRef.current)
      channelAnimationFrameRef.current = null
    }
    channelDragRef.current = {
      pointerId: event.pointerId,
      dragging: false,
      startX: event.clientX,
      startScrollLeft: container.scrollLeft,
    }
    container.setPointerCapture(event.pointerId)
  }, [])

  const handleChannelPointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const container = channelScrollerRef.current
    const drag = channelDragRef.current
    if (!container || drag.pointerId !== event.pointerId) return
    const deltaX = event.clientX - drag.startX
    if (!drag.dragging && Math.abs(deltaX) > 4) {
      drag.dragging = true
      suppressChannelClickRef.current = true
    }
    if (!drag.dragging) return
    event.preventDefault()
    container.scrollLeft = drag.startScrollLeft - deltaX
    updateChannelScrollState()
  }, [updateChannelScrollState])

  const handleChannelPointerEnd = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const container = channelScrollerRef.current
    if (container?.hasPointerCapture(event.pointerId)) {
      container.releasePointerCapture(event.pointerId)
    }
    channelDragRef.current.pointerId = -1
    channelDragRef.current.dragging = false
  }, [])

  const handleChannelClickCapture = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (!suppressChannelClickRef.current) return
    event.preventDefault()
    event.stopPropagation()
    suppressChannelClickRef.current = false
  }, [])

  useEffect(() => {
    updateChannelScrollState()

    const container = channelScrollerRef.current
    if (!container) return

    const handleScroll = () => updateChannelScrollState()
    container.addEventListener('scroll', handleScroll, { passive: true })

    const resizeObserver = new ResizeObserver(() => {
      updateChannelScrollState()
    })
    resizeObserver.observe(container)

    return () => {
      container.removeEventListener('scroll', handleScroll)
      resizeObserver.disconnect()
    }
  }, [globalChannelCarouselItems.length, personalChannelCarouselItems.length, updateChannelScrollState])

  useEffect(() => {
    return () => {
      if (channelAnimationFrameRef.current) {
        cancelAnimationFrame(channelAnimationFrameRef.current)
      }
    }
  }, [])

  const resourceTypeOptions = useMemo(
    () => [
      { value: 'assessment', label: 'Assessment' },
      { value: 'video', label: 'Video' },
      { value: 'article', label: 'Article' },
      { value: 'tool', label: 'Tool' },
      { value: 'guide', label: 'Guide' },
      { value: 'course', label: 'Course' },
      { value: 'other', label: 'Other' },
    ],
    []
  )
  const resourceTagOptions = useMemo(
    () =>
      resourceTags.map((tag: ResourceTag) => ({
        value: tag.tag_uuid,
        label: tag.name,
      })),
    [resourceTags]
  )
  const activeFilterChips = useMemo(() => {
    const chips: Array<{ key: string; label: string; onRemove: () => void }> = []

    if (search.trim()) {
      chips.push({
        key: `search-${search}`,
        label: `Search: ${search.trim()}`,
        onRemove: () => setSearch(''),
      })
    }

    resourceTypes.forEach((value) => {
      const option = resourceTypeOptions.find((item) => item.value === value)
      if (!option) return
      chips.push({
        key: `type-${value}`,
        label: `Type: ${option.label}`,
        onRemove: () => setResourceTypes((current) => current.filter((item) => item !== value)),
      })
    })

    selectedTags.forEach((value) => {
      const option = resourceTagOptions.find((item) => item.value === value)
      if (!option) return
      chips.push({
        key: `tag-${value}`,
        label: `Tag: ${option.label}`,
        onRemove: () => setSelectedTags((current) => current.filter((item) => item !== value)),
      })
    })

    if (accessMode) {
      chips.push({
        key: `access-${accessMode}`,
        label: `Access: ${accessMode.charAt(0).toUpperCase()}${accessMode.slice(1)}`,
        onRemove: () => setAccessMode(''),
      })
    }

    if (provider.trim()) {
      chips.push({
        key: `provider-${provider}`,
        label: `Provider: ${provider.trim()}`,
        onRemove: () => setProvider(''),
      })
    }

    return chips
  }, [search, resourceTypes, selectedTags, accessMode, provider, resourceTypeOptions, resourceTagOptions])
  const clearAllFilters = () => {
    setSearch('')
    setResourceTypes([])
    setSelectedTags([])
    setAccessMode('')
    setProvider('')
  }

  return (
    <GeneralWrapperStyled>
      <FeatureInfoBanner orgslug={orgslug} feature="resources" />

      {/* Page header */}
      <div className="flex items-center gap-2.5 my-4">
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-white nice-shadow">
          <Layers size={16} className="text-black" />
        </div>
        <h1 className="text-xl font-bold text-gray-900 tracking-tight">Resources</h1>
      </div>

      {/* Active channel */}
      <div className="relative mb-2 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-gray-100">
            {activeThumb ? (
              <img src={activeThumb} alt={activeChannelName} className="h-full w-full object-cover" />
            ) : (
              <ResourceChannelStyleIcon
                icon={activeUserChannelStyle?.icon}
                color={activeUserChannelStyle?.color}
                iconColor={activeUserChannelStyle?.iconColor}
                size={22}
                className="h-full w-full"
              />
            )}
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-xl font-semibold leading-tight text-gray-900">{activeChannelName}</h2>
            <p className="mt-1 line-clamp-1 text-sm text-gray-500">{activeChannelDescription}</p>
          </div>
        </div>
        <button
          onClick={() => setChannelActionsOpen(!channelActionsOpen)}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900"
          aria-label="Channel actions"
          title="Channel actions"
        >
          <MoreVertical size={16} />
        </button>
        {channelActionsOpen && (
          <div className="absolute right-0 top-9 z-40 w-40 rounded-xl border border-gray-200 bg-white p-1 shadow-lg">
            {activeUserChannelData && (
              <button
                onClick={() => {
                  setEditingChannel(activeUserChannelData)
                  setChannelActionsOpen(false)
                }}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-50"
              >
                <Pencil size={14} />
                Edit
              </button>
            )}
            <button
              onClick={() => {
                setShareChannelOpen(true)
                setChannelActionsOpen(false)
              }}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-50"
            >
              <Share2 size={14} />
              Share
            </button>
          </div>
        )}
      </div>

      {/* Channel browser */}
      <div className="flex min-w-0 items-center gap-2">
        <button
          onClick={() => setDrawerOpen(true)}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-gray-200 text-gray-600 transition-colors hover:bg-gray-50"
          aria-label="Browse channels"
          title="Browse channels"
        >
          <List size={15} />
        </button>
        {(personalChannelCarouselItems.length > 0 || globalChannelCarouselItems.length > 0) && (
          <>
            <div className="relative min-w-0 flex-1">
              {canScrollChannelsLeft ? (
                <button
                  type="button"
                  onClick={scrollChannelsLeft}
                  aria-label="Scroll channels left"
                  className="absolute left-0 top-1/2 z-10 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-white/95 text-gray-700 shadow ring-1 ring-black/8 transition-colors hover:bg-white"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
              ) : null}

              {canScrollChannelsRight ? (
                <button
                  type="button"
                  onClick={scrollChannelsRight}
                  aria-label="Scroll channels right"
                  className="absolute right-0 top-1/2 z-10 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-white/95 text-gray-700 shadow ring-1 ring-black/8 transition-colors hover:bg-white"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              ) : null}

              <div
                ref={channelScrollerRef}
                onPointerDown={handleChannelPointerDown}
                onPointerMove={handleChannelPointerMove}
                onPointerUp={handleChannelPointerEnd}
                onPointerCancel={handleChannelPointerEnd}
                onClickCapture={handleChannelClickCapture}
                className="cursor-grab touch-pan-y overflow-x-hidden overflow-y-visible active:cursor-grabbing"
              >
                <div className="flex snap-x snap-mandatory items-center gap-1.5 py-0.5">
                  {personalChannelCarouselItems.map((channel, index) => (
                    <div
                      key={channel.id}
                      ref={(node) => {
                        channelCardRefs.current[index] = node
                      }}
                      className="snap-start"
                    >
                      <ChannelCarouselCard
                        title={channel.name}
                        thumbnail={channel.thumbnail}
                        icon={channel.icon}
                        color={channel.color}
                        iconColor={channel.iconColor}
                        SystemIcon={channel.SystemIcon}
                        active={channel.active}
                        onClick={channel.onSelect}
                      />
                    </div>
                  ))}
                  {personalChannelCarouselItems.length > 0 && globalChannelCarouselItems.length > 0 && (
                    <div className="mx-1 h-5 w-px shrink-0 bg-gray-200" />
                  )}
                  {globalChannelCarouselItems.map((channel, index) => {
                    const refIndex = personalChannelCarouselItems.length + index
                    return (
                      <div
                        key={channel.id}
                        ref={(node) => {
                          channelCardRefs.current[refIndex] = node
                        }}
                        className="snap-start"
                      >
                        <ChannelCarouselCard
                          title={channel.name}
                          thumbnail={channel.thumbnail}
                          icon={channel.icon}
                          color={channel.color}
                          iconColor={channel.iconColor}
                          SystemIcon={channel.SystemIcon}
                          active={channel.active}
                          onClick={channel.onSelect}
                        />
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      <div className="mt-4 flex items-center gap-2 overflow-hidden rounded-2xl border border-gray-200 bg-white px-2 py-2">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="icon" className="h-10 w-10 shrink-0 rounded-xl border-gray-200">
              <Filter size={16} />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="z-[120] w-[340px] rounded-2xl border-gray-200 p-0 shadow-2xl">
            <div className="border-b border-gray-100 px-4 py-3">
              <div className="text-sm font-semibold text-gray-900">Filters</div>
              <div className="text-xs text-gray-500">Refine resources without crowding the page.</div>
            </div>
            <div className="space-y-4 px-4 py-4">
              <div className="space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">Types</div>
                <ChipMultiSelect
                  options={resourceTypeOptions}
                  selectedValues={resourceTypes}
                  onChange={setResourceTypes}
                  placeholder="All types"
                  searchPlaceholder="Filter types"
                  emptyMessage="No resource types found."
                  displayMode="summary"
                />
              </div>

              <div className="space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">Tags</div>
                <ChipMultiSelect
                  options={resourceTagOptions}
                  selectedValues={selectedTags}
                  onChange={setSelectedTags}
                  placeholder="All tags"
                  searchPlaceholder="Filter tags"
                  emptyMessage="No tags yet."
                  displayMode="summary"
                />
              </div>

              <div className="space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">Access</div>
                <select
                  value={accessMode}
                  onChange={(e) => setAccessMode(e.target.value)}
                  className="h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm"
                >
                  <option value="">All access</option>
                  <option value="free">Free</option>
                  <option value="paid">Paid</option>
                  <option value="restricted">Restricted</option>
                </select>
              </div>

              <div className="space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">Provider</div>
                <input
                  value={provider}
                  onChange={(e) => setProvider(e.target.value)}
                  className="h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-gray-400"
                  placeholder="Provider"
                />
              </div>

              {activeFilterChips.length > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={clearAllFilters}
                  className="w-full justify-center rounded-xl text-sm text-slate-600 hover:bg-slate-50"
                >
                  Clear all filters
                </Button>
              )}
            </div>
          </PopoverContent>
        </Popover>

        <div
          className={`flex shrink-0 items-center rounded-xl border border-gray-200 bg-gray-50 transition-all ${
            searchExpanded || search.trim() ? 'w-[240px] px-3' : 'w-10 justify-center'
          }`}
        >
          <button
            type="button"
            onClick={() => setSearchExpanded(true)}
            className="flex h-10 shrink-0 items-center justify-center text-gray-400"
            aria-label="Search resources"
          >
            <Search size={16} />
          </button>
          {(searchExpanded || search.trim()) && (
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onBlur={() => {
                if (!search.trim()) setSearchExpanded(false)
              }}
              className="h-10 w-full bg-transparent text-sm outline-none"
              placeholder="Search resources"
              autoFocus={searchExpanded && !search.trim()}
            />
          )}
        </div>

        <div className="min-w-0 flex-1 overflow-x-auto">
          <div className="flex min-h-10 items-center gap-2 whitespace-nowrap">
            {activeFilterChips.length > 0 ? (
              activeFilterChips.map((chip) => (
                <ActiveFilterChip key={chip.key} label={chip.label} onRemove={chip.onRemove} />
              ))
            ) : (
              <span className="text-sm text-gray-400">No active filters</span>
            )}
          </div>
        </div>
      </div>

      {/* Resources grid */}
      <div className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-1">
        {resources.map((resource) => (
          <ResourceCard key={resource.resource_uuid} resource={resource} orgslug={orgslug} orgUUID={orgUUID} />
        ))}
        {resources.length === 0 && (
          <div className="col-span-full rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-10 text-center text-gray-500">
            No resources match this view yet.
          </div>
        )}
      </div>

      {/* Channel drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div className="relative h-full w-[calc(100%-2rem)] max-w-md overflow-y-auto bg-white p-5 shadow-2xl">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-900">Channels</h2>
              <button className="rounded-lg border border-gray-200 px-3 py-2 text-sm" onClick={() => setDrawerOpen(false)}>
                Close
              </button>
            </div>

            {/* Your channels */}
            {accessToken && (
              <div className="mb-5">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">Your channels</span>
                  <button
                    onClick={() => setNewChannelModalOpen(true)}
                    className="flex h-6 w-6 items-center justify-center rounded-md bg-gray-100 hover:bg-gray-200 transition-colors"
                    title="New channel"
                  >
                    <Plus size={13} />
                  </button>
                </div>
                <div className="space-y-2">
                  {userChannels.map((channel: UserResourceChannel) => (
                    <ChannelTile
                      key={channel.user_channel_uuid}
                      title={channel.name}
                      description={`${channel.resource_count} saved`}
                      icon={channel.icon}
                      color={channel.color}
                      iconColor={channel.icon_color}
                      active={activeUserChannel === channel.user_channel_uuid}
                      onClick={() => {
                        setActiveUserChannel(channel.user_channel_uuid)
                        setActiveChannel('all')
                        setDrawerOpen(false)
                      }}
                    />
                  ))}
                  {userChannels.length === 0 && (
                    <p className="py-1 text-sm text-gray-400">No channels yet</p>
                  )}
                </div>
              </div>
            )}

            {/* All channels */}
            <div>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">All channels</div>
              <div className="space-y-2">
                <ChannelTile
                  title="All"
                  description="Browse across every accessible channel"
                  active={activeChannel === 'all' && !activeUserChannel}
                  onClick={() => {
                    setActiveChannel('all')
                    setActiveUserChannel('')
                    setDrawerOpen(false)
                  }}
                />
                {channels.map((channel: ResourceChannel) => {
                  const thumb = channel.thumbnail_image && orgUUID
                    ? getResourceChannelThumbnailMediaDirectory(orgUUID, channel.channel_uuid, channel.thumbnail_image)
                    : null
                  return (
                    <ChannelTile
                      key={channel.channel_uuid}
                      title={channel.name}
                      description={`${channel.resource_count} resources`}
                      thumbnail={thumb}
                      active={activeChannel === channel.channel_uuid}
                      onClick={() => {
                        setActiveChannel(channel.channel_uuid)
                        setActiveUserChannel('')
                        setDrawerOpen(false)
                      }}
                    />
                  )
                })}
              </div>
            </div>
          </div>
          <button className="flex-1 bg-black/25" onClick={() => setDrawerOpen(false)} aria-label="Close drawer" />
        </div>
      )}

      <NewUserResourceChannelModal
        open={newChannelModalOpen}
        onClose={() => setNewChannelModalOpen(false)}
        onCreated={async () => {
          await mutateChannels()
        }}
      />
      <NewUserResourceChannelModal
        open={Boolean(editingChannel)}
        channel={editingChannel}
        onClose={() => setEditingChannel(null)}
        onUpdated={async () => {
          await mutateChannels()
        }}
      />
      <ResourceShareModal
        open={shareChannelOpen}
        onClose={() => setShareChannelOpen(false)}
        title={activeChannelName}
        description={activeChannelDescription}
        url={activeChannelUrl}
        eyebrow="Channel"
        visual={
          <div className="h-10 w-10 overflow-hidden rounded-lg bg-gray-100">
            {activeThumb ? (
              <img src={activeThumb} alt={activeChannelName} className="h-full w-full object-cover" />
            ) : (
              <ResourceChannelStyleIcon
                icon={activeUserChannelStyle?.icon}
                color={activeUserChannelStyle?.color}
                iconColor={activeUserChannelStyle?.iconColor}
                size={18}
                className="h-full w-full"
              />
            )}
          </div>
        }
      />
    </GeneralWrapperStyled>
  )
}
