'use client'

import React from 'react'
import useSWR from 'swr'
import toast from 'react-hot-toast'
import { Switch } from '@components/ui/switch'
import { usePeopleContext } from '@components/Admin/People/usePeople'
import { peopleApi, peopleKeys, type MessagingPolicy } from '@services/school/people'

const SETTINGS: Array<{ key: keyof MessagingPolicy; title: string; hint: string }> = [
  { key: 'staff_dm_learners', title: 'Staff can message learners directly', hint: 'On by default. Off keeps every staff and learner conversation in a plan feed, where other staff can see it. Staff on a learner’s group always talk with them in their plan feed.' },
  { key: 'min_two_staff_on_feeds', title: 'At least two staff on every plan feed', hint: 'A learner’s plan feed takes messages only once a second staff member is on their group or plan.' },
  { key: 'helper_approval', title: 'Approve helpers on your plans', hint: 'When a learner asks for a helper, such as a parent, on a plan you gave them, the helper joins only after an admin approves.' },
]

/** The Organization tab's messaging policy: who can message whom, and how helpers join. */
export default function OrgEditMessaging() {
  const { orgId, token, isAdmin } = usePeopleContext()
  const { data, mutate } = useSWR(orgId && token ? peopleKeys.messaging(orgId) : null, () => peopleApi.messaging(orgId, token), { revalidateOnFocus: false })

  const toggle = async (key: keyof MessagingPolicy, value: boolean) => {
    if (!data) return
    const next = { ...data, [key]: value }
    try {
      await mutate(peopleApi.setMessaging(orgId, next, token), { optimisticData: next, rollbackOnError: true, revalidate: false })
      toast.success('Messaging policy saved')
    } catch (error: any) {
      toast.error(error?.message || 'That setting didn’t save')
    }
  }

  return (
    <div className="mx-0 rounded-xl bg-white nice-shadow sm:mx-10">
      <div className="mx-3 my-3 flex flex-col -space-y-1 rounded-md bg-gray-50 px-5 py-3">
        <h1 className="text-xl font-bold text-gray-800">Messaging and helpers</h1>
        <h2 className="text-base text-gray-500">Who can message whom in your organization. Helpers are never messaged directly, only in the plan feed they were invited to.</h2>
      </div>
      <ul className="divide-y divide-gray-100 px-5 pb-4">
        {SETTINGS.map((setting) => <li key={setting.key} className="flex items-start justify-between gap-6 py-4">
          <label htmlFor={`messaging-${setting.key}`} className="min-w-0">
            <span className="block text-sm font-semibold text-gray-900">{setting.title}</span>
            <span className="mt-1 block text-sm text-gray-500">{setting.hint}</span>
          </label>
          <Switch id={`messaging-${setting.key}`} checked={Boolean(data?.[setting.key])} disabled={!data || !isAdmin}
            onCheckedChange={(value) => void toggle(setting.key, value)} aria-label={setting.title}
            className="relative after:absolute after:-inset-x-2 after:-inset-y-3 after:content-[''] md:after:hidden" />
        </li>)}
      </ul>
      {!isAdmin ? <p className="px-5 pb-5 text-xs text-gray-500">Only admins change these.</p> : null}
    </div>
  )
}
