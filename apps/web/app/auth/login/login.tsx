'use client'
import { useFormik } from 'formik'
import React, { useState, useEffect } from 'react'
import { AlertTriangle, Lock, Mail, Shield, X, Clock } from 'lucide-react'
import { SiGoogle } from '@icons-pack/react-simple-icons'
import { checkSSOEnabled, redirectToSSOLogin } from '@services/auth/sso'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@components/Contexts/AuthContext'
import { getCoreCapabilities } from '@services/config/config'
import { useTranslation } from 'react-i18next'
import { resendVerificationEmail } from '@services/auth/auth'
import AuthLayout from '@components/Auth/AuthLayout'
import { Button } from '@components/ui/button'

interface LoginClientProps {
  org: any
}

const LoginClient = (props: LoginClientProps) => {
  const { t } = useTranslation()
  const { signIn } = useAuth()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isGoogleLoading, setIsGoogleLoading] = useState(false)
  const [step, setStep] = useState<'email' | 'password'>('email')
  const [emailError, setEmailError] = useState('')
  const [ssoEnabled, setSsoEnabled] = useState(false)
  const [ssoLoading, setSsoLoading] = useState(false)
  const searchParams = useSearchParams()
  const nextUrl = searchParams.get('next')

  // Error state with type information
  const [error, setError] = useState('')
  const [errorType, setErrorType] = useState<string | null>(null)
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null)
  const [isResendingVerification, setIsResendingVerification] = useState(false)
  const [verificationResent, setVerificationResent] = useState(false)
  const [showErrorModal, setShowErrorModal] = useState(false)
  const [retryAfter, setRetryAfter] = useState<number | null>(null)

  // Check if SSO is enabled for this organization (requires enterprise plan)
  useEffect(() => {
    const checkSSO = async () => {
      if (!getCoreCapabilities().sso) {
        setSsoEnabled(false)
        return
      }

      if (props.org?.slug) {
        try {
          const result = await checkSSOEnabled(props.org.slug)
          setSsoEnabled(result.sso_enabled)
        } catch (error) {
          // SSO not available, silently ignore
        }
      }
    }
    checkSSO()
  }, [props.org?.slug, props.org?.config?.config?.plan, props.org?.config?.config?.cloud?.plan])  

  const handleSSOLogin = async () => {
    setSsoLoading(true)
    try {
      await redirectToSSOLogin(props.org.slug)
    } catch (error: any) {
      setError(error.message || t('auth.sso_error'))
      setSsoLoading(false)
    }
  }

  const getCallbackUrl = () => nextUrl || `${window.location.origin}/redirect_from_auth`

  const handleGoogleLogin = async () => {
    setError('')
    setShowErrorModal(false)
    setIsGoogleLoading(true)

    const res = await signIn('google', {
      callbackUrl: getCallbackUrl(),
      orgSlug: props.org?.slug,
      orgId: props.org?.id,
    } as any)

    if (res && 'error' in res && res.error) {
      setError(res.error)
      setShowErrorModal(true)
      setIsGoogleLoading(false)
    }
  }

  const handleEmailContinue = (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setShowErrorModal(false)
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

    formik.setFieldValue('email', email)
    setStep('password')
  }

  const validate = (values: any) => {
    const errors: any = {}

    if (!values.email) {
      errors.email = t('validation.required')
    } else if (!/^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(values.email)) {
      errors.email = t('validation.invalid_email')
    }

    if (!values.password) {
      errors.password = t('validation.required')
    } else if (values.password.length < 8) {
      errors.password = t('validation.password_min_length')
    }

    return errors
  }

  const handleResendVerification = async () => {
    if (!unverifiedEmail || !props.org?.id) return

    setIsResendingVerification(true)
    try {
      const res = await resendVerificationEmail(unverifiedEmail, props.org.id)
      if (res.success) {
        setVerificationResent(true)
      } else {
        setError(res.error || t('auth.resend_verification_failed'))
      }
    } catch (err) {
      setError(t('auth.resend_verification_failed'))
    } finally {
      setIsResendingVerification(false)
    }
  }

  const formik = useFormik({
    initialValues: {
      email: '',
      password: '',
    },
    validate,
    validateOnBlur: true,
    validateOnChange: true,
    onSubmit: async (values, {validateForm, setErrors, setSubmitting}) => {
      setIsSubmitting(true)
      setError('')
      setErrorType(null)
      setUnverifiedEmail(null)
      setVerificationResent(false)
      setShowErrorModal(false)
      setRetryAfter(null)

      const errors = await validateForm(values);
      if (Object.keys(errors).length > 0) {
        setErrors(errors);
        setSubmitting(false);
        setIsSubmitting(false);
        return;
      }

      // Use absolute URL with current origin for custom domain support
      const callbackUrl = getCallbackUrl();

      const res = await signIn('credentials', {
        redirect: false,
        email: values.email,
        password: values.password,
        callbackUrl
      });

      if (res && res.error) {
        // Try to parse the error message for error codes
        try {
          // The error from next-auth might contain our structured error
          const errorData = JSON.parse(res.error);
          if (errorData.code) {
            setErrorType(errorData.code);
            setError(errorData.message || t('auth.wrong_email_password'));
            if (errorData.code === 'EMAIL_NOT_VERIFIED') {
              setUnverifiedEmail(errorData.email || values.email);
            }
            if (errorData.retry_after) {
              setRetryAfter(errorData.retry_after);
            }
          } else {
            setError(t('auth.wrong_email_password'));
          }
        } catch {
          // If parsing fails, check for specific error strings
          if (res.error.includes('EMAIL_NOT_VERIFIED')) {
            setErrorType('EMAIL_NOT_VERIFIED');
            setError(t('auth.email_not_verified_message'));
            setUnverifiedEmail(values.email);
          } else if (res.error.includes('ACCOUNT_LOCKED')) {
            setErrorType('ACCOUNT_LOCKED');
            setError(t('auth.account_locked_message'));
          } else if (res.error.includes('RATE_LIMITED')) {
            setErrorType('RATE_LIMITED');
            setError(t('auth.rate_limited_message'));
          } else {
            setError(t('auth.wrong_email_password'));
          }
        }
        setShowErrorModal(true);
        setIsSubmitting(false);
      } else {
        // First signIn already authenticated and set cookies — just redirect
        window.location.href = callbackUrl;
      }
    },
  })

  return (
    <AuthLayout org={props.org} welcomeText={t('auth.login_to')}>
      {showErrorModal && (
        <div className={`
          fixed left-0 right-0 top-0 z-50 w-full px-4 py-3 flex items-center justify-between gap-3 animate-in slide-in-from-top duration-200
          ${errorType === 'EMAIL_NOT_VERIFIED' && !verificationResent ? 'bg-amber-500 text-white' : ''}
          ${verificationResent ? 'bg-green-500 text-white' : ''}
          ${errorType === 'ACCOUNT_LOCKED' ? 'bg-red-500 text-white' : ''}
          ${errorType === 'RATE_LIMITED' ? 'bg-orange-500 text-white' : ''}
          ${error && !verificationResent && errorType !== 'EMAIL_NOT_VERIFIED' && errorType !== 'ACCOUNT_LOCKED' && errorType !== 'RATE_LIMITED' ? 'bg-red-500 text-white' : ''}
        `}>
          <div className="flex items-center gap-3 flex-1 min-w-0">
            {errorType === 'EMAIL_NOT_VERIFIED' && !verificationResent && <Mail size={18} className="shrink-0" />}
            {verificationResent && <Mail size={18} className="shrink-0" />}
            {errorType === 'ACCOUNT_LOCKED' && <Lock size={18} className="shrink-0" />}
            {errorType === 'RATE_LIMITED' && <Clock size={18} className="shrink-0" />}
            {error && !verificationResent && errorType !== 'EMAIL_NOT_VERIFIED' && errorType !== 'ACCOUNT_LOCKED' && errorType !== 'RATE_LIMITED' && <AlertTriangle size={18} className="shrink-0" />}

            <div className="flex-1 min-w-0">
              {errorType === 'EMAIL_NOT_VERIFIED' && !verificationResent && (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium">{t('auth.email_not_verified_message')}</span>
                  <button
                    type="button"
                    onClick={handleResendVerification}
                    disabled={isResendingVerification}
                    className="text-sm underline hover:no-underline disabled:opacity-50"
                  >
                    {isResendingVerification ? t('common.loading') : t('auth.resend_verification_email')}
                  </button>
                </div>
              )}
              {verificationResent && (
                <span className="text-sm font-medium">{t('auth.verification_email_resent')} - {t('auth.check_inbox_message')}</span>
              )}
              {errorType === 'ACCOUNT_LOCKED' && (
                <span className="text-sm font-medium">
                  {t('auth.account_locked')}
                  {retryAfter ? ` · ${t('auth.try_again_in', { minutes: Math.max(1, Math.ceil(retryAfter / 60)) })}` : ''}
                </span>
              )}
              {errorType === 'RATE_LIMITED' && (
                <span className="text-sm font-medium">
                  {t('auth.rate_limited')}
                  {retryAfter ? ` · ${t('auth.try_again_in', { minutes: Math.max(1, Math.ceil(retryAfter / 60)) })}` : ''}
                </span>
              )}
              {error && !verificationResent && errorType !== 'EMAIL_NOT_VERIFIED' && errorType !== 'ACCOUNT_LOCKED' && errorType !== 'RATE_LIMITED' && (
                <span className="text-sm font-medium">{error}</span>
              )}
            </div>
          </div>

          <button
            onClick={() => {
              setShowErrorModal(false)
              if (verificationResent) setVerificationResent(false)
            }}
            className="p-1 hover:bg-white/20 rounded transition-colors shrink-0"
          >
            <X size={18} />
          </button>
        </div>
      )}

      <div className="flex min-h-screen flex-1 items-center justify-center px-6 py-12 lg:px-10">
        <div className="w-full max-w-[426px] text-center">
          <h1 className="text-[32px] leading-tight font-bold tracking-[-0.02em] text-gray-950">
            {t('auth.welcome_back')}
          </h1>

          {step === 'email' ? (
            <div className="mt-12 space-y-4">
              <Button
                type="button"
                onClick={handleGoogleLogin}
                disabled={isGoogleLoading}
                variant="ctaSecondary"
                size="cta"
                className="w-full text-[16px]"
              >
                <SiGoogle size={20} color="#4285F4" />
                {isGoogleLoading ? t('common.loading') : 'Continue with Google'}
              </Button>

              <div className="flex items-center gap-4 pt-5 text-sm font-semibold text-gray-400">
                <div className="h-px flex-1 bg-gray-200" />
                <span>or</span>
                <div className="h-px flex-1 bg-gray-200" />
              </div>

              <form onSubmit={handleEmailContinue} className="space-y-4 pt-1">
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
                <Button
                  type="submit"
                  size="cta"
                  className="w-full bg-gray-950 text-[16px] font-semibold text-white shadow-none hover:bg-gray-800"
                >
                  Continue
                </Button>
              </form>
            </div>
          ) : (
            <form onSubmit={formik.handleSubmit} className="mt-12 space-y-4 text-left">
              <button
                type="button"
                onClick={() => setStep('email')}
                className="mb-2 text-sm font-semibold text-gray-500 transition-colors hover:text-gray-950"
              >
                Back
              </button>

              <input
                name="email"
                onChange={formik.handleChange}
                onBlur={formik.handleBlur}
                value={formik.values.email}
                type="email"
                placeholder="Enter email address"
                autoComplete="email"
                className="h-12 w-full rounded-2xl border border-gray-200 bg-white px-4 text-[16px] text-gray-950 shadow-sm outline-none transition-colors placeholder:text-gray-400 focus:border-gray-300 focus:ring-2 focus:ring-gray-100"
                required
              />
              {formik.touched.email && formik.errors.email && (
                <p className="text-sm font-medium text-red-600">{formik.errors.email}</p>
              )}

              <input
                name="password"
                onChange={formik.handleChange}
                onBlur={formik.handleBlur}
                value={formik.values.password}
                type="password"
                placeholder="Password"
                autoComplete="current-password"
                className="h-12 w-full rounded-2xl border border-gray-200 bg-white px-4 text-[16px] text-gray-950 shadow-sm outline-none transition-colors placeholder:text-gray-400 focus:border-gray-300 focus:ring-2 focus:ring-gray-100"
                required
              />
              {formik.touched.password && formik.errors.password && (
                <p className="text-sm font-medium text-red-600">{formik.errors.password}</p>
              )}

              <div className="flex items-center justify-between">
                <Link href="/forgot" className="text-xs text-gray-500 transition-colors hover:text-gray-950">
                  {t('auth.forgot_password')}
                </Link>
                {ssoEnabled && (
                  <button
                    type="button"
                    onClick={handleSSOLogin}
                    disabled={ssoLoading}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-500 transition-colors hover:text-gray-950 disabled:opacity-60"
                  >
                    <Shield size={14} />
                    {ssoLoading ? t('common.loading') : t('auth.sign_in_with_sso')}
                  </button>
                )}
              </div>

              <Button
                type="submit"
                disabled={isSubmitting}
                size="cta"
                className="w-full bg-gray-950 text-[16px] font-semibold text-white shadow-none hover:bg-gray-800"
              >
                {isSubmitting ? t('common.loading') : t('auth.login')}
              </Button>
            </form>
          )}

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
            {t('auth.no_account')}{' '}
            <Link href="/signup" className="font-semibold text-gray-950 hover:underline">
              {t('auth.sign_up')}
            </Link>
          </p>
        </div>
      </div>
    </AuthLayout>
  )
}

export default LoginClient
