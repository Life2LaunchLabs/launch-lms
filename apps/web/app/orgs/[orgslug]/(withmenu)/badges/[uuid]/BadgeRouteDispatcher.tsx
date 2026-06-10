'use client'

import { useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import PageLoading from '@components/Objects/Loaders/PageLoading'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { getAPIUrl, getUriWithOrg, routePaths } from '@services/config/config'
import { findCourseRun, getCourseCompletionSummary } from '@services/courses/progress'
import { swrFetcher } from '@services/utils/ts/requests'

export default function BadgeRouteDispatcher({
  course,
  courseuuid,
  orgslug,
}: {
  course: any
  courseuuid: string
  orgslug: string
}) {
  const router = useRouter()
  const session = useLHSession() as any
  const accessToken = session?.data?.tokens?.access_token
  const ownerOrgId = course?.owner_org_id
  const { data: trail, isLoading } = useSWR(
    ownerOrgId ? `${getAPIUrl()}trail/org/${ownerOrgId}/trail` : null,
    (url) => swrFetcher(url, accessToken),
    { revalidateOnFocus: false }
  )
  const run = useMemo(() => findCourseRun(trail, course), [course, trail])
  const { isCompleted } = useMemo(
    () => getCourseCompletionSummary(course, run),
    [course, run]
  )

  useEffect(() => {
    if (isLoading) return

    const destination = run && !isCompleted
      ? routePaths.org.badgePath(courseuuid)
      : routePaths.org.badgeStatus(courseuuid)

    router.replace(getUriWithOrg(orgslug, destination))
  }, [courseuuid, isCompleted, isLoading, orgslug, router, run])

  return <PageLoading />
}
