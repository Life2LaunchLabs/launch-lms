import { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { getServerSession } from '@/lib/auth/server'
import { getCourseMetadata } from '@services/courses/courses'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { getOrganizationContextInfo } from '@services/organizations/orgs'
import { getOrgQuickstartCourseUuid, normalizeCourseUuid } from '@services/org/quickstart'

type PageProps = {
  params: Promise<{ orgslug: string; courseuuid: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { orgslug } = await params
  const org = await getOrganizationContextInfo(orgslug, {
    revalidate: 0,
    tags: ['organizations'],
  })

  return {
    title: org?.name ? `${org.name} Quickstart` : 'Quickstart',
    description: org?.description || '',
  }
}

export default async function QuickstartCoursePage({ params }: PageProps) {
  const { orgslug, courseuuid } = await params
  const session = await getServerSession()
  const accessToken = session?.tokens?.access_token

  const org = await getOrganizationContextInfo(orgslug, {
    revalidate: 0,
    tags: ['organizations'],
  })
  const configuredCourseUuid = normalizeCourseUuid(getOrgQuickstartCourseUuid(org))

  if (!configuredCourseUuid || configuredCourseUuid !== normalizeCourseUuid(courseuuid)) {
    redirect(getUriWithOrg(orgslug, routePaths.org.quickstart()))
  }

  let courseMeta = null
  let fetchError: { status?: number } | null = null

  try {
    courseMeta = await getCourseMetadata(
      courseuuid,
      { revalidate: 0, tags: ['courses'] },
      accessToken ?? undefined
    )
  } catch (error: any) {
    fetchError = { status: error?.status }
  }

  if (!session && fetchError?.status === 401) {
    redirect('/welcome')
  }

  if (!courseMeta && !fetchError) {
    notFound()
  }

  const firstActivity = courseMeta?.chapters?.[0]?.activities?.[0]

  if (firstActivity) {
    redirect(
      getUriWithOrg(
        orgslug,
        routePaths.org.quickstartCourseActivity(
          courseuuid,
          firstActivity.activity_uuid.replace('activity_', '')
        )
      )
    )
  }

  notFound()
}
