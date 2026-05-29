'use client'

import { getCourseMetaCacheKey, useCourse, useCourseFieldSync } from '@components/Contexts/CourseContext'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { useOrg } from '@components/Contexts/OrgContext'
import { SafeImage } from '@components/Objects/SafeImage'
import { Switch } from '@components/ui/switch'
import { updateCourseCoreBackground } from '@services/courses/courses'
import { getCourseCoreBackgroundMediaDirectory, getCourseThumbnailMediaDirectory } from '@services/media/media'
import { ArrowBigUpDash, Image as ImageIcon, UploadCloud } from 'lucide-react'
import React, { useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { mutate } from 'swr'

const MAX_FILE_SIZE = 8_000_000
const VALID_IMAGE_MIME_TYPES = ['image/jpeg', 'image/jpg', 'image/png'] as const

type ValidImageMimeType = typeof VALID_IMAGE_MIME_TYPES[number]

function getBackgroundPreviewUrl(courseStructure: any, orgUuid?: string) {
  if (!orgUuid || !courseStructure?.course_uuid) return null
  const coreBackgroundImage = courseStructure?.seo?.core_background_image
  if (coreBackgroundImage) {
    return getCourseCoreBackgroundMediaDirectory(orgUuid, courseStructure.course_uuid, coreBackgroundImage)
  }
  if (courseStructure.thumbnail_image) {
    return getCourseThumbnailMediaDirectory(orgUuid, courseStructure.course_uuid, courseStructure.thumbnail_image)
  }
  return null
}

export default function EditCourseCore() {
  const inputRef = useRef<HTMLInputElement>(null)
  const session = useLHSession() as any
  const org = useOrg() as any
  const course = useCourse() as any
  const [localPreview, setLocalPreview] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const { syncChanges, cancelPendingSync, courseStructure, isLoading, isSaving } = useCourseFieldSync('editCourseCore')
  const withUnpublishedActivities = course ? course.withUnpublishedActivities : false

  useEffect(() => {
    return () => {
      cancelPendingSync()
      if (localPreview) URL.revokeObjectURL(localPreview)
    }
  }, [cancelPendingSync, localPreview])

  const showError = (message: string) => {
    toast.error(message, {
      duration: 3000,
      position: 'top-center',
    })
  }

  const validateFile = (file: File) => {
    if (!VALID_IMAGE_MIME_TYPES.includes(file.type as ValidImageMimeType)) {
      showError(`Invalid file type: ${file.type}. Please upload only PNG or JPG/JPEG images`)
      return false
    }

    if (file.size > MAX_FILE_SIZE) {
      showError(`File size (${(file.size / 1024 / 1024).toFixed(2)}MB) exceeds the 8MB limit`)
      return false
    }

    return true
  }

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file || !courseStructure?.course_uuid) return
    if (!validateFile(file)) {
      event.target.value = ''
      return
    }

    const blobUrl = URL.createObjectURL(file)
    setLocalPreview((current) => {
      if (current) URL.revokeObjectURL(current)
      return blobUrl
    })

    setIsUploading(true)
    try {
      const formData = new FormData()
      formData.append('background', file)

      const res = await updateCourseCoreBackground(
        courseStructure.course_uuid,
        formData,
        session.data?.tokens?.access_token
      )

      if (res.success === false) {
        showError(res.HTTPmessage)
        return
      }

      const cacheKey = getCourseMetaCacheKey(courseStructure.course_uuid, withUnpublishedActivities)
      await mutate(cacheKey)
      setLocalPreview(null)
      toast.success('CORE background updated successfully', {
        duration: 3000,
        position: 'top-center',
      })
    } catch (err) {
      showError('Failed to update CORE background')
    } finally {
      setIsUploading(false)
      event.target.value = ''
    }
  }

  if (isLoading || !courseStructure) {
    return <div className="p-10 text-sm text-gray-500">Loading CORE settings...</div>
  }

  const previewUrl = localPreview || getBackgroundPreviewUrl(courseStructure, org?.org_uuid)
  const coreCourseEnabled = Boolean(courseStructure.core_course)

  return (
    <div className="h-full">
      <div className="h-6" />
      <div className="px-10 pb-10">
        <div className="bg-white rounded-xl shadow-xs p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold text-gray-800">CORE course</h3>
              <p className="mt-1 text-xs leading-5 text-gray-500">
                Show this course in the learner dashboard CORE section and make its profile widget available.
              </p>
            </div>
            <Switch
              checked={coreCourseEnabled}
              onCheckedChange={(checked) => syncChanges({ core_course: checked }, true)}
              disabled={isSaving}
            />
          </div>

          {coreCourseEnabled ? (
            <div className="mt-6 border-t border-gray-100 pt-6">
              <div className="mb-3 flex items-center gap-2">
                <ImageIcon className="h-4 w-4 text-gray-600" />
                <h3 className="text-sm font-semibold text-gray-800">Background</h3>
              </div>
              <div className="max-w-2xl">
                {previewUrl ? (
                  <SafeImage
                    src={previewUrl}
                    alt="CORE course background preview"
                    className={`${isUploading ? 'animate-pulse' : ''} w-full aspect-video object-cover rounded-lg border border-gray-200`}
                  />
                ) : (
                  <div className="flex aspect-video w-full items-center justify-center rounded-lg border border-dashed border-gray-200 bg-gray-50 text-sm text-gray-400">
                    No background image
                  </div>
                )}
              </div>
              <div className="mt-4 flex items-center gap-2">
                <input
                  ref={inputRef}
                  type="file"
                  className="hidden"
                  accept=".jpg,.jpeg,.png"
                  onChange={handleFileChange}
                />
                <button
                  type="button"
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={() => inputRef.current?.click()}
                  disabled={isUploading}
                >
                  {isUploading ? <ArrowBigUpDash size={16} className="animate-bounce" /> : <UploadCloud size={16} />}
                  {isUploading ? 'Uploading...' : 'Upload image'}
                </button>
                <p className="text-xs text-gray-500">Uses the course thumbnail when no CORE background is uploaded.</p>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
