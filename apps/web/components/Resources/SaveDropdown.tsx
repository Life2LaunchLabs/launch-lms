'use client'

import { Dispatch, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Bookmark, Check, Loader2, MoreVertical, Plus, Share2, X } from 'lucide-react'
import useSWR from 'swr'
import { useOrg } from '@components/Contexts/OrgContext'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import {
  getResourceChannels,
  saveResource,
  unsaveResource,
  UserResourceChannel,
} from '@services/resources/resources'
import { toast } from 'react-hot-toast'
import NewUserResourceChannelModal from '@components/Resources/NewUserResourceChannelModal'
import { getChannelIcon } from '@components/Resources/ResourceChannelStyle'
import ResourceShareModal from '@components/Resources/ResourceShareModal'

interface SaveDropdownProps {
  resourceUuid: string
  isSaved: boolean
  saveCount?: number
  /** UUIDs of user channels this resource is currently saved to (from resource.user_channel_uuids) */
  savedUserChannelUuids: string[]
  onSaveChange: Dispatch<boolean>
  onMembershipChange?: Dispatch<string[]>
  variant?: 'card' | 'detail' | 'chips' | 'menu'
  share?: {
    title: string
    description?: string | null
    url: string
  }
}

function requireSuccess(result: any, fallbackMessage: string) {
  if (!result?.success) {
    throw new Error(result?.data?.detail || result?.data?.message || fallbackMessage)
  }
}

export default function SaveDropdown({
  resourceUuid,
  isSaved,
  saveCount,
  savedUserChannelUuids,
  onSaveChange,
  onMembershipChange,
  variant = 'card',
  share,
}: SaveDropdownProps) {
  const org = useOrg() as any
  const session = useLHSession() as any
  const accessToken = session?.data?.tokens?.access_token
  const orgId = org?.id

  const [open, setOpen] = useState(false)
  const [newChannelModalOpen, setNewChannelModalOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [savingSave, setSavingSave] = useState(false)
  const [pendingChannelUuid, setPendingChannelUuid] = useState<string | null>(null)
  const [confirmedChannelUuid, setConfirmedChannelUuid] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)
  const [pos, setPos] = useState<{ top: number; right: number }>({ top: 0, right: 0 })
  // local set of active user channel UUIDs — seeded from prop, updated optimistically
  const [activeUuids, setActiveUuids] = useState<Set<string>>(
    () => new Set(savedUserChannelUuids)
  )
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => setMounted(true), [])

  // re-sync if parent refetches
  useEffect(() => {
    setActiveUuids(new Set(savedUserChannelUuids))
  }, [savedUserChannelUuids])

  const { data: channelData, mutate } = useSWR(
    orgId && accessToken ? ['resource-channels', orgId, accessToken] : null,
    () => getResourceChannels(orgId, accessToken)
  )

  // user-created channels only (exclude the default "Saved" channel)
  const userChannels: UserResourceChannel[] = (channelData?.user_channels ?? []).filter(
    (c: UserResourceChannel) => !c.is_default
  )

  useEffect(() => {
    if (!open) return
    const handleOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current?.contains(e.target as Node) ||
        menuButtonRef.current?.contains(e.target as Node)
      ) return
      setOpen(false)
    }
    const handleScroll = () => setOpen(false)
    document.addEventListener('mousedown', handleOutside)
    document.addEventListener('scroll', handleScroll, true)
    return () => {
      document.removeEventListener('mousedown', handleOutside)
      document.removeEventListener('scroll', handleScroll, true)
    }
  }, [open])

  const openDropdown = () => {
    const rect = menuButtonRef.current?.getBoundingClientRect()
    if (!rect) return
    setPos({ top: rect.bottom + 6, right: window.innerWidth - rect.right })
    setOpen(true)
  }

  const handleSaveToggle = async () => {
    if (!accessToken) return
    setSavingSave(true)
    try {
      if (isSaved) {
        const result = await unsaveResource(resourceUuid, accessToken)
        requireSuccess(result, 'Failed to remove save')
        onSaveChange(false)
        setActiveUuids(new Set())
        onMembershipChange?.([])
      } else {
        const result = await saveResource(resourceUuid, { add_to_default_channel: false }, accessToken)
        requireSuccess(result, 'Failed to save resource')
        onSaveChange(true)
      }
    } catch {
      toast.error(isSaved ? 'Failed to remove save' : 'Failed to save resource')
    } finally {
      setSavingSave(false)
    }
  }

  // Send the full updated channel list each time (backend replaces, not appends)
  const handleToggleChannel = async (e: React.MouseEvent, channelUuid: string, isActive: boolean) => {
    e.stopPropagation()
    if (!accessToken || pendingChannelUuid) return
    const next = new Set(activeUuids)
    if (isActive) {
      next.delete(channelUuid)
    } else {
      next.add(channelUuid)
    }
    setPendingChannelUuid(channelUuid)
    try {
      const result = await saveResource(resourceUuid, {
        add_to_default_channel: false,
        user_channel_uuids: [...next],
      }, accessToken)
      requireSuccess(result, isActive ? 'Failed to remove from channel' : 'Failed to add to channel')
      if (!isSaved) onSaveChange(true)
      setActiveUuids(next)
      onMembershipChange?.([...next])
      if (!isActive) {
        setConfirmedChannelUuid(channelUuid)
        window.setTimeout(() => {
          setConfirmedChannelUuid((current) => current === channelUuid ? null : current)
        }, 900)
      }
    } catch {
      toast.error(isActive ? 'Failed to remove from channel' : 'Failed to add to channel')
    } finally {
      setPendingChannelUuid(null)
    }
  }

  const handleChannelCreated = async (created: UserResourceChannel) => {
    if (!accessToken) return
    const next = new Set(activeUuids)
    next.add(created.user_channel_uuid)
    const saveResult = await saveResource(resourceUuid, {
      add_to_default_channel: false,
      user_channel_uuids: [...next],
    }, accessToken)
    requireSuccess(saveResult, 'Failed to add to channel')
    if (!isSaved) onSaveChange(true)
    setActiveUuids(next)
    onMembershipChange?.([...next])
    setConfirmedChannelUuid(created.user_channel_uuid)
    window.setTimeout(() => {
      setConfirmedChannelUuid((current) => current === created.user_channel_uuid ? null : current)
    }, 900)
    setOpen(true)
    mutate()
  }

  if (!accessToken) return null

  const isCard = variant === 'card'
  const isChips = variant === 'chips'
  const isMenu = variant === 'menu'

  const saveButtonClass = isCard
    ? `rounded-full p-2 transition-colors ${
          isSaved
            ? 'bg-gray-950 text-white'
            : 'bg-muted text-muted-foreground hover:bg-muted hover:text-foreground'
        }`
    : `ml-auto flex items-center gap-1.5 rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors ${
          isSaved
            ? 'border-black bg-black text-white'
            : 'border-border text-muted-foreground hover:border-gray-400'
        }`

  const menuButtonClass = isChips
    ? `flex h-7 w-7 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:border-foreground/30 hover:bg-muted hover:text-foreground ${open ? 'bg-muted text-foreground' : ''}`
    : isMenu
    ? `flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors ${open ? 'bg-muted text-foreground' : 'hover:bg-muted hover:text-foreground'}`
    : isCard
    ? `rounded-full p-2 transition-colors ${
        open
          ? 'bg-gray-950 text-white'
          : isSaved
            ? 'bg-muted text-muted-foreground'
            : 'bg-muted text-muted-foreground hover:bg-muted hover:text-foreground'
      }`
    : `flex h-10 w-10 items-center justify-center rounded-xl border border-transparent text-muted-foreground transition-colors ${
        open ? 'bg-muted text-foreground' : 'hover:border-border hover:bg-muted'
      }`

  const dropdown = (
    <div
      ref={dropdownRef}
      className="fixed z-[var(--z-modal-content)] w-60 rounded-xl border border-border bg-card py-1.5 shadow-lg"
      style={{ top: pos.top, right: pos.right }}
    >
      {isMenu && (
        <>
          {share && (
            <button
              onClick={() => {
                setOpen(false)
                setShareOpen(true)
              }}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <Share2 size={14} className="shrink-0" />
              <span className="flex-1 truncate text-left">Share</span>
            </button>
          )}
          <button
            onClick={() => {
              setOpen(false)
              void handleSaveToggle()
            }}
            disabled={savingSave}
            className={`flex w-full items-center gap-2.5 px-3 py-2 text-sm transition-colors hover:bg-muted disabled:cursor-wait ${isSaved ? 'text-destructive' : 'text-muted-foreground hover:text-foreground'}`}
          >
            {savingSave ? <Loader2 size={14} className="shrink-0 animate-spin" /> : <Bookmark size={14} className={`shrink-0 ${isSaved ? 'fill-current' : ''}`} />}
            <span className="flex-1 truncate text-left">{isSaved ? 'Remove from Library' : 'Add to Library'}</span>
          </button>
          <div className="my-1 border-t border-border" />
        </>
      )}
      <div className="px-3 pb-1 pt-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
        Add to lists
      </div>
      {userChannels.length > 0 ? (
        <>
          {userChannels.map((channel: UserResourceChannel) => {
            const isActive = activeUuids.has(channel.user_channel_uuid)
            const isPending = pendingChannelUuid === channel.user_channel_uuid
            const isConfirmed = confirmedChannelUuid === channel.user_channel_uuid
            const Icon = getChannelIcon(channel.icon)
            const hasStyle = Boolean(channel.color && channel.icon_color)
            return (
              <button
                key={channel.user_channel_uuid}
                onClick={(e) => handleToggleChannel(e, channel.user_channel_uuid, isActive)}
                disabled={!!pendingChannelUuid}
                className={`mx-1.5 mb-1 flex w-[calc(100%-0.75rem)] items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-opacity disabled:cursor-wait ${hasStyle ? '' : 'bg-muted text-muted-foreground'} ${isActive ? 'ring-1 ring-foreground/35 ring-inset' : 'opacity-80 hover:opacity-100'}`}
                style={{ background: channel.color || undefined, color: channel.icon_color || undefined }}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" />
                <span className="flex-1 truncate text-left">{channel.name}</span>
                <span className="ml-auto flex h-5 w-5 shrink-0 items-center justify-center rounded transition-colors">
                  {isPending ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : isConfirmed ? (
                    <Check size={12} />
                  ) : isActive ? (
                    <X size={11} />
                  ) : (
                    <Plus size={12} />
                  )}
                </span>
              </button>
            )
          })}
        </>
      ) : (
        <p className="px-3 py-2 text-xs text-muted-foreground">No lists yet</p>
      )}
      <button
        onClick={() => {
          setOpen(false)
          setNewChannelModalOpen(true)
        }}
        className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-muted-foreground hover:bg-muted transition-colors"
      >
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded border border-border bg-muted text-muted-foreground">
          <Plus size={12} />
        </span>
        <span className="flex-1 truncate text-left">New list</span>
        <Plus size={12} className="text-muted-foreground" />
      </button>
      {share && !isMenu && (
        <>
          <div className="my-1 border-t border-border" />
          <button
            onClick={() => {
              setOpen(false)
              setShareOpen(true)
            }}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-muted-foreground hover:bg-muted transition-colors"
          >
            <Share2 size={14} className="shrink-0 text-muted-foreground" />
            <span className="flex-1 truncate text-left">Share</span>
          </button>
        </>
      )}
    </div>
  )

  return (
    <>
      {!isChips && !isMenu && (
        <button
          onClick={handleSaveToggle}
          disabled={savingSave}
          className={saveButtonClass}
          title={isSaved ? 'Remove from Library' : 'Add to Library'}
        >
          {savingSave ? (
            <Loader2 size={isCard ? 15 : 14} className="animate-spin" />
          ) : (
            <Bookmark size={isCard ? 15 : 14} className={isSaved ? 'fill-current' : ''} />
          )}
          {!isCard && saveCount !== undefined && <span>{saveCount}</span>}
        </button>
      )}
      <button
        ref={menuButtonRef}
        onClick={open ? () => setOpen(false) : openDropdown}
        className={menuButtonClass}
        title={isMenu ? 'Resource actions' : 'Add to list'}
        aria-label={isMenu ? 'Resource actions' : 'Add to list'}
      >
        {isChips ? <Plus size={13} /> : <MoreVertical size={isCard ? 15 : 16} />}
      </button>
      {mounted && open && createPortal(dropdown, document.body)}
      {mounted && createPortal(
        <NewUserResourceChannelModal
          open={newChannelModalOpen}
          onClose={() => setNewChannelModalOpen(false)}
          onCreated={handleChannelCreated}
        />,
        document.body
      )}
      {mounted && share && createPortal(
        <ResourceShareModal
          open={shareOpen}
          onClose={() => setShareOpen(false)}
          title={share.title}
          description={share.description}
          url={share.url}
          eyebrow="Resource"
        />,
        document.body
      )}
    </>
  )
}
