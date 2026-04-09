'use client'
import React, { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { UploadCloud, Image as ImageIcon, ArrowBigUpDash, Library } from 'lucide-react'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { useOrg } from '@components/Contexts/OrgContext'
import { useCollection, useCollectionDispatch } from '@components/Contexts/CollectionContext'
import { updateCollectionThumbnail } from '@services/courses/collections'
import { getCollectionThumbnailMediaDirectory, getCourseThumbnailMediaDirectory } from '@services/media/media'
import { mutate } from 'swr'
import { getAPIUrl } from '@services/config/config'
import UnsplashImagePicker from '@components/Dashboard/Pages/Course/EditCourseGeneral/UnsplashImagePicker'
import toast from 'react-hot-toast'
import { Button } from '@components/ui/button'
import { SafeImage } from '@components/Objects/SafeImage'

const MAX_FILE_SIZE = 8_000_000
const VALID_IMAGE_MIME_TYPES = ['image/jpeg', 'image/jpg', 'image/png'] as const
type ValidImageMimeType = (typeof VALID_IMAGE_MIME_TYPES)[number]

const CollectionEditThumbnail: React.FC = () => {
  const router = useRouter()
  const session = useLHSession() as any
  const org = useOrg() as any
  const collectionState = useCollection()
  const dispatch = useCollectionDispatch()
  const collection = collectionState?.collection
  const accessToken = session?.data?.tokens?.access_token
  const imageInputRef = useRef<HTMLInputElement>(null)

  const [localThumbnail, setLocalThumbnail] = useState<{ file: File; url: string } | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [showUnsplashPicker, setShowUnsplashPicker] = useState(false)

  if (!collection) return null

  const courses = collection.courses || []

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

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (!validateFile(file)) { event.target.value = ''; return }
    const blobUrl = URL.createObjectURL(file)
    setLocalThumbnail({ file, url: blobUrl })
    await uploadThumbnail(file)
  }

  const handleUnsplashSelect = async (imageUrl: string) => {
    try {
      setIsLoading(true)
      const response = await fetch(imageUrl)
      const blob = await response.blob()
      if (!VALID_IMAGE_MIME_TYPES.includes(blob.type as ValidImageMimeType)) {
        throw new Error('Invalid image format')
      }
      const file = new File([blob], `unsplash_${Date.now()}.jpg`, { type: blob.type })
      if (!validateFile(file)) { setIsLoading(false); return }
      const blobUrl = URL.createObjectURL(file)
      setLocalThumbnail({ file, url: blobUrl })
      setShowUnsplashPicker(false)
      await uploadThumbnail(file)
    } catch {
      showError('Failed to fetch image from Unsplash.')
      setIsLoading(false)
    }
  }

  const uploadThumbnail = async (file: File) => {
    setIsLoading(true)
    try {
      const formData = new FormData()
      formData.append('thumbnail', file)
      const res = await updateCollectionThumbnail(collection.collection_uuid, formData, accessToken)
      mutate(`${getAPIUrl()}collections/${collection.collection_uuid}`)
      await new Promise((r) => setTimeout(r, 1000))
      if (res.success === false) {
        showError(res.HTTPmessage || 'Upload failed.')
      } else {
        setLocalThumbnail(null)
        if (dispatch && res.thumbnail_image) {
          dispatch({ type: 'setCollection', payload: { ...collection, thumbnail_image: res.thumbnail_image } })
        }
        toast.success('Cover photo updated.', { duration: 3000, position: 'top-center' })
        router.refresh()
      }
    } catch {
      showError('Failed to upload image.')
    } finally {
      setIsLoading(false)
    }
  }

  const getCurrentThumbnailUrl = () => {
    if (localThumbnail) return localThumbnail.url
    if (collection.thumbnail_image && org?.org_uuid) {
      return getCollectionThumbnailMediaDirectory(org.org_uuid, collection.collection_uuid, collection.thumbnail_image)
    }
    return null
  }

  const thumbnailUrl = getCurrentThumbnailUrl()

  return (
    <>
      <div className="sm:mx-10 mx-0 bg-white rounded-xl nice-shadow">
        <div className="flex flex-col gap-0">
          <div className="flex flex-col bg-gray-50 -space-y-1 px-5 py-3 mx-3 my-3 rounded-md">
            <h1 className="font-bold text-xl text-gray-800">Cover Photo</h1>
            <h2 className="text-gray-500 text-md">
              Upload a custom cover photo. If none is set, the collection card will display course thumbnails instead.
            </h2>
          </div>

          <div className="mx-5 my-5 space-y-6">
            {/* Preview */}
            <div className="aspect-video max-w-2xl bg-gray-100 rounded-xl overflow-hidden border border-gray-200">
              {thumbnailUrl ? (
                <SafeImage
                  src={thumbnailUrl}
                  alt="Collection cover"
                  className={`w-full h-full object-cover ${isLoading ? 'animate-pulse' : ''}`}
                />
              ) : courses.length > 0 ? (
                <div className="flex items-center justify-center h-full w-full bg-gray-100/50 relative">
                  <div className="flex -space-x-12 items-center justify-center w-full px-8">
                    {courses.slice(0, 3).map((course: any, index: number) => (
                      <div
                        key={course.course_uuid}
                        className="relative h-28 w-44 overflow-hidden rounded-lg border-2 border-white shadow-lg shrink-0"
                        style={{
                          backgroundImage: `url(${course.thumbnail_image
                            ? getCourseThumbnailMediaDirectory(org?.org_uuid, course.course_uuid, course.thumbnail_image)
                            : '/empty_thumbnail.png'})`,
                          backgroundSize: 'cover',
                          backgroundPosition: 'center',
                          zIndex: 3 - index,
                        }}
                      />
                    ))}
                  </div>
                  <p className="absolute bottom-3 text-xs text-gray-500 font-medium">
                    Auto-generated from course covers — upload a custom photo above
                  </p>
                </div>
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-gray-400">
                  <Library size={48} strokeWidth={1} />
                  <p className="text-sm mt-2">No cover photo set</p>
                </div>
              )}
            </div>

            {isLoading && (
              <div className="flex justify-start">
                <div className="font-medium text-sm text-green-800 bg-green-50 rounded-full px-4 py-2 flex items-center">
                  <ArrowBigUpDash size={16} className="mr-2 animate-bounce" />
                  Uploading…
                </div>
              </div>
            )}

            {!isLoading && (
              <div className="flex gap-3">
                <input
                  ref={imageInputRef}
                  type="file"
                  className="hidden"
                  accept=".jpg,.jpeg,.png"
                  onChange={handleFileChange}
                />
                <Button type="button" variant="outline" className="flex items-center gap-2" onClick={() => imageInputRef.current?.click()}>
                  <UploadCloud size={16} />
                  Upload Image
                </Button>
                <Button type="button" variant="outline" className="flex items-center gap-2" onClick={() => setShowUnsplashPicker(true)}>
                  <ImageIcon size={16} />
                  Browse Unsplash
                </Button>
              </div>
            )}

            <p className="text-xs text-gray-500">Supported formats: JPG, PNG — max 8 MB</p>
          </div>
        </div>
      </div>

      {showUnsplashPicker && (
        <UnsplashImagePicker
          onSelect={handleUnsplashSelect}
          onClose={() => setShowUnsplashPicker(false)}
        />
      )}
    </>
  )
}

export default CollectionEditThumbnail
