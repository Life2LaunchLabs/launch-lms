'use client'

import React, { useEffect, useRef, useState } from 'react'
import { Check, Library, Loader2, Pencil, UploadCloud } from 'lucide-react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { mutate } from 'swr'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { useOrg } from '@components/Contexts/OrgContext'
import { useCollection, useCollectionDispatch } from '@components/Contexts/CollectionContext'
import { SafeImage } from '@components/Objects/SafeImage'
import { Button } from '@components/ui/button'
import { getAPIUrl } from '@services/config/config'
import { updateCollection, updateCollectionThumbnail } from '@services/courses/collections'
import { getCollectionThumbnailMediaDirectory, getCourseThumbnailMediaDirectory } from '@services/media/media'

const MAX_FILE_SIZE = 8_000_000
const VALID_IMAGE_MIME_TYPES = ['image/jpeg', 'image/jpg', 'image/png'] as const
type ValidImageMimeType = (typeof VALID_IMAGE_MIME_TYPES)[number]
type EditableField = 'name' | 'description'

export default function CollectionEditorHeader() {
  const router = useRouter()
  const session = useLHSession() as any
  const org = useOrg() as any
  const collectionState = useCollection()
  const dispatch = useCollectionDispatch()
  const collection = collectionState?.collection
  const accessToken = session?.data?.tokens?.access_token
  const imageInputRef = useRef<HTMLInputElement>(null)

  const [editingField, setEditingField] = useState<EditableField | null>(null)
  const [draftName, setDraftName] = useState('')
  const [draftDescription, setDraftDescription] = useState('')
  const [savingField, setSavingField] = useState<EditableField | null>(null)
  const [localThumbnail, setLocalThumbnail] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)

  useEffect(() => {
    if (!collection) return
    setDraftName(collection.name)
    setDraftDescription(collection.description || '')
  }, [collection?.name, collection?.description])

  if (!collection) return null

  const showError = (message: string) => toast.error(message, { duration: 3000, position: 'top-center' })

  const validateFile = (file: File): boolean => {
    if (!VALID_IMAGE_MIME_TYPES.includes(file.type as ValidImageMimeType)) {
      showError('Only JPG and PNG images are allowed.')
      return false
    }
    if (file.size > MAX_FILE_SIZE) {
      showError('Image must be under 8MB.')
      return false
    }
    return true
  }

  const saveField = async (field: EditableField) => {
    if (!accessToken || savingField) return
    const nextValue = field === 'name' ? draftName.trim() : draftDescription.trim()

    if (field === 'name' && nextValue.length < 3) {
      showError('Collection title must be at least 3 characters.')
      return
    }

    setSavingField(field)
    try {
      const patch = field === 'name' ? { name: nextValue } : { description: nextValue }
      const result = await updateCollection(collection.collection_uuid, patch, accessToken)
      if (result) {
        mutate(`${getAPIUrl()}collections/${collection.collection_uuid}`)
        dispatch?.({ type: 'setCollection', payload: { ...collection, ...patch } })
        setEditingField(null)
        toast.success(field === 'name' ? 'Title updated.' : 'Description updated.')
        router.refresh()
      }
    } catch {
      showError(field === 'name' ? 'Failed to update title.' : 'Failed to update description.')
    } finally {
      setSavingField(null)
    }
  }

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (!validateFile(file)) {
      event.target.value = ''
      return
    }

    const previewUrl = URL.createObjectURL(file)
    setLocalThumbnail(previewUrl)
    setIsUploading(true)

    try {
      const formData = new FormData()
      formData.append('thumbnail', file)
      const res = await updateCollectionThumbnail(collection.collection_uuid, formData, accessToken)
      mutate(`${getAPIUrl()}collections/${collection.collection_uuid}`)
      if (res.success === false) {
        showError(res.HTTPmessage || 'Upload failed.')
      } else {
        if (dispatch && res.thumbnail_image) {
          dispatch({ type: 'setCollection', payload: { ...collection, thumbnail_image: res.thumbnail_image } })
        }
        toast.success('Cover photo updated.', { duration: 3000, position: 'top-center' })
        router.refresh()
      }
    } catch {
      showError('Failed to upload image.')
    } finally {
      setLocalThumbnail(null)
      setIsUploading(false)
      event.target.value = ''
    }
  }

  const thumbnailUrl = localThumbnail || (
    collection.thumbnail_image && org?.org_uuid
      ? getCollectionThumbnailMediaDirectory(org.org_uuid, collection.collection_uuid, collection.thumbnail_image)
      : null
  )

  const courses = collection.courses || []

  return (
    <div className="my-2 flex flex-col gap-5 py-2 md:flex-row md:items-center">
      <div className="group relative aspect-video w-full max-w-[240px] shrink-0 overflow-hidden rounded-lg border border-gray-200 bg-gray-100">
        {thumbnailUrl ? (
          <SafeImage
            src={thumbnailUrl}
            alt="Collection cover"
            className={`h-full w-full object-cover ${isUploading ? 'animate-pulse' : ''}`}
          />
        ) : courses.length > 0 ? (
          <div className="relative z-0 flex h-full w-full items-center justify-center bg-gray-100/60 px-6">
            <div className="flex -space-x-10">
              {courses.slice(0, 3).map((course: any, index: number) => (
                <div
                  key={course.course_uuid}
                  className="h-20 w-32 shrink-0 overflow-hidden rounded-md border-2 border-white bg-cover bg-center shadow-md"
                  style={{
                    backgroundImage: `url(${course.thumbnail_image
                      ? getCourseThumbnailMediaDirectory(org?.org_uuid, course.course_uuid, course.thumbnail_image)
                      : '/empty_thumbnail.png'})`,
                    zIndex: 3 - index,
                  }}
                />
              ))}
            </div>
          </div>
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center text-gray-400">
            <Library size={32} strokeWidth={1.5} />
          </div>
        )}

        <input
          ref={imageInputRef}
          type="file"
          className="hidden"
          accept=".jpg,.jpeg,.png"
          onChange={handleFileChange}
        />
        <Button
          type="button"
          size="icon"
          variant="secondary"
          disabled={isUploading}
          className="absolute right-2 top-2 z-20 h-8 w-8 opacity-0 shadow-md transition-opacity group-hover:opacity-100"
          onClick={() => imageInputRef.current?.click()}
          title="Upload cover image"
        >
          {isUploading ? <Loader2 className="animate-spin" /> : <UploadCloud />}
        </Button>
      </div>

      <div className="min-w-0 flex-1">
        <EditableHeaderField
          field="name"
          isEditing={editingField === 'name'}
          value={draftName}
          onChange={setDraftName}
          onEdit={() => setEditingField('name')}
          onSave={() => saveField('name')}
          isSaving={savingField === 'name'}
        />
        <EditableHeaderField
          field="description"
          isEditing={editingField === 'description'}
          value={draftDescription}
          onChange={setDraftDescription}
          onEdit={() => setEditingField('description')}
          onSave={() => saveField('description')}
          isSaving={savingField === 'description'}
        />
      </div>
    </div>
  )
}

function EditableHeaderField({
  field,
  isEditing,
  value,
  onChange,
  onEdit,
  onSave,
  isSaving,
}: {
  field: EditableField
  isEditing: boolean
  value: string
  onChange: (value: string) => void
  onEdit: () => void
  onSave: () => void
  isSaving: boolean
}) {
  const isTitle = field === 'name'

  return (
    <div className={`group flex min-w-0 items-start gap-2 ${isTitle ? 'mb-2' : ''}`}>
      {isEditing ? (
        isTitle ? (
          <input
            autoFocus
            value={value}
            maxLength={100}
            onChange={(event) => onChange(event.target.value)}
            className="min-w-0 flex-1 rounded-md border border-gray-200 bg-white px-3 py-2 text-3xl font-bold tracking-tight text-gray-900 outline-none focus:ring-2 focus:ring-black"
          />
        ) : (
          <textarea
            autoFocus
            value={value}
            maxLength={500}
            onChange={(event) => onChange(event.target.value)}
            rows={2}
            placeholder="Describe this collection..."
            className="min-w-0 flex-1 resize-none rounded-md border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-500 outline-none focus:ring-2 focus:ring-black"
          />
        )
      ) : isTitle ? (
        <h1 className="min-w-0 break-words text-4xl font-bold tracking-tight text-gray-900">{value}</h1>
      ) : (
        <p className="min-w-0 break-words text-sm font-medium text-gray-500">
          {value || 'No description yet.'}
        </p>
      )}

      <Button
        type="button"
        size="icon"
        variant={isEditing ? 'default' : 'ghost'}
        disabled={isSaving}
        className={`mt-1 h-7 w-7 shrink-0 ${
          isEditing
            ? 'bg-green-600 text-white hover:bg-green-700'
            : 'opacity-0 transition-opacity group-hover:opacity-100'
        }`}
        onClick={isEditing ? onSave : onEdit}
        title={isEditing ? 'Save' : 'Edit'}
      >
        {isSaving ? <Loader2 className="animate-spin" /> : isEditing ? <Check /> : <Pencil />}
      </Button>
    </div>
  )
}
