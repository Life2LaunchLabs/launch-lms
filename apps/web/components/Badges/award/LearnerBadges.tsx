'use client'

import React from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { Medal } from 'lucide-react'
import { BadgeMedal } from '@components/Badges/BadgeMedal'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { badgeAwardKeys, badgeAwardsApi, badgeKindLabel } from '@services/badges/badges'
import { AwardBadgeButton } from './AwardFlow'

const shortDate = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString(undefined, { dateStyle: 'medium' })

/** A learner's badges in People, for staff: each opens its public page; those who may award one start from here with the learner picked. */
export default function LearnerBadges({ orgslug, orgId, token, person }: {
  orgslug: string; orgId: number; token?: string
  person: { id: number; name: string; username: string; avatar_image?: string | null; user_uuid?: string }
}) {
  const { data, mutate } = useSWR(orgId && token ? badgeAwardKeys.learner(orgId, person.id) : null, () => badgeAwardsApi.learner(orgId, person.id, token), { revalidateOnFocus: false })
  if (!data) return null
  return <section aria-label="Badges" className="rounded-xl border border-gray-100 bg-white p-5 nice-shadow">
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-sm font-bold text-gray-900">Badges</h2>
      {data.can_award ? <AwardBadgeButton people={[person]} onAwarded={() => void mutate()}
        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-gray-200 px-3 text-xs font-bold text-gray-800 hover:bg-gray-50"><Medal size={14} aria-hidden="true" />Award a badge</AwardBadgeButton> : null}
    </div>
    {data.awards.length ? <ul className="mt-3 divide-y divide-gray-100">{data.awards.map((award) => <li key={award.award_uuid}>
      <Link href={getUriWithOrg(orgslug, routePaths.org.badgeAward(award.award_uuid))} target="_blank" className="flex items-center gap-3 py-2.5 no-underline hover:opacity-85">
        <BadgeMedal badge={award.achievement} size={40} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-gray-900">{award.achievement.name}</span>
          <span className="block text-xs text-gray-500">{badgeKindLabel(award.achievement.kind)} · {shortDate(award.earned_on)}{award.source === 'direct_award' ? ` · Awarded directly${award.awarded_by ? ` by ${award.awarded_by.name}` : ''}` : ''}{award.issuing_org ? ` · ${award.issuing_org.name}` : ''}</span>
        </span>
      </Link>
    </li>)}</ul> : <p className="mt-2 text-xs text-gray-500">No badges yet. They earn one by finishing a plan that has a badge{data.can_award ? ', or you can award one for equivalent work' : ''}.</p>}
  </section>
}
