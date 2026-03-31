export const dynamic = 'force-dynamic'

import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getServerSession } from '@/lib/auth/server'
import { getOrganizationContextInfo } from '@services/organizations/orgs'
import { getGuestOnboardingCourse } from '@services/courses/courses'
import WelcomeClient from './welcome'

type PageProps = { params: Promise<{ orgslug: string }> }

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { orgslug } = await params
  const org = await getOrganizationContextInfo(orgslug, { revalidate: 0, tags: ['organizations'] })
  return {
    title: org?.name ? `Welcome to ${org.name}` : 'Welcome',
    description: org?.description || '',
  }
}

export default async function WelcomePage({ params }: PageProps) {
  const { orgslug } = await params

  // Authenticated users go straight to the home page
  const session = await getServerSession()
  if (session) {
    redirect('/')
  }

  const org = await getOrganizationContextInfo(orgslug, { revalidate: 0, tags: ['organizations'] })
  let onboardingCourse = null
  try {
    onboardingCourse = await getGuestOnboardingCourse(orgslug, { revalidate: 0, tags: ['courses'] }, null)
  } catch {
    onboardingCourse = null
  }

  return <WelcomeClient org={org} orgslug={orgslug} onboardingCourse={onboardingCourse} />
}
