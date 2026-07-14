'use client'

import React, { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Check, ChevronDown, Clock, Eye, Globe, GlobeLock, Image as ImageIcon, Loader2, Pencil, UploadCloud, Video } from 'lucide-react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { mutate } from 'swr'
import { Breadcrumbs } from '@components/Objects/Breadcrumbs/Breadcrumbs'
import { useCourse, useCourseDispatch, getCourseMetaCacheKey } from '@components/Contexts/CourseContext'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { useOrg } from '@components/Contexts/OrgContext'
import { SafeImage, SafeVideo } from '@components/Objects/SafeImage'
import { Button } from '@components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@components/ui/dropdown-menu'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { updateCourse, updateCourseThumbnail } from '@services/courses/courses'
import { getCourseThumbnailMediaDirectory } from '@services/media/media'
import { revalidateTags } from '@services/utils/ts/requests'
import MediaPickerDialog from '@components/Objects/Media/MediaPickerDialog'

const MAX_FILE_SIZE = 8_000_000
const MAX_VIDEO_FILE_SIZE = 100_000_000
const VALID_IMAGE_MIME_TYPES = ['image/jpeg', 'image/jpg', 'image/png'] as const
const VALID_VIDEO_MIME_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'] as const
type EditableField = 'name' | 'description'
type UploadType = 'image' | 'video'
type CourseStatus = 'unpublished' | 'coming_soon' | 'published'

export default function CourseEditorHeader({
  orgslug,
  courseuuid,
}: {
  orgslug: string
  courseuuid: string
}) {
  const router = useRouter()
  const course = useCourse() as any
  const dispatchCourse = useCourseDispatch() as any
  const session = useLHSession() as any
  const org = useOrg() as any
  const imageInputRef = useRef<HTMLInputElement>(null)
  const videoInputRef = useRef<HTMLInputElement>(null)
  const courseStructure = course?.courseStructure
  const accessToken = session.data?.tokens?.access_token
  const withUnpublishedActivities = course?.withUnpublishedActivities ?? false

  const [editingField, setEditingField] = useState<EditableField | null>(null)
  const [draftName, setDraftName] = useState('')
  const [draftDescription, setDraftDescription] = useState('')
  const [savingField, setSavingField] = useState<EditableField | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadPreview, setUploadPreview] = useState<{ url: string; type: UploadType } | null>(null)
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false)
  const [imagePickerOpen, setImagePickerOpen] = useState(false)

  useEffect(() => {
    if (!courseStructure) return
    setDraftName(courseStructure.name || '')
    setDraftDescription(courseStructure.description || '')
  }, [courseStructure?.name, courseStructure?.description])

  useEffect(() => {
    return () => {
      if (uploadPreview?.url) URL.revokeObjectURL(uploadPreview.url)
    }
  }, [uploadPreview])

  if (!courseStructure) return null

  const cacheKey = getCourseMetaCacheKey(courseStructure.course_uuid, withUnpublishedActivities)
  const publicCourseHref = getUriWithOrg(org?.slug || orgslug, routePaths.org.course(courseuuid))
  const currentStatus: CourseStatus = courseStructure.published
    ? 'published'
    : courseStructure.coming_soon
      ? 'coming_soon'
      : 'unpublished'

  const validateFile = (file: File, type: UploadType) => {
    if (type === 'image') {
      if (!VALID_IMAGE_MIME_TYPES.includes(file.type as any)) {
        toast.error('Only JPG and PNG images are allowed.')
        return false
      }
      if (file.size > MAX_FILE_SIZE) {
        toast.error('Image must be under 8MB.')
        return false
      }
      return true
    }

    if (!VALID_VIDEO_MIME_TYPES.includes(file.type as any)) {
      toast.error('Only MP4, WebM, or MOV videos are allowed.')
      return false
    }
    if (file.size > MAX_VIDEO_FILE_SIZE) {
      toast.error('Video must be under 100MB.')
      return false
    }
    return true
  }

  const patchCourse = async (patch: Record<string, any>) => {
    await updateCourse(courseStructure.course_uuid, patch, accessToken)
    const nextCourse = { ...courseStructure, ...patch }
    await mutate(cacheKey, nextCourse, { revalidate: false })
    dispatchCourse({ type: 'setCourseStructure', payload: nextCourse })
    dispatchCourse({ type: 'setIsSaved' })
    await revalidateTags(['courses'], orgslug)
    router.refresh()
  }

  const saveField = async (field: EditableField) => {
    if (savingField) return
    const value = field === 'name' ? draftName.trim() : draftDescription.trim()

    if (field === 'name' && value.length < 3) {
      toast.error('Course title must be at least 3 characters.')
      return
    }

    setSavingField(field)
    try {
      await patchCourse(field === 'name' ? { name: value } : { description: value })
      setEditingField(null)
      toast.success(field === 'name' ? 'Title updated.' : 'Description updated.')
    } catch {
      toast.error(field === 'name' ? 'Failed to update title.' : 'Failed to update description.')
    } finally {
      setSavingField(null)
    }
  }

  const updateStatus = async (status: CourseStatus) => {
    if (isUpdatingStatus || status === currentStatus) return
    setIsUpdatingStatus(true)

    const patch = {
      published: status === 'published',
      coming_soon: status === 'coming_soon',
    }

    try {
      await patchCourse(patch)
      toast.success('Course status updated.')
    } catch {
      toast.error('Failed to update course status.')
    } finally {
      setIsUpdatingStatus(false)
    }
  }

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>, type: UploadType) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (!validateFile(file, type)) {
      event.target.value = ''
      return
    }

    const previewUrl = URL.createObjectURL(file)
    setUploadPreview({ url: previewUrl, type })
    setIsUploading(true)

    try {
      const formData = new FormData()
      formData.append('thumbnail', file)
      formData.append('thumbnail_type', type)
      const res = await updateCourseThumbnail(courseStructure.course_uuid, formData, accessToken)
      await mutate(cacheKey)

      if (res.success === false) {
        toast.error(res.HTTPmessage || 'Upload failed.')
      } else {
        toast.success(type === 'image' ? 'Thumbnail image updated.' : 'Thumbnail video updated.')
      }
    } catch {
      toast.error(type === 'image' ? 'Failed to upload image.' : 'Failed to upload video.')
    } finally {
      setUploadPreview(null)
      setIsUploading(false)
      event.target.value = ''
    }
  }

  const handleImageMediaSelect = async (url: string) => {
    setUploadPreview({ url, type: 'image' })
    setIsUploading(true)
    try {
      await patchCourse({
        thumbnail_image: url,
        thumbnail_type: courseStructure.thumbnail_video ? 'both' : 'image',
      })
      toast.success('Thumbnail image updated.')
    } catch {
      toast.error('Failed to update image.')
    } finally {
      setUploadPreview(null)
      setIsUploading(false)
    }
  }

  const imageUrl = courseStructure.thumbnail_image
    ? getCourseThumbnailMediaDirectory(org?.org_uuid, courseStructure.course_uuid, courseStructure.thumbnail_image)
    : '/empty_thumbnail.png'
  const videoUrl = courseStructure.thumbnail_video
    ? getCourseThumbnailMediaDirectory(org?.org_uuid, courseStructure.course_uuid, courseStructure.thumbnail_video)
    : null
  const showVideo = uploadPreview?.type === 'video' || (!uploadPreview && courseStructure.thumbnail_type === 'video' && videoUrl)

  return (
    <>
      <div className="pt-6 pb-4">
        <Breadcrumbs items={[
          { label: 'Courses', href: '/admin/courses' },
          { label: courseStructure.name },
        ]} />
      </div>

      <div className="my-2 flex flex-col gap-5 py-2 md:flex-row md:items-center">
        <div className="group relative aspect-video w-full max-w-[240px] shrink-0 overflow-hidden rounded-lg border border-gray-200 bg-gray-100">
          {showVideo ? (
            <SafeVideo
              src={uploadPreview?.type === 'video' ? uploadPreview.url : videoUrl}
              className={`h-full w-full object-cover ${isUploading ? 'animate-pulse' : ''}`}
              muted
              controls
            />
          ) : (
            <SafeImage
              src={uploadPreview?.type === 'image' ? uploadPreview.url : imageUrl}
              alt="Course thumbnail"
              className={`h-full w-full object-cover ${isUploading ? 'animate-pulse' : ''}`}
            />
          )}

          <input ref={imageInputRef} type="file" className="hidden" accept=".jpg,.jpeg,.png" onChange={(event) => handleFileChange(event, 'image')} />
          <input ref={videoInputRef} type="file" className="hidden" accept=".mp4,.webm,.mov" onChange={(event) => handleFileChange(event, 'video')} />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                size="icon"
                variant="secondary"
                disabled={isUploading}
                className="absolute right-2 top-2 z-20 h-8 w-8 opacity-0 shadow-md transition-opacity group-hover:opacity-100"
                title="Upload thumbnail media"
              >
                {isUploading ? <Loader2 className="animate-spin" /> : <UploadCloud />}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setImagePickerOpen(true)}>
                <ImageIcon className="h-4 w-4" />
                Choose image
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => videoInputRef.current?.click()}>
                <Video className="h-4 w-4" />
                Upload video
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
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
      <MediaPickerDialog
        open={imagePickerOpen}
        onOpenChange={setImagePickerOpen}
        title="Choose course thumbnail"
        description="Upload, link, or select an image from the media library."
        owner={{ type: 'org', id: Number(org.id) }}
        mediaType="image"
        accessToken={accessToken}
        onSave={(asset) => handleImageMediaSelect(asset.url)}
      />

      <div className="flex items-center gap-2 pb-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="gap-2 bg-white" disabled={isUpdatingStatus}>
              {isUpdatingStatus ? <Loader2 className="animate-spin" /> : <StatusIcon status={currentStatus} />}
              <span>{getStatusLabel(currentStatus)}</span>
              <ChevronDown className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={() => updateStatus('unpublished')}>
              <GlobeLock className="h-4 w-4" />
              Unpublished
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => updateStatus('coming_soon')}>
              <Clock className="h-4 w-4" />
              Coming soon
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => updateStatus('published')}>
              <Globe className="h-4 w-4" />
              Published
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button asChild variant="outline" className="gap-2 bg-white">
          <Link href={publicCourseHref} target="_blank">
            <Eye className="h-4 w-4" />
            Preview
          </Link>
        </Button>
      </div>
    </>
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
            maxLength={1000}
            onChange={(event) => onChange(event.target.value)}
            rows={2}
            placeholder="Describe this course..."
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

function StatusIcon({ status }: { status: CourseStatus }) {
  if (status === 'published') return <Globe className="h-4 w-4 text-green-700" />
  if (status === 'coming_soon') return <Clock className="h-4 w-4 text-orange-700" />
  return <GlobeLock className="h-4 w-4 text-yellow-700" />
}

function getStatusLabel(status: CourseStatus) {
  if (status === 'published') return 'Published'
  if (status === 'coming_soon') return 'Coming soon'
  return 'Unpublished'
}
