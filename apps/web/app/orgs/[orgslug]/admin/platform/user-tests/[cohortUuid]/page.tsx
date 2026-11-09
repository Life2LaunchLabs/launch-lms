'use client'
import { use } from 'react'
import UserTestsCohort from '@components/Admin/Platform/UserTests/UserTestsCohort'

export default function UserTestCohortPage({ params }: { params: Promise<{ cohortUuid: string }> }) {
  const { cohortUuid } = use(params)
  return <UserTestsCohort cohortUuid={decodeURIComponent(cohortUuid)} />
}
