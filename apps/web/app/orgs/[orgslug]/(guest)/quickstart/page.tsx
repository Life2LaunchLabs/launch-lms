import { redirect } from 'next/navigation'
import { isRedirectError } from 'next/dist/client/components/redirect-error'
import { getServerSession } from '@/lib/auth/server'
import { routePaths, getUriWithOrg } from '@services/config/config'
import { getCourseMetadata, getGuestOnboardingCourse } from '@services/courses/courses'
import { getOrganizationContextInfo } from '@services/organizations/orgs'
import {
  getOrgQuickstartCourseUuid,
  normalizeCourseUuid,
} from '@services/org/quickstart'

type PageProps = {
  params: Promise<{ orgslug: string }>
}

export default async function QuickstartPage({ params }: PageProps) {
  const { orgslug } = await params
  const session = await getServerSession()
  const accessToken = session?.tokens?.access_token

  const org = await getOrganizationContextInfo(orgslug, {
    revalidate: 0,
    tags: ['organizations'],
  })

  const configuredCourseUuid = normalizeCourseUuid(getOrgQuickstartCourseUuid(org))

  if (configuredCourseUuid) {
    try {
      const course = await getCourseMetadata(
        configuredCourseUuid,
        { revalidate: 0, tags: ['courses'] },
        accessToken ?? undefined
      )
      const firstActivity = course?.chapters?.[0]?.activities?.[0]
      const canAccessCourse = Boolean(session) || Boolean(course?.public)

      if (firstActivity && canAccessCourse) {
        redirect(
          getUriWithOrg(
            orgslug,
            routePaths.org.courseActivity(
              configuredCourseUuid,
              firstActivity.activity_uuid.replace('activity_', '')
            )
          )
        )
      }
    } catch (error) {
      if (isRedirectError(error)) {
        throw error
      }
      // Fall through to the legacy guest-onboarding route if the configured
      // quickstart course cannot be loaded or accessed.
    }
  }

  try {
    const onboardingCourse = await getGuestOnboardingCourse(
      orgslug,
      { revalidate: 0, tags: ['courses'] },
      accessToken ?? undefined
    )
    const firstOnboardingActivity = onboardingCourse?.chapters?.[0]?.activities?.[0]

    if (firstOnboardingActivity) {
      redirect(
        getUriWithOrg(
          orgslug,
          routePaths.org.onboardingCourseActivity(
            onboardingCourse.course_uuid.replace('course_', ''),
            firstOnboardingActivity.activity_uuid.replace('activity_', '')
          )
        )
      )
    }
  } catch (error) {
    if (isRedirectError(error)) {
      throw error
    }
    // Fall back to signup if there is no quickstart destination.
  }

  redirect(getUriWithOrg(orgslug, routePaths.auth.signup()))
}
