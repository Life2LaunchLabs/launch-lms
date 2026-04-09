'use client'
import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { useOrg } from '@components/Contexts/OrgContext'
import { useCollection, useCollectionDispatch } from '@components/Contexts/CollectionContext'
import { updateCollection } from '@services/courses/collections'
import { getOrgCourses } from '@services/courses/courses'
import { getCourseThumbnailMediaDirectory } from '@services/media/media'
import { mutate } from 'swr'
import { getAPIUrl } from '@services/config/config'
import { Loader2, Search, BookOpen, X, Plus } from 'lucide-react'
import toast from 'react-hot-toast'
import { Input } from '@components/ui/input'
import { Button } from '@components/ui/button'
import ConfirmationModal from '@components/Objects/StyledElements/ConfirmationModal/ConfirmationModal'

const CollectionEditContent: React.FC = () => {
  const router = useRouter()
  const session = useLHSession() as any
  const org = useOrg() as any
  const collectionState = useCollection()
  const dispatch = useCollectionDispatch()
  const collection = collectionState?.collection
  const accessToken = session?.data?.tokens?.access_token

  const [allCourses, setAllCourses] = useState<any[]>([])
  const [isLoadingCourses, setIsLoadingCourses] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (!org?.slug) return
    setIsLoadingCourses(true)
    getOrgCourses(org.slug, null, accessToken, true)
      .then((res: any) => setAllCourses(res || []))
      .catch(() => setAllCourses([]))
      .finally(() => setIsLoadingCourses(false))
  }, [org?.slug, accessToken])

  if (!collection) return null

  const collectionCourseUuids = new Set((collection.courses || []).map((c: any) => c.course_uuid))

  const availableCourses = allCourses.filter(
    (c: any) => !collectionCourseUuids.has(c.course_uuid) &&
      (searchQuery === '' || c.name.toLowerCase().includes(searchQuery.toLowerCase()))
  )

  const handleRemoveCourse = async (courseId: number) => {
    if (!collection) return
    setIsSubmitting(true)
    const newCourseIds = collection.courses.filter((c: any) => c.id !== courseId).map((c: any) => c.id)
    try {
      const result = await updateCollection(collection.collection_uuid, { courses: newCourseIds }, accessToken)
      mutate(`${getAPIUrl()}collections/${collection.collection_uuid}`)
      if (dispatch && result) {
        dispatch({ type: 'setCollection', payload: { ...collection, courses: collection.courses.filter((c: any) => c.id !== courseId) } })
      }
      toast.success('Course removed from collection.')
      router.refresh()
    } catch {
      toast.error('Failed to remove course.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleAddCourse = async (course: any) => {
    if (!collection) return
    setIsSubmitting(true)
    const newCourseIds = [...collection.courses.map((c: any) => c.id), course.id]
    try {
      const result = await updateCollection(collection.collection_uuid, { courses: newCourseIds }, accessToken)
      mutate(`${getAPIUrl()}collections/${collection.collection_uuid}`)
      if (dispatch && result) {
        dispatch({ type: 'setCollection', payload: { ...collection, courses: [...collection.courses, course] } })
      }
      toast.success(`"${course.name}" added to collection.`)
      router.refresh()
    } catch {
      toast.error('Failed to add course.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="space-y-6 sm:mx-10 mx-0">
      {/* Current courses in collection */}
      <div className="bg-white rounded-xl nice-shadow">
        <div className="flex flex-col bg-gray-50 -space-y-1 px-5 py-3 mx-3 my-3 rounded-md">
          <h1 className="font-bold text-xl text-gray-800">Courses in Collection</h1>
          <h2 className="text-gray-500 text-md">
            {collection.courses.length} {collection.courses.length === 1 ? 'course' : 'courses'} currently in this collection.
          </h2>
        </div>
        <div className="mx-5 my-5">
          {collection.courses.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <BookOpen size={32} className="mx-auto mb-2 text-gray-300" />
              <p className="text-sm">No courses in this collection yet. Add some below.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {collection.courses.map((course: any) => (
                <div key={course.course_uuid} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-100">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-16 h-12 rounded-md overflow-hidden bg-gray-200 shrink-0"
                      style={{
                        backgroundImage: `url(${course.thumbnail_image
                          ? getCourseThumbnailMediaDirectory(org?.org_uuid, course.course_uuid, course.thumbnail_image)
                          : '/empty_thumbnail.png'})`,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                      }}
                    />
                    <div>
                      <p className="font-medium text-sm text-gray-900">{course.name}</p>
                      {course.description && (
                        <p className="text-xs text-gray-500 line-clamp-1 mt-0.5">{course.description}</p>
                      )}
                    </div>
                  </div>
                  <ConfirmationModal
                    confirmationButtonText="Remove"
                    confirmationMessage={`Remove "${course.name}" from this collection?`}
                    dialogTitle="Remove Course?"
                    dialogTrigger={
                      <button
                        disabled={isSubmitting}
                        className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-red-600 hover:text-red-700 bg-white border border-red-200 hover:border-red-300 rounded-lg transition-colors disabled:opacity-50"
                      >
                        <X size={12} />
                        Remove
                      </button>
                    }
                    functionToExecute={() => handleRemoveCourse(course.id)}
                    status="warning"
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Add courses */}
      <div className="bg-white rounded-xl nice-shadow">
        <div className="flex flex-col bg-gray-50 -space-y-1 px-5 py-3 mx-3 my-3 rounded-md">
          <h1 className="font-bold text-xl text-gray-800">Add Courses</h1>
          <h2 className="text-gray-500 text-md">Search and add courses from your organization.</h2>
        </div>
        <div className="mx-5 my-5 space-y-4">
          <div className="relative max-w-md">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <Input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search courses…"
              className="pl-9"
            />
          </div>
          <div className="max-h-80 overflow-y-auto border border-gray-200 rounded-lg">
            {isLoadingCourses ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 size={24} className="animate-spin text-gray-400" />
              </div>
            ) : availableCourses.length === 0 ? (
              <div className="text-center py-10 text-gray-400">
                <BookOpen size={28} className="mx-auto mb-2 text-gray-300" />
                <p className="text-sm">
                  {searchQuery ? 'No courses match your search.' : 'All courses are already in this collection.'}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {availableCourses.map((course: any) => (
                  <div key={course.course_uuid} className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-14 h-10 rounded-md overflow-hidden bg-gray-200 shrink-0"
                        style={{
                          backgroundImage: `url(${course.thumbnail_image
                            ? getCourseThumbnailMediaDirectory(org?.org_uuid, course.course_uuid, course.thumbnail_image)
                            : '/empty_thumbnail.png'})`,
                          backgroundSize: 'cover',
                          backgroundPosition: 'center',
                        }}
                      />
                      <div>
                        <p className="font-medium text-sm text-gray-900">{course.name}</p>
                        {course.description && (
                          <p className="text-xs text-gray-500 line-clamp-1">{course.description}</p>
                        )}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={isSubmitting}
                      onClick={() => handleAddCourse(course)}
                      className="flex items-center gap-1 text-xs"
                    >
                      <Plus size={12} />
                      Add
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default CollectionEditContent
