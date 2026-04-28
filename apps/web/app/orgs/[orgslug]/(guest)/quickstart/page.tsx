import { redirect } from 'next/navigation'
import { routePaths, getUriWithOrg } from '@services/config/config'
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

  const org = await getOrganizationContextInfo(orgslug, {
    revalidate: 0,
    tags: ['organizations'],
  })

  const configuredCourseUuid = normalizeCourseUuid(getOrgQuickstartCourseUuid(org))

  if (configuredCourseUuid) {
    redirect(
      getUriWithOrg(
        orgslug,
        routePaths.org.quickstartCourse(configuredCourseUuid)
      )
    )
  }

  redirect(getUriWithOrg(orgslug, routePaths.auth.signup()))
}
