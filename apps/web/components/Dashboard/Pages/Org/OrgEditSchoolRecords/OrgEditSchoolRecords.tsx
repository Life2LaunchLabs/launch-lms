'use client'

import React from 'react'
import toast from 'react-hot-toast'
import { mutate } from 'swr'
import { Switch } from '@components/ui/switch'
import { usePeopleContext } from '@components/Admin/People/usePeople'
import { schoolRecordsOn } from '@components/Hooks/useSchoolRecords'
import { getAPIUrl } from '@services/config/config'
import { revalidateTags } from '@services/utils/ts/requests'
import { schoolRecordsApi } from '@services/school/support'
import { inOrgWords } from '@/lib/people'

/**
 * Org settings: whether the organization uses school records and the Education Plan and Profile (PL-6).
 * Off, no one in the organization sees a school record, course plan, EPP or a school's ask to support them.
 * Turning it off keeps what was saved; turning it on again shows it.
 */
export default function OrgEditSchoolRecords() {
  const { org, token, isOwnerAdmin: isAdmin } = usePeopleContext() as { org: any; token?: string; isOwnerAdmin: boolean }
  const saved = schoolRecordsOn(org)
  const [on, setOn] = React.useState(saved)
  const [busy, setBusy] = React.useState(false)
  React.useEffect(() => setOn(saved), [saved])

  const toggle = async (value: boolean) => {
    if (!org?.id) return
    setOn(value)
    setBusy(true)
    try {
      await schoolRecordsApi.set(org.id, value, token)
      await revalidateTags(['organizations'], org.slug)
      await mutate(`${getAPIUrl()}orgs/slug/${org.slug}`)
      toast.success(value ? 'School records are on' : 'School records are off')
    } catch (error: any) {
      setOn(!value)
      toast.error(error?.message || 'That setting didn’t save')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-0 mt-6 rounded-xl bg-white nice-shadow sm:mx-10">
      <div className="mx-3 my-3 flex flex-col -space-y-1 rounded-md bg-gray-50 px-5 py-3">
        <h2 className="text-xl font-bold text-gray-800">School records</h2>
        <p className="text-base text-gray-500">For schools that keep an Education Plan and Profile for each student.</p>
      </div>
      <div className="flex items-start justify-between gap-6 px-5 pb-5 pt-2">
        <label htmlFor="school-records" className="min-w-0">
          <span className="block text-sm font-semibold text-gray-900">Use school records and the Education Plan and Profile</span>
          <span className="mt-1 block text-sm text-gray-500">
            {inOrgWords('On, staff can ask learners to share their plan, keep a course plan and school record for each one, and review and export their Education Plan and Profile. Off, none of this shows to anyone in your organization. Turning it off keeps what was saved.')}
          </span>
        </label>
        <Switch id="school-records" checked={on} disabled={!isAdmin || busy || !org?.id} onCheckedChange={(value) => void toggle(value)}
          aria-label="Use school records and the Education Plan and Profile"
          className="relative after:absolute after:-inset-x-2 after:-inset-y-3 after:content-[''] md:after:hidden" />
      </div>
      {!isAdmin ? <p className="px-5 pb-5 text-xs text-gray-500">Only admins change this.</p> : null}
    </div>
  )
}
