'use client'

import { useEffect, useState } from 'react'
import {
  FolderOpen,
  Loader2,
  X,
} from 'lucide-react'
import { toast } from 'react-hot-toast'
import { useOrg } from '@components/Contexts/OrgContext'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import {
  createUserResourceChannel,
  updateUserResourceChannel,
  UserResourceChannel,
} from '@services/resources/resources'
import {
  channelColorOptions,
  channelIconOptions,
} from '@components/Resources/ResourceChannelStyle'

type PickerMode = 'icon' | 'color'

function requireSuccess(result: any, fallbackMessage: string) {
  if (!result?.success) {
    throw new Error(result?.data?.detail || result?.data?.message || fallbackMessage)
  }
}

function randomItem<T>(items: T[]) {
  return items[Math.floor(Math.random() * items.length)]
}

export default function NewUserResourceChannelModal({
  open,
  onClose,
  onCreated,
  channel,
  onUpdated,
}: {
  open: boolean
  onClose: () => void
  onCreated?: (channel: UserResourceChannel) => void | Promise<void>
  channel?: UserResourceChannel | null
  onUpdated?: (channel: UserResourceChannel) => void | Promise<void>
}) {
  const org = useOrg() as any
  const session = useLHSession() as any
  const accessToken = session?.data?.tokens?.access_token
  const orgId = org?.id

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [selectedIcon, setSelectedIcon] = useState(channelIconOptions[0].name)
  const [selectedColor, setSelectedColor] = useState(channelColorOptions[0])
  const [editingPicker, setEditingPicker] = useState(false)
  const [pickerMode, setPickerMode] = useState<PickerMode>('icon')
  const [creating, setCreating] = useState(false)
  const isEditing = Boolean(channel)

  useEffect(() => {
    if (!open) return
    if (channel) {
      setName(channel.name)
      setDescription(channel.description || '')
      setSelectedIcon(channel.icon || channelIconOptions[0].name)
      setSelectedColor(
        channel.color && channel.icon_color
          ? { name: 'Current', background: channel.color, iconColor: channel.icon_color }
          : channelColorOptions[0]
      )
    } else {
      setName('')
      setDescription('')
      setSelectedIcon(randomItem(channelIconOptions).name)
      setSelectedColor(randomItem(channelColorOptions))
    }
    setEditingPicker(false)
    setPickerMode('icon')
  }, [channel, open])

  if (!open) return null

  const SelectedIcon = channelIconOptions.find((option) => option.name === selectedIcon)?.Icon || FolderOpen

  const handleCreate = async () => {
    if (!name.trim() || !accessToken || !orgId || creating) return
    setCreating(true)
    try {
      const payload = {
        name: name.trim(),
        description: description.trim() || null,
        icon: selectedIcon,
        color: selectedColor.background,
        icon_color: selectedColor.iconColor,
      }
      const result = channel
        ? await updateUserResourceChannel(orgId, channel.user_channel_uuid, payload, accessToken)
        : await createUserResourceChannel(orgId, payload, accessToken)
      requireSuccess(result, channel ? 'Failed to update channel' : 'Failed to create channel')
      if (channel) {
        await onUpdated?.(result.data as UserResourceChannel)
      } else {
        await onCreated?.(result.data as UserResourceChannel)
        setName('')
        setDescription('')
      }
      setEditingPicker(false)
      setPickerMode('icon')
      onClose()
      toast.success(channel ? 'Channel updated' : 'Channel created')
    } catch (error: any) {
      toast.error(error?.message || (channel ? 'Failed to update channel' : 'Failed to create channel'))
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[210] flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-white p-6 nice-shadow">
        <div className="mb-5 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">{isEditing ? 'Edit channel' : 'New channel'}</h3>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-gray-100 transition-colors"
          >
            <X size={18} />
          </button>
        </div>
        <div className="space-y-4">
          <div>
            <div className="mb-2 flex items-center justify-end">
              <button
                type="button"
                onClick={() => setEditingPicker(!editingPicker)}
                className={`h-8 rounded-lg px-3 text-sm font-medium transition-colors ${
                  editingPicker
                    ? 'bg-black text-white hover:bg-gray-800'
                    : 'text-gray-600 hover:bg-white hover:text-gray-900'
                }`}
              >
                {editingPicker ? 'Done' : 'Edit'}
              </button>
            </div>
            <div className="relative flex h-48 overflow-hidden">
              <div
                className={`flex shrink-0 items-center justify-center transition-all duration-300 ease-out ${
                  editingPicker ? 'h-20 w-20 self-start' : 'h-full w-full'
                }`}
              >
                <div
                  className={`flex items-center justify-center rounded-2xl shadow-sm ring-1 ring-black/5 transition-all duration-300 ease-out ${
                    editingPicker ? 'h-16 w-16' : 'h-28 w-28'
                  }`}
                  style={{ background: selectedColor.background }}
                >
                  <SelectedIcon
                    className="transition-all duration-300 ease-out"
                    size={editingPicker ? 28 : 52}
                    style={{ color: selectedColor.iconColor }}
                  />
                </div>
              </div>
              <div
                className={`min-w-0 flex-1 transition-all duration-300 ease-out ${
                  editingPicker ? 'ml-3 translate-x-0 opacity-100' : 'pointer-events-none translate-x-4 opacity-0'
                }`}
              >
                <div className="relative mb-2 inline-grid grid-cols-2 rounded-lg bg-gray-100 p-1 shadow-inner ring-1 ring-gray-200/70">
                  <span
                    className={`absolute top-1 h-[calc(100%-0.5rem)] w-[calc(50%-0.25rem)] rounded-md bg-white shadow-sm transition-transform duration-200 ease-out ${
                      pickerMode === 'color' ? 'translate-x-full' : 'translate-x-0'
                    }`}
                  />
                  {(['icon', 'color'] as PickerMode[]).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setPickerMode(mode)}
                      className={`relative z-10 rounded-md px-3 py-1 text-xs font-medium capitalize transition-colors ${
                        pickerMode === mode
                          ? 'text-gray-950'
                          : 'text-gray-500 hover:text-gray-900'
                      }`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
                <div className="h-[8.5rem] overflow-y-auto pr-1">
                  {pickerMode === 'icon' ? (
                    <div className="grid grid-cols-5 gap-1.5">
                      {channelIconOptions.map(({ name: optionName, Icon }) => (
                        <button
                          key={optionName}
                          type="button"
                          onClick={() => setSelectedIcon(optionName)}
                          title={optionName}
                          className={`flex aspect-square items-center justify-center rounded-lg border transition-colors ${
                            selectedIcon === optionName
                              ? 'border-black bg-white text-gray-900'
                              : 'border-gray-200 bg-white/70 text-gray-500 hover:bg-white'
                          }`}
                        >
                          <Icon size={17} />
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="grid grid-cols-5 gap-1.5">
                      {channelColorOptions.map((option) => (
                        <button
                          key={option.name}
                          type="button"
                          onClick={() => setSelectedColor(option)}
                          title={option.name}
                          className={`flex aspect-square items-center justify-center rounded-lg border transition-transform ${
                            selectedColor.name === option.name
                              ? 'border-black ring-2 ring-black/10'
                              : 'border-gray-200 hover:scale-105'
                          }`}
                          style={{ background: option.background }}
                        >
                          <SelectedIcon size={17} style={{ color: option.iconColor }} />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Title</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400"
              placeholder="Channel name"
              autoFocus
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full resize-none rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400"
              placeholder="Optional description"
              rows={3}
            />
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-xl border border-gray-200 px-4 py-2 text-sm hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!name.trim() || creating}
            className="flex items-center gap-1.5 rounded-xl bg-black px-4 py-2 text-sm text-white hover:bg-gray-800 disabled:opacity-40 transition-colors"
          >
            {creating && <Loader2 size={13} className="animate-spin" />}
            {isEditing ? 'Save' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  )
}
