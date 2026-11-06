'use client'

import React from 'react'
import useSWR from 'swr'
import toast from 'react-hot-toast'
import { AccessibilityControls } from '@components/Accessibility/AccessibilityControls'
import { accessibilityApi, accessibilityKeys, type AccessibilitySettings } from '@services/users/accessibility'

/**
 * A learner's accessibility settings, for staff assisting them (who can manage learners). The learner owns
 * them: they see who changed them and can change them back.
 */
export default function LearnerAccessibility({ orgId, userId, name, token }: { orgId: number; userId: number; name: string; token?: string }) {
  const { data, mutate } = useSWR(orgId && token ? accessibilityKeys.learner(orgId, userId) : null, () => accessibilityApi.learner(orgId, userId, token!),
    { revalidateOnFocus: false, shouldRetryOnError: false })
  if (!data || !token) return null
  const change = (patch: Partial<AccessibilitySettings>) => {
    const next = { ...data, ...patch }
    mutate(accessibilityApi.saveLearner(orgId, userId, next, token), { optimisticData: next, rollbackOnError: true, revalidate: false })
      .catch((err) => toast.error(err?.message || 'That didn’t save'))
  }
  return <section className="rounded-2xl border border-border bg-card p-5">
    <h2 className="text-sm font-bold">Accessibility</h2>
    <p className="mt-1 text-xs text-muted-foreground">Set these for {name} while you’re helping them. They’ll see you changed them and can change them back.{data.set_by ? ` Last set by ${data.set_by.name}.` : ''}</p>
    <div className="mt-2"><AccessibilityControls settings={data} onChange={change} forSomeoneElse /></div>
  </section>
}
