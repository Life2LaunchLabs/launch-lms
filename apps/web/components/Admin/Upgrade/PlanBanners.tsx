'use client'
import React from 'react'
import useSWR from 'swr'
import { useOrg } from '@components/Contexts/OrgContext'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { useFeatures } from '@components/Hooks/useFeatures'
import { getAccessCatalog, getOrgUsage } from '@services/plans/access'
import UpgradeBanner, { useCanUpgrade } from './UpgradeBanner'

// Show the learner-limit prompt once the org has used this share of its active learners.
const NEAR_LIMIT = 0.8

function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? '' : 's'}`
}

/** Free's and Full's learner and staff limits, from the public tier catalog (with today's values until it loads). */
function useTierLimits() {
  const { data } = useSWR('access-catalog', getAccessCatalog, { revalidateOnFocus: false })
  const limits = (key: string, fallback: { learners: number; staff_seats: number }) => ({ ...fallback, ...data?.tiers.find((tier) => tier.key === key)?.limits })
  return { free: limits('free', { learners: 25, staff_seats: 2 }), full: limits('full', { learners: 200, staff_seats: 12 }) }
}

/** Home: the Full trial on offer, its countdown while it runs, and what changed once it ended. */
export function TrialBanner({ className }: { className?: string }) {
  const { access } = useFeatures()
  const { free, full } = useTierLimits()
  const trial = access.trial
  const base = access.base_tier || access.tier
  if (trial?.running) {
    // A fresh banner for the last days, even if the countdown was dismissed earlier.
    const ending = trial.days_left <= 5
    return (
      <UpgradeBanner id={ending ? 'trial-ending' : 'trial-running'} className={className}
        title={`Full trial: ${plural(trial.days_left, 'day')} left`}>
        Groups, bulk invites, and room for {full.learners} learners and {full.staff_seats} staff. When it ends nothing is deleted, but groups turn read-only and you can&rsquo;t add learners past {free.learners}. Request Full to keep it.
      </UpgradeBanner>
    )
  }
  if (trial && base === 'free') {
    return (
      <UpgradeBanner id="trial-ended" className={className} title="Your Full trial has ended">
        Your groups and their plans are still here, read-only. Learners past {free.learners} keep their plans, but you can&rsquo;t add more until you&rsquo;re under {free.learners} or on Full.
      </UpgradeBanner>
    )
  }
  if (access.trial_available) {
    return (
      <UpgradeBanner id="trial-offer" className={className} title="Try Full free for 30 days">
        Groups for classes and cohorts, bulk invites, and room for {full.learners} learners and {full.staff_seats} staff. Afterwards, request Full to keep it.
      </UpgradeBanner>
    )
  }
  return null
}

/** People: groups where Free has none (or read-only after a trial), and the learner limit as it gets close. */
export function PeopleBanners({ className }: { className?: string }) {
  const org = useOrg() as any
  const session = useLHSession() as any
  const token = session?.data?.tokens?.access_token
  const { access, has } = useFeatures()
  const canUpgrade = useCanUpgrade()
  const { full } = useTierLimits()
  const { data: usage } = useSWR(canUpgrade && token && org?.id ? ['org-usage', org.id] : null, () => getOrgUsage(org.id, token), { revalidateOnFocus: false })
  const learners = usage?.limits.learners
  const limit = typeof learners?.limit === 'number' ? learners.limit : 0

  if (limit && learners && learners.usage >= limit * NEAR_LIMIT) {
    return (
      <UpgradeBanner id={`learner-limit-${limit}`} className={className}
        title={learners.limit_reached ? `You've reached ${limit} active learners` : `${learners.usage} of ${limit} active learners`}>
        Mark learners who&rsquo;ve moved on as alumni to free their spots{(access.base_tier || access.tier) === 'free' ? `, or get room for ${full.learners} on Full` : ''}.
      </UpgradeBanner>
    )
  }
  if (access.features.groups?.read_only) {
    return (
      <UpgradeBanner id="groups-read-only" className={className} title="Groups are read-only">
        Your Full trial ended, so your groups and their chats stay as they are. Request Full to add people, make groups and hand them plans again.
      </UpgradeBanner>
    )
  }
  if (!has('groups')) {
    return (
      <UpgradeBanner id="groups" className={className} title="Groups are on Full">
        Put learners in a group to hand them one plan, follow them together and talk in one chat.
      </UpgradeBanner>
    )
  }
  return null
}
