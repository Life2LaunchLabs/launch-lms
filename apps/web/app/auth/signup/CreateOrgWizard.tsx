'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Building2, Check, Loader2 } from 'lucide-react'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { createNewOrganization } from '@services/organizations/orgs'
import { slugifyOrganizationName } from '@services/organizations/slug'
import { getDefaultOrg, getUriWithOrg, routePaths } from '@services/config/config'
import { authenticatedOrgHref } from '@services/auth/handoff'
import UserAvatar from '@components/Objects/UserAvatar'
import { Button } from '@components/ui/button'
import LoginClient from '../login/login'
import OpenSignUpComponent from './OpenSignup'

interface CreateOrgWizardProps {
  ownerOrg: any
}

/**
 * Creating an organization: an account, then a name, then the admin Home. Everything else
 * (description, branding, staff, upgrades) is set up from the dashboard's getting-started list.
 */
export default function CreateOrgWizard({ ownerOrg }: CreateOrgWizardProps) {
  const router = useRouter()
  const session = useLHSession() as any
  const accessToken = session?.data?.tokens?.access_token
  const signedIn = session.status === 'authenticated'
  const ownerOrgSlug = ownerOrg?.slug || getDefaultOrg()
  const orgSignupHref = getUriWithOrg(ownerOrgSlug, routePaths.auth.orgSignup())
  const [authMode, setAuthMode] = React.useState<'login' | 'signup'>('signup')
  const [name, setName] = React.useState('')
  const [error, setError] = React.useState('')
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const slug = slugifyOrganizationName(name)

  const goBack = () => router.push(getUriWithOrg(ownerOrgSlug, routePaths.org.forOrganizations()))

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!accessToken) return setError('Sign in before creating an organization.')
    if (!name.trim()) return setError('Give your organization a name.')
    setError('')
    setIsSubmitting(true)
    try {
      const organization = await createNewOrganization(
        {
          name: name.trim(),
          slug,
          email: session?.data?.user?.email || '',
          description: '',
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
      await session?.update?.(true)
      window.location.href = authenticatedOrgHref(getUriWithOrg(organization.slug, routePaths.org.admin.root()), true)
    } catch (err: any) {
      setError(err?.detail || err?.message || 'Failed to create organization.')
      setIsSubmitting(false)
    }
  }

  return (
    <div className="m-auto flex w-full max-w-xl px-5 py-6 sm:px-6">
      <div className="flex w-full flex-col rounded-xl bg-white shadow-[0_18px_70px_rgba(15,23,42,0.12)] ring-1 ring-gray-100">
        <div className="flex items-center gap-4 px-5 pb-4 pt-5 sm:px-7 sm:pt-7">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-800">
            <Building2 className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-gray-950">Create your organization</h1>
            <p className="mt-0.5 text-sm text-gray-500">{signedIn ? 'Step 2 of 2: name it' : 'Step 1 of 2: your account'}</p>
          </div>
        </div>

        <div className="px-5 sm:px-7">
          {error && (
            <div role="alert" className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
              {error}
            </div>
          )}
          {!signedIn ? (
            authMode === 'login' ? (
              <LoginClient org={ownerOrg} embedded nextUrlOverride={orgSignupHref} onSignupClick={() => setAuthMode('signup')} />
            ) : (
              <OpenSignUpComponent createOrgMode embedded postSignupUrlOverride={orgSignupHref} onLoginClick={() => setAuthMode('login')} />
            )
          ) : (
            <form id="create-org" onSubmit={handleSubmit} className="space-y-5">
              <div className="rounded-lg bg-gray-50 p-3.5">
                <div className="flex items-center gap-3">
                  <UserAvatar rounded="rounded-lg" border="border-2" width={40} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-gray-950">
                      {session.data?.user?.first_name || session.data?.user?.username || 'Signed in'}
                    </p>
                    <p className="truncate text-xs text-gray-500">{session.data?.user?.email}</p>
                  </div>
                  <Check className="ml-auto h-5 w-5 text-green-600" />
                </div>
              </div>
              <label className="block">
                <span className="text-sm font-semibold text-gray-800">Organization name</span>
                <input
                  autoFocus
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Riverside Learning Co-op"
                  className="mt-2 h-11 w-full rounded-lg border border-gray-200 px-3 text-[15px] outline-none transition-colors placeholder:text-gray-400 focus:border-gray-400"
                />
                <span className="mt-2 block text-xs text-gray-500">
                  {slug ? <>Your address: <span className="font-semibold text-gray-700">{slug}</span>. </> : null}
                  You can add a description, logo and colors later.
                </span>
              </label>
              <p className="text-xs leading-5 text-gray-500">Starts on Free: up to 25 active learners and 2 staff. Need groups or more room? Ask for Full from your dashboard any time.</p>
            </form>
          )}
        </div>

        <div className="mt-6 flex items-center justify-between gap-3 border-t border-gray-100 px-5 pb-5 pt-4 sm:px-7 sm:pb-7">
          <Button type="button" variant="ghost" onClick={goBack} disabled={isSubmitting}>
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
          {signedIn ? (
            <Button type="submit" form="create-org" disabled={isSubmitting || !name.trim()}>
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {isSubmitting ? 'Creating...' : 'Create and open dashboard'}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
