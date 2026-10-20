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

  // eslint-disable-next-line no-unused-vars
  const save = async (change: (document: TemplateDocument) => TemplateDocument, done?: string) => {
    // A read-only template (another organization's, or staff viewing) is never saved; the API would refuse it.
    if (!template || stale || template.read_only) return false
    setSaving(true)
    try {
      const saved = await templatesApi.save(orgId, templateUuid, change(structuredClone(template.document)), template.etag, token)
      await mutate({ ...template, ...saved }, { revalidate: true })
      if (done) toast.success(done)
      return true
    } catch (failure: any) {
      if (isStaleTemplateError(failure)) setStale(true)
      else toast.error(failure?.message || 'Could not save the template.')
      return false
    } finally { setSaving(false) }
  }
  /** Puts a template the API returned (publish, restore, badge versions) in the cache and refetches. */
  const replace = async (next: Partial<TemplateDetail>) => { await mutate(template ? { ...template, ...next } : undefined, { revalidate: true }) }
  const reload = async () => { setStale(false); await mutate() }
  return { template, isLoading, error, saving, stale, save, replace, reload }
}

export type TemplateEditing = ReturnType<typeof useTemplate>

/** Shown when a save was refused because the draft changed since it was loaded. */
export function StaleTemplateBanner({ editing }: { editing: TemplateEditing }) {
  if (!editing.stale) return null
  return <div role="alert" className="mx-10 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
    <div><p className="text-sm font-black text-amber-950">Someone else saved this template</p><p className="text-xs text-amber-800">Your last change wasn&apos;t saved. Reload to get their version, then make it again.</p></div>
    <Button size="sm" variant="outline" onClick={() => void editing.reload()}><RefreshCw />Reload</Button>
  </div>
}
