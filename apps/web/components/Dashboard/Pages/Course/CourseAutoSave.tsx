'use client'

import React, { useCallback, useEffect, useRef } from 'react'
import toast from 'react-hot-toast'
import { mutate } from 'swr'
import { useRouter } from 'next/navigation'
import { useCourse, useCourseDispatch, useDebounceManager, getCourseMetaCacheKey } from '@components/Contexts/CourseContext'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { useOrg } from '@components/Contexts/OrgContext'
import { updateCourse } from '@services/courses/courses'
import { updateCourseOrderStructure } from '@services/courses/chapters'
import { updateCertification } from '@services/courses/certifications'
import { revalidateTags } from '@services/utils/ts/requests'

export default function CourseAutoSave({ orgslug }: { orgslug: string }) {
  const course = useCourse() as any
  const dispatchCourse = useCourseDispatch() as any
  const session = useLHSession() as any
  const org = useOrg() as any
  const router = useRouter()
  const debounceManager = useDebounceManager()
  const saveTimerRef = useRef<NodeJS.Timeout | null>(null)
  const saveInProgressRef = useRef(false)

  const courseStructure = course?.courseStructure
  const saved = course?.isSaved ?? true
  const isSaving = course?.isSaving ?? false
  const withUnpublishedActivities = course?.withUnpublishedActivities ?? false

  const cacheKey = courseStructure?.course_uuid
    ? getCourseMetaCacheKey(courseStructure.course_uuid, withUnpublishedActivities)
    : null

  const saveCourseState = useCallback(async () => {
    if (saved || isSaving || saveInProgressRef.current || !courseStructure?.course_uuid) return

    saveInProgressRef.current = true
    debounceManager.cancelAll()
    dispatchCourse({ type: 'setSaving', payload: true })
    dispatchCourse({ type: 'setSaveError', payload: null })

    try {
      if (course.courseOrder && Object.keys(course.courseOrder).length > 0) {
        await updateCourseOrderStructure(
          courseStructure.course_uuid,
          course.courseOrder,
          session.data?.tokens?.access_token
        )
      }

      const dataToSave = { ...courseStructure }
      delete dataToSave._certificationData

      await updateCourse(courseStructure.course_uuid, dataToSave, session.data?.tokens?.access_token)

      if (courseStructure._certificationData) {
        const certData = courseStructure._certificationData
        await updateCertification(
          certData.certification_uuid,
          certData.config,
          org?.id,
          session.data?.tokens?.access_token
        )
      }

      if (cacheKey) {
        await mutate(cacheKey, courseStructure, { revalidate: false })
      }

      await revalidateTags(['courses'], orgslug)
      dispatchCourse({ type: 'setIsSaved' })
      dispatchCourse({ type: 'commitChanges' })
      router.refresh()
    } catch (error) {
      console.error('Autosave failed:', error)
      dispatchCourse({ type: 'setSaveError', payload: 'Autosave failed' })
      dispatchCourse({ type: 'setIsNotSaved' })
      toast.error('Failed to autosave course changes')
    } finally {
      dispatchCourse({ type: 'setSaving', payload: false })
      saveInProgressRef.current = false
    }
  }, [
    saved,
    isSaving,
    courseStructure,
    course.courseOrder,
    cacheKey,
    session.data?.tokens?.access_token,
    org?.id,
    debounceManager,
    dispatchCourse,
    router,
    orgslug,
  ])

  useEffect(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }

    if (!saved && !isSaving && !saveInProgressRef.current) {
      saveTimerRef.current = setTimeout(() => {
        saveCourseState()
      }, 900)
    }

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [saved, isSaving, courseStructure, saveCourseState])

  return null
}
