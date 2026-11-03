'use client'

import React from 'react'
import useSWR from 'swr'
import { toast } from 'react-hot-toast'
import { lifeApi, lifeUrl, type LifeDoc } from '@services/life/life'
import { newDoc } from '@components/LifePlan/model'

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x))

/**
 * The learner's life plan (their phases) for the plans pages, with one way to change it.
 * It shares its SWR key with every other reader of the plan, so a change shows everywhere.
 */
export default function useLifePlan(token?: string) {
  const { data, error, isLoading, mutate } = useSWR(token ? lifeUrl('/plan') : null, () => lifeApi.get(token), { revalidateOnFocus: false })
  const [busy, setBusy] = React.useState(false)
  const doc = data?.plan?.document || null

  /** Apply `fn` to a copy of the plan (a fresh one when there is none yet) and save it. Resolves to the saved plan, or null. */
  // eslint-disable-next-line no-unused-vars -- parameter names in a function type
  const change = React.useCallback(async (fn: (next: LifeDoc) => void): Promise<LifeDoc | null> => {
    const next = doc ? clone(doc) : newDoc()
    fn(next)
    setBusy(true)
    try {
      const res = await lifeApi.save(next, data?.plan?.revision ?? null, token)
      await mutate({ plan: res.plan }, { revalidate: false })
      return res.plan.document
    } catch (e: any) {
      if (e?.status === 409) { toast.error('Your plan changed in another window. Loading the newest version.'); await mutate() }
      else toast.error("Couldn't save your plan. Try again in a moment.")
      return null
    } finally { setBusy(false) }
  }, [doc, data, token, mutate])

  return { doc, error, isLoading: isLoading || (Boolean(token) && !data && !error), change, busy }
}
