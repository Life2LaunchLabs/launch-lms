'use client'

import React from 'react'
import useSWR from 'swr'
import toast from 'react-hot-toast'
import { RefreshCw } from 'lucide-react'
import { Button } from '@components/ui/button'
import { isStaleTemplateError, templateKeys, templatesApi, type TemplateDetail } from '@services/goals/templates'
import type { TemplateDocument } from '@services/goals/types'

/**
 * One template's draft for the editor. ``save`` sends the whole changed document with the etag it
 * was read at; if someone saved in between the API refuses (409) and ``stale`` turns on until reload.
 */
export function useTemplate(orgId: number, templateUuid: string, token?: string) {
  const key = orgId && token ? templateKeys.one(orgId, templateUuid) : null
  const { data: template, isLoading, error, mutate } = useSWR<TemplateDetail>(key, () => templatesApi.get(orgId, templateUuid, token), { revalidateOnFocus: false })
  const [saving, setSaving] = React.useState(false)
  const [stale, setStale] = React.useState(false)
  // Saves run one at a time, each on the document the last one left, so quick edits never race on the etag.
  const latest = React.useRef(template)
  const queue = React.useRef<Promise<unknown>>(Promise.resolve())
  const pending = React.useRef(0)
  const staleRef = React.useRef(false)
  React.useLayoutEffect(() => { if (!pending.current) latest.current = template }, [template])

  // eslint-disable-next-line no-unused-vars
  const saveNow = async (change: (document: TemplateDocument) => TemplateDocument, done?: string) => {
    const current = latest.current
    // A read-only template (another organization's, or staff viewing) is never saved; the API would refuse it.
    if (!current || staleRef.current || current.read_only) return false
    try {
      const saved = await templatesApi.save(orgId, templateUuid, change(structuredClone(current.document)), current.etag, token)
      latest.current = { ...current, ...saved }
      await mutate(latest.current, { revalidate: true })
      if (done) toast.success(done)
      return true
    } catch (failure: any) {
      if (isStaleTemplateError(failure)) { staleRef.current = true; setStale(true) }
      else toast.error(failure?.message || 'Could not save the template.')
      return false
    }
  }
  // eslint-disable-next-line no-unused-vars
  const save = (change: (document: TemplateDocument) => TemplateDocument, done?: string): Promise<boolean> => {
    pending.current += 1
    setSaving(true)
    const run = queue.current.then(() => saveNow(change, done)).finally(() => {
      pending.current -= 1
      if (!pending.current) setSaving(false)
    })
    queue.current = run.catch(() => undefined)
    return run
  }
  /** Puts a template the API returned (publish, restore, badge versions) in the cache and refetches. */
  const replace = async (next: Partial<TemplateDetail>) => { await mutate(template ? { ...template, ...next } : undefined, { revalidate: true }) }
  const reload = async () => { staleRef.current = false; setStale(false); await mutate() }
  return { template, isLoading, error, saving, stale, save, replace, reload }
}

export type TemplateEditing = ReturnType<typeof useTemplate>

/** Shown when a save was refused because the draft changed since it was loaded. */
export function StaleTemplateBanner({ editing }: { editing: TemplateEditing }) {
  if (!editing.stale) return null
  return <div role="alert" className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-amber-200 bg-amber-50 px-4 py-3">
    <div><p className="text-sm font-black text-amber-950">Someone else saved this template</p><p className="text-xs text-amber-800">Your last change wasn&apos;t saved. Reload to get their version, then make it again.</p></div>
    <Button size="sm" variant="outline" onClick={() => void editing.reload()}><RefreshCw />Reload</Button>
  </div>
}
