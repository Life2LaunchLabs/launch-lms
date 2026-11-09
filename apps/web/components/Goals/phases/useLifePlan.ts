'use client'

import React from 'react'
import useSWR from 'swr'
import { toast } from 'react-hot-toast'
import { lifeApi, lifeUrl, type LifeDoc } from '@services/life/life'
import { newDoc } from '@components/LifePlan/model'
import { normalize } from './graph'
import { useShown } from './way'

import { tr } from '@/lib/tr'
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x))

/**
 * The learner's life plan (their phases) for the plans pages, with one way to change it.
 * It shares its SWR key with every other reader of the plan, so a change shows everywhere.
 */
export default function useLifePlan(token?: string) {
  const { data, error, isLoading, mutate } = useSWR(token ? lifeUrl('/plan') : null, () => lifeApi.get(token), { revalidateOnFocus: false })
  const [busy, setBusy] = React.useState(false)
  const saved = data?.plan?.document || null
  // Dates follow the way the learner is looking at (which option each split shows), on every page.
  const shown = useShown()
  const doc = React.useMemo(() => (saved?.phases?.length ? normalize(saved, shown) : saved), [saved, shown])

  /** Apply `fn` to a copy of the plan (a fresh one when there is none yet) and save it. Resolves to the saved plan, or null. */
  // eslint-disable-next-line no-unused-vars -- parameter names in a function type
  const change = React.useCallback(async (fn: (next: LifeDoc) => void): Promise<LifeDoc | null> => {
    const next = doc ? clone(doc) : newDoc()
    fn(next)
    // Saved with the dates of the learner's first choices, which is what other people see.
    if (next.phases?.length) Object.assign(next, normalize(next, {}))
    setBusy(true)
    try {
      const res = await lifeApi.save(next, data?.plan?.revision ?? null, token)
      await mutate({ plan: res.plan }, { revalidate: false })
      return res.plan.document
    } catch (e: any) {
      if (e?.status === 409) { toast.error(tr('goals.use_life_plan.your_plan_changed_in_another', 'Your plan changed in another window. Loading the newest version.')); await mutate() }
      else toast.error(tr('goals.use_life_plan.couldn_t_save_your_plan', 'Couldn\'t save your plan. Try again in a moment.'))
      return null
    } finally { setBusy(false) }
  }, [doc, data, token, mutate])

  return { doc, error, isLoading: isLoading || (Boolean(token) && !data && !error), change, busy }
}
