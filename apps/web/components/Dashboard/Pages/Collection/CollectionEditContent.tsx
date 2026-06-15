'use client'

import React, { useMemo, useState } from 'react'
import useSWR from 'swr'
import { BookOpen, Download, Search, X } from 'lucide-react'
import { useCollection } from '@components/Contexts/CollectionContext'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { useOrg } from '@components/Contexts/OrgContext'
import AuthenticatedClientElement from '@components/Security/AuthenticatedClientElement'
import CreateCourseModal from '@components/Objects/Modals/Course/Create/CreateCourse'
import { ImportTypeSelector, LaunchLMSCourseImport, TutorCourseImport } from '@components/Objects/Modals/Course/Import'
import Modal from '@components/Objects/StyledElements/Modal/Modal'
import NewCourseButton from '@components/Objects/StyledElements/Buttons/NewCourseButton'
import CourseThumbnail, { removeCoursePrefix } from '@components/Objects/Thumbnails/CourseThumbnail'
import { usePlan } from '@components/Hooks/usePlan'
import { getAPIUrl } from '@services/config/config'
import { swrFetcher } from '@services/utils/ts/requests'

type ImportType = 'launch-lms' | 'tutor'

const CollectionEditContent: React.FC = () => {
  const session = useLHSession() as any
  const org = useOrg() as any
  const currentPlan = usePlan()
  const collection = useCollection()?.collection
  const accessToken = session?.data?.tokens?.access_token
  const [searchQuery, setSearchQuery] = useState('')
  const [newCourseModal, setNewCourseModal] = useState(false)
  const [importCourseModal, setImportCourseModal] = useState(false)
  const [selectedImportType, setSelectedImportType] = useState<ImportType | null>(null)

  const { data: courses = [], mutate } = useSWR<any[]>(
    collection?.collection_uuid && accessToken
      ? `${getAPIUrl()}collections/${collection.collection_uuid}/manage-courses`
      : null,
    (url) => swrFetcher(url, accessToken),
    { revalidateOnFocus: true }
  )

  const filteredCourses = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) return courses
    return courses.filter(
      (course: any) =>
        course.name?.toLowerCase().includes(query) ||
        course.description?.toLowerCase().includes(query) ||
        course.tags?.toLowerCase().includes(query)
    )
  }, [courses, searchQuery])

  if (!collection) return null

  const closeNewCourseModal = async () => {
    setNewCourseModal(false)
    await mutate()
  }

  const closeImportCourseModal = async () => {
    setImportCourseModal(false)
    setSelectedImportType(null)
    await mutate()
  }

  const handleImportModalChange = (open: boolean) => {
    setImportCourseModal(open)
    if (!open) {
      setSelectedImportType(null)
    }
  }

  const renderImportContent = () => {
    if (!org?.id || !org?.slug) return null

    if (selectedImportType === 'launch-lms') {
      return (
        <LaunchLMSCourseImport
          orgId={org.id}
          orgslug={org.slug}
          closeModal={closeImportCourseModal}
          collectionUuid={collection.collection_uuid}
        />
      )
    }

    if (selectedImportType === 'tutor') {
      return (
        <TutorCourseImport
          orgId={org.id}
          orgslug={org.slug}
          closeModal={closeImportCourseModal}
          collectionUuid={collection.collection_uuid}
        />
      )
    }

    return (
      <ImportTypeSelector
        currentPlan={currentPlan}
        onSelectType={(type) => setSelectedImportType(type)}
      />
    )
  }

  return (
    <div className="space-y-6 px-10 pb-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search courses"
            className="w-full rounded-lg bg-white py-2.5 pl-10 pr-10 text-sm nice-shadow focus:outline-none focus:ring-2 focus:ring-black"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <AuthenticatedClientElement checkMethod="roles" action="create" ressourceType="courses" orgId={org?.id}>
          <div className="flex flex-wrap items-center gap-2">
            <Modal
              isDialogOpen={importCourseModal}
              onOpenChange={handleImportModalChange}
              minHeight="md"
              minWidth={selectedImportType ? 'lg' : 'md'}
              dialogTitle={selectedImportType ? 'Import Courses' : 'Choose Import Type'}
              dialogDescription={`Import courses into ${collection.name}.`}
              dialogContent={renderImportContent()}
              dialogTrigger={
                <button className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-xs font-bold text-gray-800 nice-shadow transition-colors hover:bg-gray-50">
                  <Download className="h-4 w-4" />
                  Import Courses
                </button>
              }
            />
            <Modal
              isDialogOpen={newCourseModal}
              onOpenChange={setNewCourseModal}
              minHeight="md"
              minWidth="lg"
              dialogTitle="Create Course"
              dialogDescription={`Create a course in ${collection.name}.`}
              dialogContent={
                <CreateCourseModal
                  closeModal={closeNewCourseModal}
                  orgslug={org?.slug}
                  collectionUuid={collection.collection_uuid}
                />
              }
              dialogTrigger={
                <button>
                  <NewCourseButton />
                </button>
              }
            />
          </div>
        </AuthenticatedClientElement>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {filteredCourses.map((course: any) => (
          <CourseThumbnail
            key={course.course_uuid}
            customLink={`/dash/courses/course/${removeCoursePrefix(course.course_uuid)}/content`}
            course={course}
            orgslug={org?.slug}
            isDashboard
          />
        ))}
      </div>

      {filteredCourses.length === 0 && (
        <div className="flex items-center justify-center rounded-xl border-2 border-dashed border-gray-200 py-16 text-center">
          <div>
            <BookOpen className="mx-auto mb-3 h-9 w-9 text-gray-300" />
            <p className="text-sm text-gray-500">
              {searchQuery ? 'No courses match your search.' : 'This collection does not have any courses yet.'}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

export default CollectionEditContent
