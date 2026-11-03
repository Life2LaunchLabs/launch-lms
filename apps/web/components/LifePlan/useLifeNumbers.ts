'use client'

import React from 'react'
import useSWR from 'swr'
import { lifeApi, lifeUrl, type Estimate, type LifeDoc, type Line, type Phase } from '@services/life/life'
import { estimateQuery, lineValue, project } from './model'

/** The catalog, every line's sourced estimate (looked up together), and what the plan adds up to. */
export default function useLifeNumbers(doc: LifeDoc | null | undefined, token?: string) {
  const { data: catalog } = useSWR(token ? lifeUrl('/catalog') : null, () => lifeApi.catalog(token), { revalidateOnFocus: false })
  const queries = React.useMemo(() => {
    if (!doc || !catalog) return []
    return doc.phases.flatMap((p) => p.lines.map((l) => estimateQuery(catalog, p, l)).filter(Boolean)) as NonNullable<ReturnType<typeof estimateQuery>>[]
  }, [doc, catalog])
  const qKey = JSON.stringify(queries)
  const { data: est, isLoading } = useSWR(token && queries.length ? ['life-estimates', qKey] : null, () => lifeApi.estimates(queries, token), { revalidateOnFocus: false, keepPreviousData: true })
  const estimates: Record<string, Estimate | null> = React.useMemo(() => est?.estimates || {}, [est])
  const valueOf = React.useCallback((p: Phase, l: Line) => lineValue(l, estimates[`${p.id}:${l.id}`]), [estimates])
  const projection = React.useMemo(() => (doc && doc.phases.length ? project(doc, valueOf) : null), [doc, valueOf])
  return { catalog, estimates, estimatesLoading: isLoading, valueOf, projection }
}
