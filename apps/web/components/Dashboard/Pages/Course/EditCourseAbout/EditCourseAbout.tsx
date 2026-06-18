'use client'

import FormLayout, {
  FormField,
  FormLabelAndMessage,
  Input,
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
    badge_invite_eyebrow: courseStructure?.seo?.badge_invite_eyebrow || '',
    badge_invite_headline: courseStructure?.seo?.badge_invite_headline || '',
    badge_invite_subheadline: courseStructure?.seo?.badge_invite_subheadline || '',
    badge_invite_primary_stat: courseStructure?.seo?.badge_invite_primary_stat || '',
    badge_invite_secondary_stat: courseStructure?.seo?.badge_invite_secondary_stat || '',
    badge_invite_testimonial: courseStructure?.seo?.badge_invite_testimonial || '',
  }), [
    courseStructure?.about,
    courseStructure?.learnings,
    courseStructure?.tags,
    courseStructure?.seo,
    initializeLearnings,
  ])

  const formik = useFormik({
    initialValues,
    validate: (values) => validate(values, t),
    onSubmit: async () => {},
    enableReinitialize: true,
  }) as any

  useEffect(() => {
    if (isLoading || isSaving) return

    const directFields = ['about', 'learnings', 'tags']
    const inviteFields = [
      'badge_invite_eyebrow',
      'badge_invite_headline',
      'badge_invite_subheadline',
      'badge_invite_primary_stat',
      'badge_invite_secondary_stat',
      'badge_invite_testimonial',
    ]
    const changes: any = {}

    directFields.forEach((key) => {
      if (formik.values[key] !== formik.initialValues[key]) {
        changes[key] = formik.values[key]
      }
    })

    const inviteChanged = inviteFields.some((key) => formik.values[key] !== formik.initialValues[key])
    if (inviteChanged) {
      changes.seo = {
        ...(courseStructure?.seo || {}),
        badge_invite_eyebrow: formik.values.badge_invite_eyebrow,
        badge_invite_headline: formik.values.badge_invite_headline,
        badge_invite_subheadline: formik.values.badge_invite_subheadline,
        badge_invite_primary_stat: formik.values.badge_invite_primary_stat,
        badge_invite_secondary_stat: formik.values.badge_invite_secondary_stat,
        badge_invite_testimonial: formik.values.badge_invite_testimonial,
      }
    }

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
  }, [courseStructure?.seo, formik.values, formik.initialValues, isLoading, isSaving, syncChanges])

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

      <section className="mt-6 rounded-xl bg-white p-6 shadow-xs">
        <h2 className="text-lg font-bold text-gray-900">Badge invite page</h2>
        <p className="mt-1 text-sm text-gray-500">
          These fields customize the public landing page people see when a badge invite link is shared.
        </p>
        <FormLayout onSubmit={formik.handleSubmit} className="mt-5">
          <div className="space-y-6">
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <FormField name="badge_invite_eyebrow">
                <FormLabelAndMessage label="Eyebrow" message={formik.errors.badge_invite_eyebrow} />
                <Form.Control asChild>
                  <Input
                    style={{ backgroundColor: 'white' }}
                    onChange={formik.handleChange}
                    value={formik.values.badge_invite_eyebrow}
                    disabled={isSaving}
                    placeholder="New badge available"
                  />
                </Form.Control>
              </FormField>

              <FormField name="badge_invite_headline">
                <FormLabelAndMessage label="Headline" message={formik.errors.badge_invite_headline} />
                <Form.Control asChild>
                  <Input
                    style={{ backgroundColor: 'white' }}
                    onChange={formik.handleChange}
                    value={formik.values.badge_invite_headline}
                    disabled={isSaving}
                    placeholder="Master a skill employers notice"
                  />
                </Form.Control>
              </FormField>
            </div>

            <FormField name="badge_invite_subheadline">
              <FormLabelAndMessage label="Subheadline" message={formik.errors.badge_invite_subheadline} />
              <Form.Control asChild>
                <Textarea
                  style={{ backgroundColor: 'white', height: '120px', minHeight: '120px' }}
                  onChange={formik.handleChange}
                  value={formik.values.badge_invite_subheadline}
                  disabled={isSaving}
                  placeholder="Explain who this badge is for and why earning it matters."
                />
              </Form.Control>
            </FormField>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <FormField name="badge_invite_primary_stat">
                <FormLabelAndMessage label="Primary stat" message={formik.errors.badge_invite_primary_stat} />
                <Form.Control asChild>
                  <Input
                    style={{ backgroundColor: 'white' }}
                    onChange={formik.handleChange}
                    value={formik.values.badge_invite_primary_stat}
                    disabled={isSaving}
                    placeholder="10,000+ learners"
                  />
                </Form.Control>
              </FormField>

              <FormField name="badge_invite_secondary_stat">
                <FormLabelAndMessage label="Secondary stat" message={formik.errors.badge_invite_secondary_stat} />
                <Form.Control asChild>
                  <Input
                    style={{ backgroundColor: 'white' }}
                    onChange={formik.handleChange}
                    value={formik.values.badge_invite_secondary_stat}
                    disabled={isSaving}
                    placeholder="98% completion satisfaction"
                  />
                </Form.Control>
              </FormField>
            </div>

            <FormField name="badge_invite_testimonial">
              <FormLabelAndMessage label="Testimonial" message={formik.errors.badge_invite_testimonial} />
              <Form.Control asChild>
                <Textarea
                  style={{ backgroundColor: 'white', height: '120px', minHeight: '120px' }}
                  onChange={formik.handleChange}
                  value={formik.values.badge_invite_testimonial}
                  disabled={isSaving}
                  placeholder="A short learner quote or credibility note."
                />
              </Form.Control>
            </FormField>
          </div>
        </FormLayout>
      </section>
    </div>
  )
}
