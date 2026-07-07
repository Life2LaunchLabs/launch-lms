'use client'
import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { useOrg } from '@components/Contexts/OrgContext'
import { linkCommunityToCourse, unlinkCommunityFromCourse, Community } from '@services/communities/communities'
import { getOrgCourses } from '@services/courses/courses'
import { revalidateTags } from '@services/utils/ts/requests'
import Modal from '@components/Objects/StyledElements/Modal/Modal'
import { Loader2, Link2, Unlink, Search } from 'lucide-react'

interface LinkCourseModalProps {
  isOpen: boolean
  onClose: () => void
  community: Community
  orgSlug: string
}

interface Course {
  id: number
  course_uuid: string
  name: string
  description: string
}

export function LinkCourseModal({
  isOpen,
  onClose,
  community,
  orgSlug,
}: LinkCourseModalProps) {
  const session = useLHSession() as any
  const org = useOrg() as any
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [courses, setCourses] = useState<Course[]>([])
  const [isLoadingCourses, setIsLoadingCourses] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCourse, setSelectedCourse] = useState<string | null>(null)

  const accessToken = session?.data?.tokens?.access_token

  useEffect(() => {
    const fetchCourses = async () => {
      if (!isOpen || !orgSlug) return

      setIsLoadingCourses(true)
      try {
        const result = await getOrgCourses(orgSlug, null, accessToken)
        setCourses(result || [])
      } catch (error) {
        console.error('Failed to fetch courses:', error)
      } finally {
        setIsLoadingCourses(false)
      }
    }

    fetchCourses()
  }, [isOpen, orgSlug, accessToken])

  const filteredCourses = courses.filter(course =>
    course.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const handleLink = async () => {
    if (!selectedCourse) return

    setIsSubmitting(true)
    try {
      await linkCommunityToCourse(
        community.community_uuid,
        selectedCourse,
        accessToken
      )
      await revalidateTags(['communities'], orgSlug)
      router.refresh()
      onClose()
    } catch (error) {
      console.error('Failed to link course:', error)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleUnlink = async () => {
    setIsSubmitting(true)
    try {
      await unlinkCommunityFromCourse(
        community.community_uuid,
        accessToken
      )
      await revalidateTags(['communities'], orgSlug)
      router.refresh()
      onClose()
    } catch (error) {
      console.error('Failed to unlink course:', error)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Modal
      isDialogOpen={isOpen}
      onOpenChange={(open) => !open && onClose()}
      dialogTitle="Link Community to Course"
      dialogDescription="Connect this community to a course for course-specific discussions"
      minWidth="sm"
      dialogContent={
        <div className="space-y-6">
          {community.course_id && (
            <div className="p-4 bg-muted border border-border rounded-lg">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">
                    Currently linked to a course
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Unlink to connect to a different course
                  </p>
                </div>
                <button
                  onClick={handleUnlink}
                  disabled={isSubmitting}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Unlink size={14} />
                  )}
                  Unlink
                </button>
              </div>
            </div>
          )}

          {!community.course_id && (
            <>
              {/* Search */}
              <div className="relative">
                <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search courses..."
                  className="w-full pl-10 pr-4 py-2.5 border border-border rounded-lg focus:ring-2 focus:ring-black/20 focus:border-transparent outline-none transition-all"
                />
              </div>

              {/* Course List */}
              <div className="max-h-64 overflow-y-auto border border-border rounded-lg">
                {isLoadingCourses ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 size={24} className="animate-spin text-muted-foreground" />
                  </div>
                ) : filteredCourses.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    No courses found
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {filteredCourses.map((course) => (
                      <button
                        key={course.course_uuid}
                        onClick={() => setSelectedCourse(course.course_uuid)}
                        className={`w-full text-left px-4 py-3 hover:bg-muted transition-colors ${
                          selectedCourse === course.course_uuid
                            ? 'bg-muted border-l-2 border-black'
                            : ''
                        }`}
                      >
                        <p className="font-medium text-foreground text-sm">
                          {course.name}
                        </p>
                        {course.description && (
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                            {course.description}
                          </p>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-3 pt-4 border-t border-border">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleLink}
                  disabled={isSubmitting || !selectedCourse}
                  className="px-4 py-2 text-sm font-medium text-white bg-black hover:bg-black/90 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {isSubmitting ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Link2 size={16} />
                  )}
                  Link Course
                </button>
              </div>
            </>
          )}
        </div>
      }
    />
  )
}

export default LinkCourseModal
