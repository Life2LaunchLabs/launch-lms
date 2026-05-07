'use client'

import { useEffect, useRef, useState } from 'react'
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
import { ResourceChannelStyleIcon } from '@components/Resources/ResourceChannelStyle'
import ResourceShareModal from '@components/Resources/ResourceShareModal'

interface SaveDropdownProps {
  resourceUuid: string
  isSaved: boolean
  saveCount?: number
  /** UUIDs of user channels this resource is currently saved to (from resource.user_channel_uuids) */
  savedUserChannelUuids: string[]
  onSaveChange: (saved: boolean) => void
  variant?: 'card' | 'detail'
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
      } else {
        const result = await saveResource(resourceUuid, { add_to_default_channel: true }, accessToken)
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
        add_to_default_channel: true,
        user_channel_uuids: [...next],
      }, accessToken)
      requireSuccess(result, isActive ? 'Failed to remove from channel' : 'Failed to add to channel')
      if (!isSaved) onSaveChange(true)
      setActiveUuids(next)
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
      add_to_default_channel: true,
      user_channel_uuids: [...next],
    }, accessToken)
    requireSuccess(saveResult, 'Failed to add to channel')
    if (!isSaved) onSaveChange(true)
    setActiveUuids(next)
    setConfirmedChannelUuid(created.user_channel_uuid)
    window.setTimeout(() => {
      setConfirmedChannelUuid((current) => current === created.user_channel_uuid ? null : current)
    }, 900)
    setOpen(true)
    mutate()
  }

  if (!accessToken) return null

  const isCard = variant === 'card'

  const saveButtonClass = isCard
    ? `rounded-full p-2 transition-opacity ${
          isSaved
            ? 'opacity-100 bg-black/60 text-white'
            : 'opacity-0 group-hover:opacity-100 bg-black/40 text-white'
        }`
    : `ml-auto flex items-center gap-1.5 rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors ${
          isSaved
            ? 'border-black bg-black text-white'
            : 'border-gray-200 text-gray-600 hover:border-gray-400'
        }`

  const menuButtonClass = isCard
    ? `rounded-full p-2 transition-opacity ${
        open
          ? 'opacity-100 bg-white/85 text-gray-900'
          : isSaved
            ? 'opacity-100 bg-black/60 text-white'
            : 'opacity-0 group-hover:opacity-100 bg-black/40 text-white'
      }`
    : `flex h-10 w-10 items-center justify-center rounded-xl border border-transparent text-gray-500 transition-colors ${
        open ? 'bg-gray-100 text-gray-900' : 'hover:border-gray-200 hover:bg-gray-50'
      }`

  const dropdown = (
    <div
      ref={dropdownRef}
      className="fixed z-[200] w-60 rounded-xl border border-gray-200 bg-white py-1.5 shadow-lg"
      style={{ top: pos.top, right: pos.right }}
    >
      <div className="px-3 pb-1 pt-1.5 text-[10px] uppercase tracking-wide text-gray-400">
        Add to
      </div>
      {userChannels.length > 0 ? (
        <>
          {userChannels.map((channel: UserResourceChannel) => {
            const isActive = activeUuids.has(channel.user_channel_uuid)
            const isPending = pendingChannelUuid === channel.user_channel_uuid
            const isConfirmed = confirmedChannelUuid === channel.user_channel_uuid
            return (
              <button
                key={channel.user_channel_uuid}
                onClick={(e) => handleToggleChannel(e, channel.user_channel_uuid, isActive)}
                disabled={!!pendingChannelUuid}
                className={`flex w-full items-center gap-2.5 px-3 py-2 text-sm transition-colors disabled:cursor-wait ${
                  isActive ? 'bg-gray-100 text-gray-900' : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                <ResourceChannelStyleIcon
                  icon={channel.icon}
                  color={channel.color}
                  iconColor={channel.icon_color}
                  size={13}
                  className="h-5 w-5 shrink-0 rounded-md"
                />
                <span className="flex-1 truncate text-left">{channel.name}</span>
                <span className="ml-auto flex h-5 w-5 shrink-0 items-center justify-center rounded transition-colors">
                  {isPending ? (
                    <Loader2 size={12} className="animate-spin text-gray-400" />
                  ) : isConfirmed ? (
                    <Check size={12} className="text-emerald-600" />
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
        <p className="px-3 py-2 text-xs text-gray-400">No channels yet</p>
      )}
      <button
        onClick={() => {
          setOpen(false)
          setNewChannelModalOpen(true)
        }}
        className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
      >
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded border border-gray-200 bg-gray-50 text-gray-500">
          <Plus size={12} />
        </span>
        <span className="flex-1 truncate text-left">New channel</span>
        <Plus size={12} className="text-gray-400" />
      </button>
      {share && (
        <>
          <div className="my-1 border-t border-gray-100" />
          <button
            onClick={() => {
              setOpen(false)
              setShareOpen(true)
            }}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <Share2 size={14} className="shrink-0 text-gray-400" />
            <span className="flex-1 truncate text-left">Share</span>
          </button>
        </>
      )}
    </div>
  )

  return (
    <>
      <button
        onClick={handleSaveToggle}
        disabled={savingSave}
        className={saveButtonClass}
        title={isSaved ? 'Remove save' : 'Save'}
      >
        {savingSave ? (
          <Loader2 size={isCard ? 15 : 14} className="animate-spin" />
        ) : (
          <Bookmark size={isCard ? 15 : 14} className={isSaved ? 'fill-current' : ''} />
        )}
        {!isCard && saveCount !== undefined && <span>{saveCount}</span>}
      </button>
      <button
        ref={menuButtonRef}
        onClick={open ? () => setOpen(false) : openDropdown}
        className={menuButtonClass}
        title="Add to channel"
      >
        <MoreVertical size={isCard ? 15 : 16} />
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
