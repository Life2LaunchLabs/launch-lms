'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Bookmark, FolderOpen, Trash2, X } from 'lucide-react'
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

interface SaveDropdownProps {
  resourceUuid: string
  isSaved: boolean
  saveCount?: number
  /** UUIDs of user channels this resource is currently saved to (from resource.user_channel_uuids) */
  savedUserChannelUuids: string[]
  onSaveChange: (saved: boolean) => void
  variant?: 'card' | 'detail'
}

export default function SaveDropdown({
  resourceUuid,
  isSaved,
  saveCount,
  savedUserChannelUuids,
  onSaveChange,
  variant = 'card',
}: SaveDropdownProps) {
  const org = useOrg() as any
  const session = useLHSession() as any
  const accessToken = session?.data?.tokens?.access_token
  const orgId = org?.id

  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [pos, setPos] = useState<{ top: number; right: number }>({ top: 0, right: 0 })
  // local set of active user channel UUIDs — seeded from prop, updated optimistically
  const [activeUuids, setActiveUuids] = useState<Set<string>>(
    () => new Set(savedUserChannelUuids)
  )
  const buttonRef = useRef<HTMLButtonElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => setMounted(true), [])

  // re-sync if parent refetches
  useEffect(() => {
    setActiveUuids(new Set(savedUserChannelUuids))
  }, [savedUserChannelUuids])

  const { data: channelData } = useSWR(
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
        buttonRef.current?.contains(e.target as Node)
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
    const rect = buttonRef.current?.getBoundingClientRect()
    if (!rect) return
    setPos({ top: rect.bottom + 6, right: window.innerWidth - rect.right })
    setOpen(true)
  }

  const handleButtonClick = async () => {
    if (!accessToken) return
    if (!isSaved) {
      try {
        await saveResource(resourceUuid, { add_to_default_channel: true }, accessToken)
        onSaveChange(true)
      } catch {
        toast.error('Failed to save resource')
        return
      }
    }
    openDropdown()
  }

  // Send the full updated channel list each time (backend replaces, not appends)
  const handleToggleChannel = async (e: React.MouseEvent, channelUuid: string, isActive: boolean) => {
    e.stopPropagation()
    const next = new Set(activeUuids)
    if (isActive) {
      next.delete(channelUuid)
    } else {
      next.add(channelUuid)
    }
    try {
      await saveResource(resourceUuid, {
        add_to_default_channel: true,
        user_channel_uuids: [...next],
      }, accessToken)
      setActiveUuids(next)
    } catch {
      toast.error(isActive ? 'Failed to remove from channel' : 'Failed to add to channel')
    }
  }

  const handleRemoveSave = async () => {
    try {
      await unsaveResource(resourceUuid, accessToken)
      onSaveChange(false)
      setOpen(false)
    } catch {
      toast.error('Failed to remove save')
    }
  }

  if (!accessToken) return null

  const isCard = variant === 'card'

  const buttonClass = isCard
    ? open
      ? 'rounded-full p-2 opacity-100 bg-white/85 text-gray-900 transition-opacity'
      : `rounded-full p-2 transition-opacity ${
          isSaved
            ? 'opacity-100 bg-black/60 text-white'
            : 'opacity-0 group-hover:opacity-100 bg-black/40 text-white'
        }`
    : open
      ? 'flex items-center gap-1.5 rounded-xl border px-3 py-2.5 text-sm font-medium border-gray-400 bg-gray-100 text-gray-800 transition-colors'
      : `flex items-center gap-1.5 rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors ${
          isSaved
            ? 'border-black bg-black text-white'
            : 'border-gray-200 text-gray-600 hover:border-gray-400'
        }`

  const dropdown = (
    <div
      ref={dropdownRef}
      className="fixed z-[200] w-52 rounded-xl border border-gray-200 bg-white py-1.5 shadow-lg"
      style={{ top: pos.top, right: pos.right }}
    >
      {userChannels.length > 0 ? (
        <>
          <div className="px-3 pb-1 pt-1.5 text-[10px] uppercase tracking-wide text-gray-400">
            Your channels
          </div>
          {userChannels.map((channel: UserResourceChannel) => {
            const isActive = activeUuids.has(channel.user_channel_uuid)
            return (
              <button
                key={channel.user_channel_uuid}
                onClick={(e) => handleToggleChannel(e, channel.user_channel_uuid, isActive)}
                className={`flex w-full items-center gap-2.5 px-3 py-2 text-sm transition-colors ${
                  isActive ? 'bg-gray-100 text-gray-900' : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                <FolderOpen size={14} className="shrink-0 text-gray-400" />
                <span className="flex-1 truncate text-left">{channel.name}</span>
                {isActive && (
                  <span className="ml-auto flex h-5 w-5 shrink-0 items-center justify-center rounded hover:bg-gray-300 transition-colors">
                    <X size={11} />
                  </span>
                )}
              </button>
            )
          })}
        </>
      ) : (
        <p className="px-3 py-2 text-xs text-gray-400">No channels yet</p>
      )}
      <div className="my-1 border-t border-gray-100" />
      <button
        onClick={handleRemoveSave}
        className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
      >
        <Trash2 size={14} className="shrink-0" />
        Remove save
      </button>
    </div>
  )

  return (
    <>
      <button
        ref={buttonRef}
        onClick={handleButtonClick}
        className={buttonClass}
        title={isSaved ? 'Saved' : 'Save'}
      >
        <Bookmark size={isCard ? 15 : 14} className={isSaved && !open ? 'fill-current' : ''} />
        {!isCard && saveCount !== undefined && <span>{saveCount}</span>}
      </button>
      {mounted && open && createPortal(dropdown, document.body)}
    </>
  )
}
