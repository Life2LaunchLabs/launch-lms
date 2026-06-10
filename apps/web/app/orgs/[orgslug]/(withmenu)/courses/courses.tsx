'use client'

import React, { useMemo } from 'react'
import GeneralWrapperStyled from '@components/Objects/StyledElements/Wrappers/GeneralWrapper'
import FeatureDisabledView from '@components/Dashboard/Shared/FeatureDisabled/FeatureDisabledView'
import CollectionsOverviewSection from '@components/Pages/Courses/CollectionsOverviewSection'
import UserCertificates from '@components/Pages/Trail/UserCertificates'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { getAPIUrl, getUriWithOrg } from '@services/config/config'
import { swrFetcher } from '@services/utils/ts/requests'
import { BadgeCheck, Compass } from 'lucide-react'
import Link from 'next/link'
import useSWR from 'swr'

interface CourseProps {
  orgslug: string
  collections: any
  org_id: string | number
  view?: 'discover' | 'mine'
}

function Courses(props: CourseProps) {
  const session = useLHSession() as any
  const accessToken = session?.data?.tokens?.access_token
  const activeView = props.view === 'mine' ? 'mine' : 'discover'

  const { data: trail } = useSWR(
    props.org_id && accessToken ? `${getAPIUrl()}trail/org/${props.org_id}/trail` : null,
    (url) => swrFetcher(url, accessToken),
    { revalidateOnFocus: false }
  )

  const trailRunsByCourseUuid = useMemo(() => {
    const runs = trail?.runs || []
    return new Map<string, any>(
      runs.map((run: any) => [run.course.course_uuid, run] as [string, any])
    )
  }, [trail])

  const discoverHref = getUriWithOrg(props.orgslug, '/badges')
  const myBadgesHref = getUriWithOrg(props.orgslug, '/badges?view=mine')

  return (
    <div className="w-full">
      <GeneralWrapperStyled>
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-4xl font-semibold tracking-normal text-gray-950">Badges</h3>
          <div className="inline-flex w-fit rounded-lg border border-gray-200 bg-gray-50 p-1">
            <Link
              href={discoverHref}
              className={`inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold transition-colors ${
                activeView === 'discover'
                  ? 'bg-white text-gray-950 shadow-sm'
                  : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              <Compass size={15} />
              Discover
            </Link>
            <Link
              href={myBadgesHref}
              className={`inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold transition-colors ${
                activeView === 'mine'
                  ? 'bg-white text-gray-950 shadow-sm'
                  : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              <BadgeCheck size={15} />
              My Badges
            </Link>
          </div>
        </div>
        <FeatureDisabledView
          featureName="collections"
          orgslug={props.orgslug}
          icon={BadgeCheck}
          context="public"
        >
          {activeView === 'discover' ? (
            <CollectionsOverviewSection
              collections={props.collections || []}
              orgslug={props.orgslug}
              org_id={props.org_id}
              trailRunsByCourseUuid={trailRunsByCourseUuid}
            />
          ) : (
            <UserCertificates orgslug={props.orgslug} showHeader={false} />
          )}
        </FeatureDisabledView>
      </GeneralWrapperStyled>
    </div>
  )
}

export default Courses
