'use client'

import React, { useMemo } from 'react'
import GeneralWrapperStyled from '@components/Objects/StyledElements/Wrappers/GeneralWrapper'
import ContentPageHeader from '@components/Objects/StyledElements/Headers/ContentPageHeader'
import ContentHeroSection, { ContentHeroButton } from '@components/Objects/StyledElements/Headers/ContentHeroSection'
import FeatureDisabledView from '@components/Dashboard/Shared/FeatureDisabled/FeatureDisabledView'
import CollectionsOverviewSection from '@components/Pages/Courses/CollectionsOverviewSection'
import UserCertificates from '@components/Pages/Trail/UserCertificates'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { getAPIUrl, getUriWithOrg, routePaths } from '@services/config/config'
import { getCourseThumbnailMediaDirectory } from '@services/media/media'
import { swrFetcher } from '@services/utils/ts/requests'
import { Award, BadgeCheck } from 'lucide-react'
import useSWR from 'swr'

interface CourseProps {
  orgslug: string
  collections: any
  org_id: string | number
  view?: 'discover' | 'mine'
}

function isCourseEarned(run: any) {
  const totalSteps = Number(run?.course_total_steps || 0)
  const completedSteps = Array.isArray(run?.steps) ? run.steps.length : 0
  return totalSteps > 0 && completedSteps >= totalSteps
}

function getRunTimestamp(run: any) {
  const dateValue =
    run?.update_date ||
    run?.updated_at ||
    run?.modified_at ||
    run?.creation_date ||
    run?.created_at

  const timestamp = dateValue ? new Date(dateValue).getTime() : 0
  return Number.isFinite(timestamp) ? timestamp : 0
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
  const inProgressBadge = useMemo(() => {
    const courses = (props.collections || []).flatMap((collection: any) =>
      (collection.courses || []).map((course: any) => ({
        ...course,
        owner_org_uuid: course.owner_org_uuid || collection.owner_org_uuid,
      }))
    )

    return courses
      .map((course: any) => ({
        course,
        run: trailRunsByCourseUuid.get(course.course_uuid),
      }))
      .filter(({ run }: any) => run && !isCourseEarned(run))
      .sort((a: any, b: any) => getRunTimestamp(b.run) - getRunTimestamp(a.run))[0]
  }, [props.collections, trailRunsByCourseUuid])

  return (
    <div className="w-full">
      <GeneralWrapperStyled>
        <ContentPageHeader
          orgslug={props.orgslug}
          tabs={[
            { href: '/badges', label: 'Discover', active: activeView === 'discover' },
            { href: '/badges?view=mine', label: 'My Badges', active: activeView === 'mine' },
          ]}
        />
        <FeatureDisabledView
          featureName="collections"
          orgslug={props.orgslug}
          icon={BadgeCheck}
          context="public"
        >
          {activeView === 'discover' ? (
            <>
              <ContentHeroSection
                eyebrow={inProgressBadge ? 'In progress' : 'Start here'}
                title={inProgressBadge ? inProgressBadge.course.name : 'Find a badge to get started'}
                body={
                  inProgressBadge
                    ? (inProgressBadge.course.description || inProgressBadge.course.about)
                    : 'Choose a badge path and complete the activities to earn your first badge.'
                }
                image={
                  inProgressBadge?.course.thumbnail_image ? (
                    <img
                      src={getCourseThumbnailMediaDirectory(
                        inProgressBadge.course.owner_org_uuid || '',
                        inProgressBadge.course.course_uuid,
                        inProgressBadge.course.thumbnail_image
                      )}
                      alt={inProgressBadge.course.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-white/65">
                      <Award size={42} strokeWidth={1.4} />
                    </div>
                  )
                }
              >
                {inProgressBadge && (
                  <ContentHeroButton
                    href={getUriWithOrg(
                      props.orgslug,
                      routePaths.org.badgePath(inProgressBadge.course.course_uuid.replace('course_', ''))
                    )}
                    label="Continue"
                  />
                )}
              </ContentHeroSection>
              <CollectionsOverviewSection
                collections={props.collections || []}
                orgslug={props.orgslug}
                org_id={props.org_id}
                trailRunsByCourseUuid={trailRunsByCourseUuid}
              />
            </>
          ) : (
            <UserCertificates orgslug={props.orgslug} showHeader={false} />
          )}
        </FeatureDisabledView>
      </GeneralWrapperStyled>
    </div>
  )
}

export default Courses
