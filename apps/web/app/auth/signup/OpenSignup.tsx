'use client'
import { useFormik } from 'formik'
import { useRouter, useSearchParams } from 'next/navigation'
import React from 'react'
import FormLayout, {
  FormField,
  FormLabelAndMessage,
  Input,
  Textarea,
} from '@components/Objects/StyledElements/Form/Form'
import * as Form from '@radix-ui/react-form'
import { AlertTriangle, ArrowLeft } from 'lucide-react'
import { SiGoogle } from '@icons-pack/react-simple-icons'
import Link from 'next/link'
import { Button } from '@components/ui/button'
import { signup } from '@services/auth/auth'
import { useOrg } from '@components/Contexts/OrgContext'
import { useAuth } from '@components/Contexts/AuthContext'
import { getUriWithOrg } from '@services/config/config'
import { useTranslation } from 'react-i18next'
import { PasswordStrengthIndicator, validatePasswordStrength } from '@components/Auth/PasswordStrengthIndicator'

const welcomeSignupPasswordKey = (email: string) => `launchlms_welcome_signup_password:${email}`

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

function OpenSignUpComponent({
  createOrgMode = false,
  embedded = false,
  postSignupUrlOverride,
  onLoginClick,
}: {
  createOrgMode?: boolean
  embedded?: boolean
  postSignupUrlOverride?: string
  onLoginClick?: () => void
}) {
  const { t } = useTranslation()
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [isGoogleLoading, setIsGoogleLoading] = React.useState(false)
  const [step, setStep] = React.useState<'email' | 'details'>(createOrgMode ? 'details' : 'email')
  const [emailError, setEmailError] = React.useState('')
  const org = useOrg() as any
  const { signIn } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [error, setError] = React.useState('')
  const nextUrl = searchParams.get('next')
  const inviteBadge = searchParams.get('inviteBadge')
  const createOrgRedirect = getUriWithOrg(org?.slug, '/signup/org')
  const postSignupUrl =
    postSignupUrlOverride || nextUrl || (createOrgMode ? createOrgRedirect : inviteBadge ? `/badges?inviteBadge=${encodeURIComponent(inviteBadge)}` : '/')
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

        const callbackUrl = postSignupUrl
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

  const handleEmailContinue = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setEmailError('')

    const email = formik.values.email.trim()
    if (!email) {
      setEmailError(t('validation.required'))
      return
    }

    if (!/^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(email)) {
      setEmailError(t('validation.invalid_email'))
      return
    }

    const passwordValidation = validatePasswordStrength(formik.values.password)
    if (!formik.values.password || !passwordValidation.isValid) {
      formik.setFieldTouched('password', true, false)
      formik.setFieldError(
        'password',
        !formik.values.password ? t('validation.required') : t('auth.password_requirements_not_met')
      )
      return
    }

    formik.setFieldValue('email', email)
    if (!createOrgMode) {
      setIsSubmitting(true)
      try {
        const res = await fetch('/api/auth/signup/welcome/check-email', {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ email }),
        })
        const data = await res.json().catch(() => null)
        if (!res.ok) {
          setEmailError(data?.detail || 'Unable to start signup')
          setIsSubmitting(false)
          return
        }
      } catch (_) {
        setEmailError(t('common.something_went_wrong'))
        setIsSubmitting(false)
        return
      }
      window.sessionStorage.setItem(welcomeSignupPasswordKey(email), formik.values.password)
      router.push(`/welcome?email=${encodeURIComponent(email)}`)
      return
    }
    setStep('details')
  }

  const handleGoogleSignup = async () => {
    setError('')
    setIsGoogleLoading(true)

    const callbackUrl = postSignupUrl
    const res = await signIn('google', {
      callbackUrl,
      orgSlug: org?.slug,
      orgId: org?.id,
    } as any)

    if (res && 'error' in res && res.error) {
      setError(res.error)
      setIsGoogleLoading(false)
    }
  }

  if (step === 'email' && !createOrgMode) {
    return (
      <div className="flex min-h-screen flex-1 items-center justify-center px-6 py-12 lg:px-10">
        <div className="w-full max-w-[426px] text-center">
          <h1 className="text-[32px] leading-tight font-bold tracking-[-0.02em] text-gray-950">
            Create your free account
          </h1>

          {error && (
            <div className="mt-8 flex items-center gap-3 rounded-2xl bg-red-50 px-4 py-3 text-left text-sm font-semibold text-red-800 ring-1 ring-red-100">
              <AlertTriangle size={18} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="mt-12 space-y-7">
            <Button
              type="button"
              onClick={handleGoogleSignup}
              disabled={isGoogleLoading}
              variant="ctaSecondary"
              size="cta"
              className="w-full text-[16px]"
            >
              <SiGoogle size={20} color="#4285F4" />
              {isGoogleLoading ? t('common.loading') : 'Continue with Google'}
            </Button>

            <div className="flex items-center gap-4 text-sm font-semibold text-gray-400">
              <div className="h-px flex-1 bg-gray-200" />
              <span>or</span>
              <div className="h-px flex-1 bg-gray-200" />
            </div>

            <form onSubmit={handleEmailContinue} className="space-y-4">
              <input
                name="email"
                onChange={(e) => {
                  formik.handleChange(e)
                  if (emailError) setEmailError('')
                }}
                onBlur={formik.handleBlur}
                value={formik.values.email}
                type="email"
                placeholder="Enter email address"
                autoComplete="email"
                className="h-12 w-full rounded-2xl border border-gray-200 bg-white px-4 text-[16px] text-gray-950 shadow-sm outline-none transition-colors placeholder:text-gray-400 focus:border-gray-300 focus:ring-2 focus:ring-gray-100"
                required
              />
              {emailError && (
                <p className="text-left text-sm font-medium text-red-600">{emailError}</p>
              )}
              <input
                name="password"
                onChange={formik.handleChange}
                onBlur={formik.handleBlur}
                value={formik.values.password}
                type="password"
                placeholder={t('auth.password')}
                autoComplete="new-password"
                className="h-12 w-full rounded-2xl border border-gray-200 bg-white px-4 text-[16px] text-gray-950 shadow-sm outline-none transition-colors placeholder:text-gray-400 focus:border-gray-300 focus:ring-2 focus:ring-gray-100"
                required
              />
              {formik.touched.password && formik.errors.password && (
                <p className="text-left text-sm font-medium text-red-600">{formik.errors.password}</p>
              )}
              <div className="text-left">
                <PasswordStrengthIndicator password={formik.values.password} />
              </div>
              <Button
                type="submit"
                disabled={isSubmitting}
                size="cta"
                className="w-full bg-gray-950 text-[16px] font-semibold text-white shadow-none hover:bg-gray-800"
              >
                {isSubmitting ? t('common.loading') : 'Continue'}
              </Button>
            </form>
          </div>

          <p className="mt-5 text-[12px] leading-relaxed text-gray-500">
            By continuing, you agree to Launch LMS&apos;s{' '}
            <span className="underline underline-offset-2">
              Terms of Service
            </span>{' '}
            and{' '}
            <span className="underline underline-offset-2">
              Privacy Policy
            </span>
            .
          </p>

          <p className="mt-14 text-[15px] text-gray-600">
            {t('auth.already_have_account')}{' '}
            <Link
              href={nextUrl ? `/login?next=${encodeURIComponent(nextUrl)}` : '/login'}
              className="font-semibold text-gray-950 hover:underline"
            >
              {t('auth.login')}
            </Link>
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className={embedded ? 'w-full' : createOrgMode ? 'm-auto w-full max-w-sm px-6 py-8 sm:py-0' : 'flex min-h-screen flex-1 items-center justify-center px-6 py-12 lg:px-10'}>
      <div className={embedded ? 'w-full' : 'w-full max-w-sm'}>
      <div className={embedded ? 'mb-6' : 'mb-6'}>
        {!createOrgMode && (
          <button
            type="button"
            onClick={() => setStep('email')}
            className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-gray-500 transition-colors hover:text-gray-950"
          >
            <ArrowLeft size={16} />
            Back
          </button>
        )}
        <h1 className="text-2xl font-bold text-gray-900">
          {t('auth.create_account')}
        </h1>
        {!embedded && (
          <p className="mt-1 text-gray-500">
            {createOrgMode ? 'Create your user account first, then we will walk you through setting up an organization.' : t('auth.fill_in_details')}
          </p>
        )}
      </div>

      {error && (
        <div className="mb-6 flex items-center gap-3 rounded-xl bg-red-100 p-4 text-red-900">
          <AlertTriangle size={18} className="shrink-0" />
          <div className="font-bold text-sm">{error}</div>
        </div>
      )}

      <div className={embedded ? 'w-full' : 'rounded-xl bg-white p-6 nice-shadow'}>
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
              <Button size="cta" className="w-full bg-gray-950 font-semibold text-white shadow-none hover:bg-gray-800">
                {isSubmitting ? t('common.loading') : t('auth.create_account')}
              </Button>
            </Form.Submit>
          </div>
        </FormLayout>
      </div>

      {/* Login Link */}
      <p className="mt-6 text-center text-gray-600">
        {t('auth.already_have_account')}{' '}
        {onLoginClick ? (
          <button type="button" onClick={onLoginClick} className="font-semibold text-gray-900 hover:underline">
            {t('auth.login')}
          </button>
        ) : (
          <Link
            href={createOrgMode ? `/login?next=${encodeURIComponent(createOrgRedirect)}` : nextUrl ? `/login?next=${encodeURIComponent(nextUrl)}` : '/login'}
            className="font-semibold text-gray-900 hover:underline"
          >
            {t('auth.login')}
          </Link>
        )}
      </p>
      </div>
    </div>
  )
}

export default OpenSignUpComponent
