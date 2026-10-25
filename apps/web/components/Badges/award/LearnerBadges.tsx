'use client'

import React from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { Medal } from 'lucide-react'
import { BadgeMedal } from '@components/Badges/BadgeMedal'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { badgeAwardKeys, badgeAwardsApi, badgeKindLabel, type BadgeAward } from '@services/badges/badges'
import { AwardBadgeButton } from './AwardFlow'

const shortDate = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString(undefined, { dateStyle: 'medium' })

/** Revoking one award: a reason (it's shown on the badge's page and kept in the audit log), then confirm. */
function RevokeAward({ award, token, onRevoked }: { award: BadgeAward; token?: string; onRevoked: () => void }) {
  const [open, setOpen] = React.useState(false)
  const [reason, setReason] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState('')
  if (!open) return <button type="button" onClick={() => setOpen(true)} className="shrink-0 rounded-lg px-2 py-1 text-xs font-bold text-red-700 hover:bg-red-50">Revoke</button>
  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await badgeAwardsApi.revoke(award.award_uuid, reason.trim(), token)
      onRevoked()
    } catch {
      setError('Could not revoke it. Try again.')
      setBusy(false)
    }
  }
  return <form onSubmit={submit} className="mb-2.5 flex basis-full flex-col gap-2 rounded-lg border border-red-100 bg-red-50/60 p-3">
    <label className="text-xs font-bold text-red-900" htmlFor={`revoke-${award.award_uuid}`}>Why are you revoking {award.achievement.name}?</label>
    <input id={`revoke-${award.award_uuid}`} value={reason} onChange={(event) => setReason(event.target.value)} autoFocus maxLength={500}
      placeholder="Awarded by mistake" className="h-9 rounded-lg border border-red-200 bg-white px-3 text-sm" />
    <p className="m-0 text-xs text-red-900/80">Its page will say it was revoked and why, and it stops counting as earned. Verifiers checking the credential will see it's revoked. You can award it again later.</p>
    {error ? <p role="alert" className="m-0 text-xs font-semibold text-red-700">{error}</p> : null}
    <div className="flex justify-end gap-2">
      <button type="button" onClick={() => { setOpen(false); setReason('') }} className="h-8 rounded-lg px-3 text-xs font-bold text-gray-700 hover:bg-white">Cancel</button>
      <button type="submit" disabled={!reason.trim() || busy} className="h-8 rounded-lg bg-red-700 px-3 text-xs font-bold text-white disabled:opacity-50">{busy ? 'Revoking…' : 'Revoke badge'}</button>
    </div>
  </form>
}

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
    {data.awards.length ? <ul className="mt-3 divide-y divide-gray-100">{data.awards.map((award) => { const revoked = award.status === 'revoked'; return <li key={award.award_uuid}>
      <div className="flex flex-wrap items-center gap-x-2">
      <Link href={getUriWithOrg(orgslug, routePaths.org.badgeAward(award.code))} target="_blank" className={`flex min-w-0 flex-1 items-center gap-3 py-2.5 no-underline hover:opacity-85${revoked ? ' opacity-60' : ''}`}>
        <BadgeMedal badge={award.achievement} size={40} />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2 text-sm font-semibold text-gray-900"><span className="truncate">{award.achievement.name}</span>{revoked ? <span className="shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-bold text-red-800">Revoked</span> : null}</span>
          <span className="block text-xs text-gray-500">{badgeKindLabel(award.achievement.kind)} · {shortDate(award.earned_on)}{award.source === 'direct_award' ? ` · Awarded directly${award.awarded_by ? ` by ${award.awarded_by.name}` : ''}` : ''}{award.issuing_org ? ` · ${award.issuing_org.name}` : ''}</span>
          {revoked && award.revoked_reason ? <span className="block truncate text-xs text-red-800">{award.revoked_reason}</span> : null}
        </span>
      </Link>
      {data.can_award && !revoked && award.issuing_org?.id === orgId ? <RevokeAward award={award} token={token} onRevoked={() => void mutate()} /> : null}
      </div>
    </li> })}</ul> : <p className="mt-2 text-xs text-gray-500">No badges yet. They earn one by finishing a plan that has a badge{data.can_award ? ', or you can award one for equivalent work' : ''}.</p>}
  </section>
}
