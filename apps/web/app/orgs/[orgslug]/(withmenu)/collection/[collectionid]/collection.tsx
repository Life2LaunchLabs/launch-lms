'use client'

import Breadcrumbs from '@components/Objects/Breadcrumbs/Breadcrumbs'
import GeneralWrapperStyled from '@components/Objects/StyledElements/Wrappers/GeneralWrapper'
import { getAPIUrl, getUriWithOrg } from '@services/config/config'
import React, { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { useOrg } from '@components/Contexts/OrgContext'
import PageLoading from '@components/Objects/Loaders/PageLoading'
import useSWR from 'swr'
import { swrFetcher } from '@services/utils/ts/requests'
import PublicCourseCard from '@components/Pages/Courses/PublicCourseCard'
import { Books } from '@phosphor-icons/react'

const CollectionClient = ({ orgslug, collectionid }: { orgslug: string; collectionid: string }) => {
  const { t } = useTranslation()
  const session = useLHSession() as any
  const access_token = session?.data?.tokens?.access_token
  const org = useOrg() as any

  const { data: col } = useSWR(
    collectionid && access_token ? [`collections/collection_${collectionid}`, access_token] : null,
    ([, token]) => swrFetcher(`${getAPIUrl()}collections/collection_${collectionid}`, token)
  )
  const { data: trail } = useSWR(
    org?.id && access_token ? `${getAPIUrl()}trail/org/${org.id}/trail` : null,
    (url) => swrFetcher(url, access_token),
    { revalidateOnFocus: false }
  )
  const trailRunsByCourseUuid = useMemo(() => {
    const runs = trail?.runs || []
    return new Map(runs.map((run: any) => [run.course.course_uuid, run]))
  }, [trail])

  if (!col) return <PageLoading />

  return (
    <GeneralWrapperStyled>
      <div className="pb-4">
        <Breadcrumbs
          items={[
            {
              label: t('courses.courses'),
              href: getUriWithOrg(orgslug, '/courses'),
              icon: <Books size={14} weight="fill" />,
            },
            { label: col.name },
          ]}
        />
      </div>
      <h2 className="text-sm font-bold text-gray-400">{t('collections.collection')}</h2>
      <h1 className="text-3xl font-bold">{col.name}</h1>
      <br />
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {col.courses.map((course: any) => (
          <div key={course.course_uuid}>
            <PublicCourseCard
              course={course}
              orgslug={orgslug}
              run={trailRunsByCourseUuid.get(course.course_uuid)}
              orgName={org?.name}
            />
          </div>
        ))}
      </div>
    </GeneralWrapperStyled>
  )
}

export default CollectionClient
