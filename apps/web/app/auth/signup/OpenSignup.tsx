'use client'
import { useFormik } from 'formik'
import { useSearchParams } from 'next/navigation'
import React from 'react'
import FormLayout, {
  FormField,
  FormLabelAndMessage,
  Input,
  Textarea,
} from '@components/Objects/StyledElements/Form/Form'
import * as Form from '@radix-ui/react-form'
import { AlertTriangle } from 'lucide-react'
import Link from 'next/link'
import { signup } from '@services/auth/auth'
import { useOrg } from '@components/Contexts/OrgContext'
import { useAuth } from '@components/Contexts/AuthContext'
import { getUriWithOrg } from '@services/config/config'
import { useTranslation } from 'react-i18next'
import { PasswordStrengthIndicator, validatePasswordStrength } from '@components/Auth/PasswordStrengthIndicator'

const validate = (values: any, t: any) => {
  const errors: any = {}

  if (!values.email) {
    errors.email = t('validation.required')
  } else if (!/^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(values.email)) {
    errors.email = t('validation.invalid_email')
  }

  if (!values.password) {
    errors.password = t('validation.required')
  } else {
    const passwordValidation = validatePasswordStrength(values.password)
    if (!passwordValidation.isValid) {
      errors.password = t('auth.password_requirements_not_met')
    }
  }

  if (!values.username) {
    errors.username = t('validation.required')
  } else if (values.username.length < 4) {
    errors.username = t('validation.username_min_length')
  }

  // Bio is optional - no validation required

  return errors
}

function OpenSignUpComponent({ createOrgMode = false }: { createOrgMode?: boolean }) {
  const { t } = useTranslation()
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const org = useOrg() as any
  const { signIn } = useAuth()
  const searchParams = useSearchParams()
  const [error, setError] = React.useState('')
  const nextUrl = searchParams.get('next')
  const createOrgRedirect = getUriWithOrg(org?.slug, '/signup?mode=create-org')
  const formik = useFormik({
    initialValues: {
      org_slug: org?.slug,
      org_id: org?.id,
      email: '',
      password: '',
      username: '',
      bio: '',
      first_name: '',
      last_name: '',
    },
    validate: (values) => validate(values, t),
    enableReinitialize: true,
    onSubmit: async (values) => {
      setError('')
      setIsSubmitting(true)
      let res = await signup(values)
      let result = await res.json()
      if (res.status == 200) {
        if (result?.email_verified === false) {
          setError(t('auth.email_not_verified_message'))
          setIsSubmitting(false)
          return
        }

        const callbackUrl = `${window.location.origin}/`
        const signInRes = await signIn('credentials', {
          redirect: false,
          email: values.email,
          password: values.password,
          callbackUrl,
        })

        if (signInRes && signInRes.error) {
          setError(signInRes.error || t('auth.wrong_email_password'))
          setIsSubmitting(false)
          return
        }

        window.location.href = callbackUrl
        return
      } else if (
        res.status == 401 ||
        res.status == 400 ||
        res.status == 404 ||
        res.status == 409
      ) {
        setError(result.detail)
        setIsSubmitting(false)
      } else {
        setError(t('common.something_went_wrong'))
        setIsSubmitting(false)
      }
    },
  })

  return (
    <div className="m-auto w-full max-w-sm px-6 py-8 sm:py-0">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{t('auth.create_account')}</h1>
        <p className="text-gray-500 mt-1">
          {createOrgMode ? 'Create your user account first, then we will walk you through setting up an organization.' : t('auth.fill_in_details')}
        </p>
      </div>

      {/* Error/Success Messages */}
      {error && (
        <div className="flex items-center gap-3 bg-red-100 rounded-xl text-red-900 p-4 mb-6 nice-shadow">
          <AlertTriangle size={18} className="shrink-0" />
          <div className="font-bold text-sm">{error}</div>
        </div>
      )}

      {/* Signup Form Card */}
      <div className="bg-white rounded-xl p-6 nice-shadow">
        <FormLayout onSubmit={formik.handleSubmit}>
          <FormField name="email">
            <FormLabelAndMessage
              label={t('auth.email')}
              message={formik.touched.email ? formik.errors.email : undefined}
            />
            <Form.Control asChild>
              <Input
                onChange={formik.handleChange}
                onBlur={formik.handleBlur}
                value={formik.values.email}
                type="email"
                required
              />
            </Form.Control>
          </FormField>

          <div className="flex flex-row space-x-2">
            <FormField name="first_name">
              <FormLabelAndMessage
                label={t('user.first_name')}
                message={formik.touched.first_name ? formik.errors.first_name : undefined}
              />
              <Form.Control asChild>
                <Input
                  onChange={formik.handleChange}
                  onBlur={formik.handleBlur}
                  value={formik.values.first_name}
                  type="text"
                />
              </Form.Control>
            </FormField>
            <FormField name="last_name">
              <FormLabelAndMessage
                label={t('user.last_name')}
                message={formik.touched.last_name ? formik.errors.last_name : undefined}
              />
              <Form.Control asChild>
                <Input
                  onChange={formik.handleChange}
                  onBlur={formik.handleBlur}
                  value={formik.values.last_name}
                  type="text"
                />
              </Form.Control>
            </FormField>
          </div>

          <FormField name="password">
            <FormLabelAndMessage
              label={t('auth.password')}
              message={formik.touched.password ? formik.errors.password : undefined}
            />
            <Form.Control asChild>
              <Input
                onChange={formik.handleChange}
                onBlur={formik.handleBlur}
                value={formik.values.password}
                type="password"
                autoComplete="new-password"
                required
              />
            </Form.Control>
            <PasswordStrengthIndicator password={formik.values.password} />
          </FormField>

          <FormField name="username">
            <FormLabelAndMessage
              label={t('user.username')}
              message={formik.touched.username ? formik.errors.username : undefined}
            />
            <Form.Control asChild>
              <Input
                onChange={formik.handleChange}
                onBlur={formik.handleBlur}
                value={formik.values.username}
                type="text"
                required
              />
            </Form.Control>
          </FormField>

          <FormField name="bio">
            <FormLabelAndMessage
              label={`${t('user.bio')} (${t('common.optional')})`}
              message={formik.touched.bio ? formik.errors.bio : undefined}
            />
            <Form.Control asChild>
              <Textarea
                onChange={formik.handleChange}
                onBlur={formik.handleBlur}
                value={formik.values.bio}
                placeholder={t('user.bio_placeholder')}
              />
            </Form.Control>
          </FormField>

          <div className="pt-2">
            <Form.Submit asChild>
              <button className="w-full bg-black text-white font-semibold text-center py-2.5 rounded-lg hover:bg-gray-800 transition-colors">
                {isSubmitting ? t('common.loading') : t('auth.create_account')}
              </button>
            </Form.Submit>
          </div>
        </FormLayout>
      </div>

      {/* Login Link */}
      <p className="text-center text-gray-600 mt-6">
        {t('auth.already_have_account')}{' '}
        <Link
          href={createOrgMode ? `/login?next=${encodeURIComponent(createOrgRedirect)}` : nextUrl ? `/login?next=${encodeURIComponent(nextUrl)}` : '/login'}
          className="font-semibold text-gray-900 hover:underline"
        >
          {t('auth.login')}
        </Link>
      </p>

      {!createOrgMode && (
        <div className="mt-6 rounded-xl border border-gray-200 bg-gray-50 p-4 text-center">
          <p className="text-sm font-semibold text-gray-900">Creating an organization?</p>
          <p className="mt-1 text-sm text-gray-500">
            Use a dedicated setup flow for admins, then we will take you into your new workspace.
          </p>
          <Link
            href={getUriWithOrg(org?.slug, '/signup?mode=create-org')}
            className="mt-4 inline-flex items-center justify-center rounded-lg bg-white px-4 py-2 text-sm font-semibold text-gray-900 border border-gray-200 hover:bg-gray-100"
          >
            Create an organization
          </Link>
        </div>
      )}
    </div>
  )
}

export default OpenSignUpComponent
