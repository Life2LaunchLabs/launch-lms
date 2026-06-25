'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Download, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { mutate } from 'swr'
import ConfirmationModal from '@components/Objects/StyledElements/ConfirmationModal/ConfirmationModal'
import { useCourse } from '@components/Contexts/CourseContext'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import EditCourseAccess from './EditCourseAccess/EditCourseAccess'
import EditCourseContributors from './EditCourseContributors/EditCourseContributors'
import { deleteCourseFromBackend } from '@services/courses/courses'
import { exportCourse, downloadBlob, ExportStatus } from '@services/courses/transfer'
import { exportToast } from '@components/Objects/StyledElements/Toast/ExportToast'
import { getUriWithOrg, routePaths } from '@services/config/config'

export default function CourseSettingsTab({
  orgslug,
  canConfigureCoreCourse,
  permissions,
}: {
  orgslug: string
  canConfigureCoreCourse: boolean
  permissions: {
    canManageAccess: boolean
    canManageContributors: boolean
    canUpdate: boolean
  }
}) {
  const course = useCourse() as any
  const session = useLHSession() as any
  const router = useRouter()
  const courseStructure = course?.courseStructure
  const [isExporting, setIsExporting] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  if (!courseStructure) return null

  const handleExport = async () => {
    if (isExporting) return
    setIsExporting(true)
    const courseName = courseStructure?.name
    const toastId = exportToast.start('single', courseName)

    try {
      const blob = await exportCourse(
        courseStructure.course_uuid,
        session.data?.tokens?.access_token,
        (progress, status) => {
          exportToast.update(toastId, status as ExportStatus, progress, courseName)
        }
      )
      const timestamp = new Date().toISOString().split('T')[0]
      downloadBlob(blob, `${courseName || courseStructure.course_uuid}-${timestamp}.zip`)
      exportToast.complete(toastId, courseName)
    } catch (error: any) {
      exportToast.error(toastId, error.message || 'Export failed', courseName)
    } finally {
      setIsExporting(false)
    }
  }

  const handleDelete = async () => {
    if (isDeleting) return
    setIsDeleting(true)
    const toastId = toast.loading('Deleting course...')

    try {
      await deleteCourseFromBackend(courseStructure.course_uuid, session.data?.tokens?.access_token)
      mutate((key) => typeof key === 'string' && key.includes('/courses/'), undefined, { revalidate: true })
      toast.success('Course deleted')
      router.push(getUriWithOrg(orgslug, routePaths.org.dash.courses()))
    } catch {
      toast.error('Failed to delete course')
    } finally {
      toast.dismiss(toastId)
      setIsDeleting(false)
    }
  }

  return (
    <div className="space-y-6 px-10 pb-10 pt-6">
      {permissions.canManageAccess && <EditCourseAccess orgslug={orgslug} />}
      {permissions.canManageContributors && <EditCourseContributors orgslug={orgslug} />}

      {permissions.canUpdate && (
        <section className="rounded-xl bg-white p-6 shadow-xs">
          <h2 className="text-lg font-bold text-gray-900">Course Utilities</h2>
          <div className="mt-4 divide-y divide-gray-100">
            <div className="flex items-center justify-between gap-6 py-4 first:pt-0">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">Export course</h3>
                <p className="mt-1 max-w-2xl text-xs leading-5 text-gray-500">
                  Download a portable archive of this course and its content.
                </p>
              </div>
              <button
                type="button"
                onClick={handleExport}
                disabled={isExporting}
                className="flex shrink-0 items-center gap-2 rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Download className="h-4 w-4" />
                <span>{isExporting ? 'Exporting...' : 'Export'}</span>
              </button>
            </div>

            <div className="flex items-center justify-between gap-6 py-4 last:pb-0">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">Delete course</h3>
                <p className="mt-1 max-w-2xl text-xs leading-5 text-gray-500">
                  Permanently delete this course and its content.
                </p>
              </div>
              <ConfirmationModal
                confirmationButtonText="Delete Course"
                confirmationMessage="This permanently deletes the course and its content. This action cannot be undone."
                dialogTitle="Delete Course?"
                dialogTrigger={
                <button
                  type="button"
                  disabled={isDeleting}
                  className="flex shrink-0 items-center gap-2 rounded-lg bg-rose-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-rose-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Trash2 className="h-4 w-4" />
                  <span>{isDeleting ? 'Deleting...' : 'Delete'}</span>
                </button>
                }
                functionToExecute={handleDelete}
                status="warning"
              />
            </div>
          </div>
        </section>
      )}
    </div>
  )
}
