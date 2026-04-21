'use client'

import React from 'react'
import { useFormik } from 'formik'
import useSWR from 'swr'
import { ArrowLeft, Building2, CheckCircle2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { createNewOrganization } from '@services/organizations/orgs'
import { getAPIUrl, getDefaultOrg, getUriWithOrg, routePaths } from '@services/config/config'
import { swrFetcher } from '@services/utils/ts/requests'
import FormLayout, {
  FormField,
  FormLabelAndMessage,
  Input,
  Textarea,
} from '@components/Objects/StyledElements/Form/Form'
import * as Form from '@radix-ui/react-form'

const slugifyOrganizationName = (name: string): string =>
  name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

interface CreateOrgWizardProps {
  ownerOrg: any
}

export default function CreateOrgWizard({ ownerOrg }: CreateOrgWizardProps) {
  const router = useRouter()
  const session = useLHSession() as any
  const accessToken = session?.data?.tokens?.access_token
  const ownerOrgSlug = getDefaultOrg()
  const [step, setStep] = React.useState(1)
  const [error, setError] = React.useState('')
  const [isSubmitting, setIsSubmitting] = React.useState(false)

  const { data: adminOrgs } = useSWR(
    accessToken ? `${getAPIUrl()}orgs/user_admin/page/1/limit/100` : null,
    (url) => swrFetcher(url, accessToken),
    {
      revalidateOnFocus: false,
      revalidateOnMount: true,
    }
  )

  const formik = useFormik({
    initialValues: {
      name: '',
      slug: '',
      email: session?.data?.user?.email || '',
      description: '',
    },
    enableReinitialize: true,
    validate: (values) => {
      const errors: Record<string, string> = {}

      if (!values.name.trim()) errors.name = 'Organization name is required'
      if (!slugifyOrganizationName(values.slug || values.name)) errors.slug = 'Organization slug is required'
      if (!values.email.trim()) errors.email = 'Contact email is required'

      return errors
    },
    onSubmit: async (values) => {
      if (!accessToken) return

      setError('')
      setIsSubmitting(true)

      try {
        const organization = await createNewOrganization(
          {
            name: values.name.trim(),
            slug: slugifyOrganizationName(values.slug || values.name),
            email: values.email.trim(),
            description: values.description.trim(),
            about: '',
            socials: {},
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

        const existingAdminOrgCount = Array.isArray(adminOrgs) ? adminOrgs.length : 0
        const nextHref = existingAdminOrgCount > 0
          ? getUriWithOrg(ownerOrgSlug, routePaths.owner.account.orgAdmin())
          : getUriWithOrg(organization.slug, routePaths.org.dash.root())

        window.location.href = nextHref
      } catch (err: any) {
        setError(err?.detail || err?.message || 'Failed to create organization')
      } finally {
        setIsSubmitting(false)
      }
    },
  })

  return (
    <div className="m-auto w-full max-w-2xl px-6 py-8 sm:py-0">
      <div className="mb-6">
        <button
          type="button"
          onClick={() => (step === 1 ? router.push(getUriWithOrg(ownerOrg.slug, routePaths.auth.signup())) : setStep(1))}
          className="inline-flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-gray-900"
        >
          <ArrowLeft className="w-4 h-4" />
          {step === 1 ? 'Back to sign up' : 'Back'}
        </button>
      </div>

      <div className="bg-white rounded-xl p-6 nice-shadow">
        <div className="flex items-start gap-4 mb-8">
          <div className="p-3 rounded-xl bg-gray-100">
            <Building2 className="w-6 h-6 text-gray-700" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Create an organization</h1>
            <p className="mt-1 text-sm text-gray-500">
              Set up a new admin workspace. You will be added as the first organization admin automatically.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 mb-8">
          <div className={`flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${step === 1 ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600'}`}>
            <span>1</span>
            <span>Details</span>
          </div>
          <div className={`flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${step === 2 ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600'}`}>
            <span>2</span>
            <span>Review</span>
          </div>
        </div>

        {error && (
          <div className="mb-6 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <FormLayout onSubmit={formik.handleSubmit}>
          {step === 1 ? (
            <div className="space-y-5">
              <FormField name="name">
                <FormLabelAndMessage
                  label="Organization name"
                  message={formik.touched.name && typeof formik.errors.name === 'string' ? formik.errors.name : undefined}
                />
                <Form.Control asChild>
                  <Input
                    onChange={(event) => {
                      formik.handleChange(event)
                      if (!formik.values.slug || formik.values.slug === slugifyOrganizationName(formik.values.name)) {
                        formik.setFieldValue('slug', slugifyOrganizationName(event.target.value))
                      }
                    }}
                    onBlur={formik.handleBlur}
                    value={formik.values.name}
                    type="text"
                    placeholder="Acme Academy"
                    required
                  />
                </Form.Control>
              </FormField>

              <FormField name="slug">
                <FormLabelAndMessage
                  label="Organization slug"
                  message={formik.touched.slug && typeof formik.errors.slug === 'string' ? formik.errors.slug : undefined}
                />
                <Form.Control asChild>
                  <Input
                    onChange={(event) => formik.setFieldValue('slug', slugifyOrganizationName(event.target.value))}
                    onBlur={formik.handleBlur}
                    value={formik.values.slug}
                    type="text"
                    placeholder="acme-academy"
                    required
                  />
                </Form.Control>
              </FormField>

              <FormField name="email">
                <FormLabelAndMessage
                  label="Contact email"
                  message={formik.touched.email && typeof formik.errors.email === 'string' ? formik.errors.email : undefined}
                />
                <Form.Control asChild>
                  <Input
                    onChange={formik.handleChange}
                    onBlur={formik.handleBlur}
                    value={formik.values.email}
                    type="email"
                    placeholder="team@example.com"
                    required
                  />
                </Form.Control>
              </FormField>

              <FormField name="description">
                <FormLabelAndMessage
                  label="Description"
                  message={formik.touched.description && typeof formik.errors.description === 'string' ? formik.errors.description : undefined}
                />
                <Form.Control asChild>
                  <Textarea
                    onChange={formik.handleChange}
                    onBlur={formik.handleBlur}
                    value={formik.values.description}
                    placeholder="A short description for your organization"
                  />
                </Form.Control>
              </FormField>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={async () => {
                    const errors = await formik.validateForm()
                    formik.setTouched({
                      name: true,
                      slug: true,
                      email: true,
                      description: true,
                    })

                    if (Object.keys(errors).length === 0) {
                      setStep(2)
                    }
                  }}
                  className="w-full bg-black text-white font-semibold text-center py-2.5 rounded-lg hover:bg-gray-800 transition-colors"
                >
                  Continue
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-5">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5" />
                  <div className="space-y-3 text-sm text-gray-700">
                    <div>
                      <p className="font-semibold text-gray-900">Organization name</p>
                      <p>{formik.values.name}</p>
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">Slug</p>
                      <p>{slugifyOrganizationName(formik.values.slug || formik.values.name)}</p>
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">Contact email</p>
                      <p>{formik.values.email}</p>
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">Description</p>
                      <p>{formik.values.description || 'No description added yet.'}</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="flex-1 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                >
                  Edit details
                </button>
                <Form.Submit asChild>
                  <button
                    className="flex-1 rounded-lg bg-black px-4 py-2.5 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-60"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? 'Creating...' : 'Create organization'}
                  </button>
                </Form.Submit>
              </div>
            </div>
          )}
        </FormLayout>
      </div>
    </div>
  )
}
