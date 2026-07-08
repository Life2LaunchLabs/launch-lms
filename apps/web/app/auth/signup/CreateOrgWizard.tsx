'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  Building2,
  Check,
  Loader2,
  Palette,
  Upload,
} from 'lucide-react'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { createNewOrganization } from '@services/organizations/orgs'
import { getDefaultOrg, getUriWithOrg, routePaths } from '@services/config/config'
import { submitPlanRequest } from '@services/plans/plan_requests'
import {
  updateOrgColorConfig,
  updateOrgDarkColorConfig,
  uploadOrganizationThumbnail,
} from '@services/settings/org'
import UserAvatar from '@components/Objects/UserAvatar'
import { Button } from '@components/ui/button'
import LoginClient from '../login/login'
import OpenSignUpComponent from './OpenSignup'

const slugifyOrganizationName = (name: string): string =>
  name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

const packageOptions = [
  { id: 'analytics', label: 'Analytics' },
  { id: 'credentials', label: 'Credentials' },
  { id: 'ai', label: 'AI features' },
  { id: 'advanced_user_management', label: 'Advanced users' },
  { id: 'badge_creation', label: 'Badge publishing' },
  { id: 'badge_issuing', label: 'Badge issuing' },
]

type PlanChoice = 'free' | 'full' | 'enterprise'

interface CreateOrgWizardProps {
  ownerOrg: any
}

export default function CreateOrgWizard({ ownerOrg }: CreateOrgWizardProps) {
  const router = useRouter()
  const session = useLHSession() as any
  const accessToken = session?.data?.tokens?.access_token
  const ownerOrgSlug = ownerOrg?.slug || getDefaultOrg()
  const orgSignupHref = getUriWithOrg(ownerOrgSlug, '/signup/org')
  const [step, setStep] = React.useState(0)
  const [authMode, setAuthMode] = React.useState<'login' | 'signup'>('signup')
  const [error, setError] = React.useState('')
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [thumbnailPreview, setThumbnailPreview] = React.useState('')
  const [form, setForm] = React.useState({
    name: '',
    email: session?.data?.user?.email || '',
    description: '',
    thumbnail: null as File | null,
    primaryColor: '#7c3aed',
    darkColor: '#111827',
    website: '',
    linkedin: '',
    x: '',
    plan: 'free' as PlanChoice,
    message: '',
    packages: [] as string[],
  })

  React.useEffect(() => {
    if (session?.data?.user?.email && !form.email) {
      setForm((current) => ({ ...current, email: session.data.user.email }))
    }
  }, [session?.data?.user?.email, form.email])

  React.useEffect(() => {
    return () => {
      if (thumbnailPreview) URL.revokeObjectURL(thumbnailPreview)
    }
  }, [thumbnailPreview])

  const updateField = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setForm((current) => ({ ...current, [key]: value }))
  }

  const validateBasicInfo = () => {
    if (!form.name.trim()) return 'Organization name is required.'
    if (!form.email.trim()) return 'Contact email is required.'
    return ''
  }

  const goNext = () => {
    setError('')
    if (step === 1) {
      const message = validateBasicInfo()
      if (message) {
        setError(message)
        return
      }
    }
    setStep((current) => Math.min(current + 1, 3))
  }

  const goBack = () => {
    setError('')
    if (step === 0) {
      router.push(getUriWithOrg(ownerOrgSlug, routePaths.org.root()))
      return
    }
    setStep((current) => Math.max(current - 1, 0))
  }

  const togglePackage = (packageId: string) => {
    setForm((current) => ({
      ...current,
      packages: current.packages.includes(packageId)
        ? current.packages.filter((id) => id !== packageId)
        : [...current.packages, packageId],
    }))
  }

  const handleThumbnailChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null
    updateField('thumbnail', file)
    if (thumbnailPreview) URL.revokeObjectURL(thumbnailPreview)
    setThumbnailPreview(file ? URL.createObjectURL(file) : '')
  }

  const handleSubmit = async () => {
    if (!accessToken) {
      setError('Sign in before creating an organization.')
      setStep(0)
      return
    }

    const validationMessage = validateBasicInfo()
    if (validationMessage) {
      setError(validationMessage)
      setStep(1)
      return
    }

    setError('')
    setIsSubmitting(true)

    try {
      const socials = {
        ...(form.website.trim() ? { website: form.website.trim() } : {}),
        ...(form.linkedin.trim() ? { linkedin: form.linkedin.trim() } : {}),
        ...(form.x.trim() ? { x: form.x.trim() } : {}),
      }

      const organization = await createNewOrganization(
        {
          name: form.name.trim(),
          slug: slugifyOrganizationName(form.name),
          email: form.email.trim(),
          description: form.description.trim(),
          about: '',
          socials,
          links: {},
          scripts: {},
          logo_image: '',
          thumbnail_image: '',
          previews: {},
          explore: false,
          label: '',
        },
        accessToken
      )

      if (form.thumbnail) {
        await uploadOrganizationThumbnail(String(organization.id), form.thumbnail, accessToken)
      }

      if (form.primaryColor) {
        await updateOrgColorConfig(String(organization.id), form.primaryColor, accessToken)
      }

      if (form.darkColor) {
        await updateOrgDarkColorConfig(String(organization.id), form.darkColor, accessToken)
      }

      if (form.plan !== 'free') {
        await submitPlanRequest(
          organization.slug,
          'plan_upgrade',
          form.plan,
          form.message.trim() || null,
          accessToken
        )

        await Promise.all(
          form.packages.map((packageId) =>
            submitPlanRequest(
              organization.slug,
              'package_add',
              packageId,
              form.message.trim() || null,
              accessToken
            )
          )
        )
      }

      await session?.update?.(true)
      window.location.href = getUriWithOrg(organization.slug, routePaths.org.dash.root())
    } catch (err: any) {
      setError(err?.detail || err?.message || 'Failed to create organization.')
      setIsSubmitting(false)
    }
  }

  const signedIn = session.status === 'authenticated'
  return (
    <div className="m-auto flex h-[calc(100dvh-48px)] max-h-[760px] min-h-[560px] w-full max-w-2xl px-5 py-6 sm:px-6">
      <div className="flex min-h-0 w-full flex-col rounded-xl bg-white shadow-[0_18px_70px_rgba(15,23,42,0.12)] ring-1 ring-gray-100">
        <div className="flex items-center gap-4 px-5 pb-5 pt-5 sm:px-7 sm:pt-7">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-800">
            <Building2 className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-950">Create an organization</h1>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 sm:px-7">
          {error && (
            <div className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
              {error}
            </div>
          )}
          {step === 0 && (
            <div>
              {signedIn ? (
                <div className="rounded-lg bg-gray-50 p-4">
                  <div className="flex items-center gap-3">
                    <UserAvatar rounded="rounded-lg" border="border-2" width={46} />
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-gray-950">
                        {session.data?.user?.first_name || session.data?.user?.username || 'Signed in'}
                      </p>
                      <p className="truncate text-sm text-gray-500">{session.data?.user?.email}</p>
                    </div>
                    <Check className="ml-auto h-5 w-5 text-green-600" />
                  </div>
                </div>
              ) : (
                <div>
                  {authMode === 'login' ? (
                    <LoginClient
                      org={ownerOrg}
                      embedded
                      nextUrlOverride={orgSignupHref}
                      onSignupClick={() => setAuthMode('signup')}
                    />
                  ) : (
                    <OpenSignUpComponent
                      createOrgMode
                      embedded
                      postSignupUrlOverride={orgSignupHref}
                      onLoginClick={() => setAuthMode('login')}
                    />
                  )}
                </div>
              )}
            </div>
          )}

          {step === 1 && (
            <div className="space-y-5">
              <StepHeader
                icon={<Building2 className="h-5 w-5" />}
                title="Basic organization info"
                description="This is the core profile people will recognize across Launch LMS."
              />
              <TextInput
                label="Organization name"
                value={form.name}
                onChange={(value) => updateField('name', value)}
                placeholder="Acme Academy"
              />
              <TextInput
                label="Contact email"
                value={form.email}
                onChange={(value) => updateField('email', value)}
                placeholder="team@example.com"
                type="email"
              />
              <label className="block">
                <span className="text-sm font-semibold text-gray-800">Description</span>
                <textarea
                  value={form.description}
                  onChange={(event) => updateField('description', event.target.value)}
                  placeholder="A short description for learners, members, and partner organizations."
                  className="mt-2 min-h-[104px] w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none transition-colors placeholder:text-gray-400 focus:border-gray-400"
                />
              </label>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <StepHeader
                icon={<Palette className="h-5 w-5" />}
                title="Customize the first impression"
                description="These settings are optional and can be refined later in admin settings."
              />
              <label className="block">
                <span className="text-sm font-semibold text-gray-800">Thumbnail</span>
                <div className="mt-2 flex items-center gap-4">
                  <div className="flex h-24 w-32 items-center justify-center overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
                    {thumbnailPreview ? (
                      <img src={thumbnailPreview} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <Upload className="h-6 w-6 text-gray-400" />
                    )}
                  </div>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleThumbnailChange}
                    className="block w-full text-sm text-gray-500 file:mr-4 file:rounded-lg file:border-0 file:bg-gray-950 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-gray-800"
                  />
                </div>
              </label>

              <div className="grid gap-4 sm:grid-cols-2">
                <ColorInput
                  label="Primary color"
                  value={form.primaryColor}
                  onChange={(value) => updateField('primaryColor', value)}
                />
                <ColorInput
                  label="Dark color"
                  value={form.darkColor}
                  onChange={(value) => updateField('darkColor', value)}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <TextInput label="Website" value={form.website} onChange={(value) => updateField('website', value)} placeholder="https://example.com" />
                <TextInput label="LinkedIn" value={form.linkedin} onChange={(value) => updateField('linkedin', value)} placeholder="https://linkedin.com/company/..." />
                <TextInput label="X" value={form.x} onChange={(value) => updateField('x', value)} placeholder="https://x.com/..." />
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-5">
              <StepHeader
                icon={<Check className="h-5 w-5" />}
                title="Choose a starting plan"
                description="New organizations start on free. You can also request an upgrade now."
              />
              <div className="grid gap-3 sm:grid-cols-3">
                {(['free', 'full', 'enterprise'] as PlanChoice[]).map((plan) => (
                  <button
                    key={plan}
                    type="button"
                    onClick={() => updateField('plan', plan)}
                    className={`rounded-lg border px-4 py-4 text-left capitalize transition-colors ${
                      form.plan === plan
                        ? 'border-gray-950 bg-gray-950 text-white'
                        : 'border-gray-200 bg-white text-gray-800 hover:bg-gray-50'
                    }`}
                  >
                    <span className="font-semibold">{plan}</span>
                    <span className={`mt-1 block text-xs ${form.plan === plan ? 'text-white/70' : 'text-gray-500'}`}>
                      {plan === 'free' ? 'Default workspace' : 'Request upgrade'}
                    </span>
                  </button>
                ))}
              </div>

              {form.plan !== 'free' && (
                <>
                  <div>
                    <p className="mb-2 text-sm font-semibold text-gray-800">Packages</p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {packageOptions.map((option) => (
                        <label
                          key={option.id}
                          className="flex cursor-pointer items-center gap-3 rounded-lg border border-gray-200 px-3 py-2 text-sm"
                        >
                          <input
                            type="checkbox"
                            checked={form.packages.includes(option.id)}
                            onChange={() => togglePackage(option.id)}
                            className="h-4 w-4 rounded border-gray-300"
                          />
                          <span>{option.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <label className="block">
                    <span className="text-sm font-semibold text-gray-800">Upgrade note</span>
                    <textarea
                      value={form.message}
                      onChange={(event) => updateField('message', event.target.value)}
                      placeholder="Tell us what your organization needs."
                      className="mt-2 min-h-[88px] w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none transition-colors placeholder:text-gray-400 focus:border-gray-400"
                    />
                  </label>
                </>
              )}
            </div>
          )}
        </div>

        <div className="shrink-0 px-5 pb-5 pt-4 sm:px-7 sm:pb-7">
          <div className="mb-5 flex items-center justify-center gap-2">
            {['Account', 'Basics', 'Customize', 'Plan'].map((label, index) => (
              <div key={label} className="flex items-center gap-2">
                <div
                  className={`h-2.5 w-2.5 rounded-full transition-colors ${
                    index === step ? 'bg-gray-950' : index < step ? 'bg-green-500' : 'bg-gray-200'
                  }`}
                  title={label}
                />
                {index < 3 && <div className="h-px w-8 bg-gray-200 sm:w-14" />}
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-gray-100 pt-5">
            <Button type="button" variant="ghost" onClick={goBack} disabled={isSubmitting}>
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>

            {step < 3 ? (
              <Button type="button" onClick={goNext} disabled={step === 0 && !signedIn}>
                Next
              </Button>
            ) : (
              <Button type="button" onClick={handleSubmit} disabled={isSubmitting || !signedIn}>
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {isSubmitting ? 'Creating...' : 'Create organization'}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function StepHeader({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode
  title: string
  description: string
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-700">
        {icon}
      </div>
      <div>
        <h2 className="text-lg font-bold text-gray-950">{title}</h2>
        <p className="mt-1 text-sm leading-6 text-gray-500">{description}</p>
      </div>
    </div>
  )
}

function TextInput({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  type?: string
}) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-gray-800">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="mt-2 h-10 w-full rounded-lg border border-gray-200 px-3 text-sm outline-none transition-colors placeholder:text-gray-400 focus:border-gray-400"
      />
    </label>
  )
}

function ColorInput({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-gray-800">{label}</span>
      <div className="mt-2 flex h-10 items-center overflow-hidden rounded-lg border border-gray-200">
        <input
          type="color"
          value={value || '#ffffff'}
          onChange={(event) => onChange(event.target.value)}
          className="h-10 w-12 border-0 bg-transparent p-1"
        />
        <input
          type="text"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-full min-w-0 flex-1 px-3 text-sm outline-none"
        />
      </div>
    </label>
  )
}
