'use client'

import { useEffect, useState } from 'react'
import { BookOpen, Loader2, X } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { channelIconOptions, defaultChapterIconName } from '@components/Resources/ResourceChannelStyle'
import { updateChapter } from '@services/courses/chapters'
import { getAPIUrl } from '@services/config/config'
import { revalidateTags } from '@services/utils/ts/requests'
import { mutate } from 'swr'
import { useRouter } from 'next/navigation'

export default function ChapterIconPicker({
  open,
  onClose,
  chapter,
  accessToken,
  courseUuid,
  orgslug,
  withUnpublishedActivities,
}: {
  open: boolean
  onClose: () => void
  chapter: any
  accessToken?: string
  courseUuid: string
  orgslug: string
  withUnpublishedActivities: boolean
}) {
  const router = useRouter()
  const [selectedIcon, setSelectedIcon] = useState(defaultChapterIconName)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setSelectedIcon(chapter?.icon || defaultChapterIconName)
  }, [chapter?.icon, open])

  if (!open) return null

  const SelectedIcon = channelIconOptions.find((option) => option.name === selectedIcon)?.Icon || BookOpen

  const handleSave = async () => {
    if (!chapter?.id || !accessToken || saving) return
    setSaving(true)
    try {
      await updateChapter(chapter.id, { icon: selectedIcon }, accessToken)
      mutate(`${getAPIUrl()}courses/${courseUuid}/meta?with_unpublished_activities=${withUnpublishedActivities}`)
      await revalidateTags(['courses'], orgslug)
      router.refresh()
      toast.success('Chapter icon updated')
      onClose()
    } catch (error: any) {
      toast.error(error?.message || 'Failed to update chapter icon')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[210] flex items-center justify-center bg-black/40 p-4"
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-3xl bg-white p-6 nice-shadow">
        <div className="mb-5 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">Edit chapter icon</h3>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-gray-100"
          >
            <X size={18} />
          </button>
        </div>
        <div className="mb-5 flex h-36 items-center justify-center">
          <div className="flex h-24 w-24 items-center justify-center rounded-2xl bg-gray-100 text-gray-900 shadow-sm ring-1 ring-black/5">
            <SelectedIcon size={46} />
          </div>
        </div>
        <div className="grid max-h-52 grid-cols-5 gap-1.5 overflow-y-auto pr-1">
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
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-gray-200 px-4 py-2 text-sm transition-colors hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 rounded-xl bg-black px-4 py-2 text-sm text-white transition-colors hover:bg-gray-800 disabled:opacity-40"
          >
            {saving && <Loader2 size={13} className="animate-spin" />}
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
