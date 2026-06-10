'use client'

import FormLayout, {
  FormField,
  FormLabelAndMessage,
  Textarea,
} from '@components/Objects/StyledElements/Form/Form'
import * as Form from '@radix-ui/react-form'
import { useFormik } from 'formik'
import React, { useCallback, useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useCourseFieldSync } from '@components/Contexts/CourseContext'
import FormTagInput from '@components/Objects/StyledElements/Form/TagInput'
import LearningItemsList from '../EditCourseGeneral/LearningItemsList'

const validate = (values: any, t: any) => {
  const errors = {} as any

  if (!values.learnings) {
    errors.learnings = t('dashboard.courses.general.form.learnings_required')
  } else {
    try {
      const learningItems = JSON.parse(values.learnings)
      if (!Array.isArray(learningItems)) {
        errors.learnings = t('dashboard.courses.general.form.learnings_invalid_format')
      } else if (learningItems.length === 0) {
        errors.learnings = t('dashboard.courses.general.form.learnings_min_items')
      } else if (learningItems.some((item) => !item.text || item.text.trim() === '')) {
        errors.learnings = t('dashboard.courses.general.form.learnings_empty_text')
      }
    } catch {
      errors.learnings = t('dashboard.courses.general.form.learnings_invalid_json')
    }
  }

  return errors
}

export default function EditCourseAbout() {
  const { t } = useTranslation()
  const previousValuesRef = useRef<any>(null)
  const {
    syncChanges,
    cancelPendingSync,
    courseStructure,
    isLoading,
    isSaving,
  } = useCourseFieldSync('editCourseAbout')

  const initializeLearnings = useCallback((learnings: any) => {
    const fromPlainText = (text: string) => {
      const parts = text
        .split(/\n|,/)
        .map((item) => item.trim())
        .filter(Boolean)

      if (parts.length > 0) {
        return JSON.stringify(parts.map((item, index) => ({
          id: `imported-${index + 1}`,
          text: item,
          emoji: '📝',
        })))
      }

      return JSON.stringify([{ id: 'default-1', text, emoji: '📝' }])
    }

    if (!learnings) return JSON.stringify([{ id: 'default-1', text: '', emoji: '📝' }])

    try {
      const parsed = JSON.parse(learnings)
      if (Array.isArray(parsed)) return learnings
      if (typeof learnings === 'string') return fromPlainText(learnings)
      return JSON.stringify([{ id: 'default-1', text: '', emoji: '📝' }])
    } catch {
      if (typeof learnings === 'string') return fromPlainText(learnings)
      return JSON.stringify([{ id: 'default-1', text: '', emoji: '📝' }])
    }
  }, [])

  const initialValues = useMemo(() => ({
    about: courseStructure?.about || '',
    learnings: initializeLearnings(courseStructure?.learnings || ''),
    tags: courseStructure?.tags || '',
  }), [courseStructure?.about, courseStructure?.learnings, courseStructure?.tags, initializeLearnings])

  const formik = useFormik({
    initialValues,
    validate: (values) => validate(values, t),
    onSubmit: async () => {},
    enableReinitialize: true,
  }) as any

  useEffect(() => {
    if (isLoading || isSaving) return

    const changes: any = {}
    Object.keys(formik.values).forEach((key) => {
      if (formik.values[key] !== formik.initialValues[key]) {
        changes[key] = formik.values[key]
      }
    })

    if (Object.keys(changes).length > 0) {
      const changesStr = JSON.stringify(changes)
      const previousStr = JSON.stringify(previousValuesRef.current)
      if (changesStr !== previousStr) {
        previousValuesRef.current = changes
        syncChanges(changes)
      }
    } else {
      previousValuesRef.current = null
    }
  }, [formik.values, formik.initialValues, isLoading, isSaving, syncChanges])

  useEffect(() => {
    return () => cancelPendingSync()
  }, [cancelPendingSync])

  if (isLoading || !courseStructure) return <div>{t('dashboard.courses.settings.loading')}</div>

  return (
    <div className="px-10 pb-10 pt-6">
      <section className="rounded-xl bg-white p-6 shadow-xs">
        <h2 className="text-lg font-bold text-gray-900">About</h2>
        <FormLayout onSubmit={formik.handleSubmit} className="mt-5">
          <div className="space-y-6">
            <div>
              <FormField name="about">
                <FormLabelAndMessage label={t('dashboard.courses.general.form.about_label')} message={formik.errors.about} />
                <Form.Control asChild>
                  <Textarea
                    style={{ backgroundColor: 'white', height: '200px', minHeight: '200px' }}
                    onChange={formik.handleChange}
                    value={formik.values.about}
                    disabled={isSaving}
                  />
                </Form.Control>
              </FormField>
            </div>

            <div>
              <FormField name="learnings">
                <FormLabelAndMessage label={t('dashboard.courses.general.form.learnings_label')} message={formik.touched.learnings ? formik.errors.learnings : undefined} />
                <Form.Control asChild>
                  <LearningItemsList
                    value={formik.values.learnings}
                    onChange={(value) => {
                      formik.setFieldTouched('learnings', true, false)
                      formik.setFieldValue('learnings', value)
                    }}
                    error={formik.touched.learnings ? formik.errors.learnings : undefined}
                  />
                </Form.Control>
              </FormField>
            </div>

            <div>
              <FormField name="tags">
                <FormLabelAndMessage label={t('dashboard.courses.general.form.tags_label')} message={formik.errors.tags} />
                <Form.Control asChild>
                  <FormTagInput
                    placeholder={t('dashboard.courses.general.form.tags_placeholder')}
                    onChange={(value) => formik.setFieldValue('tags', value)}
                    value={formik.values.tags}
                  />
                </Form.Control>
              </FormField>
            </div>
          </div>
        </FormLayout>
      </section>
    </div>
  )
}
