'use client'

import React from 'react'
import useSWR, { mutate as globalMutate } from 'swr'
import toast from 'react-hot-toast'
import { Loader2, Lock, Power } from 'lucide-react'
import Modal from '@components/Objects/StyledElements/Modal/Modal'
import { Button } from '@components/ui/button'
import { isTemplatesKey, templatesApi } from '@services/goals/templates'
import type { TemplateVersion } from '@services/goals/types'
import { cn } from '@/lib/utils'
import type { TemplateEditing } from '@components/Plans/editor/useTemplate'
import { parseSemver, plural, shortDate, versionLabel } from './planVersions'

/**
 * The version stack, newest on top: pick which one is live (rolling back or forward moves active
 * assignments to it), or turn the plan off so nothing new is assigned. Every version is locked.
 */
export default function LiveVersionModal({ open, setOpen, orgId, token, editing, canSwitch }: {
  open: boolean; setOpen: React.Dispatch<React.SetStateAction<boolean>>; orgId: number; token?: string; editing: TemplateEditing; canSwitch: boolean
}) {
  const template = editing.template!
  const versions = template.versions || []
  const [confirming, setConfirming] = React.useState<TemplateVersion | 'off' | null>(null)
  const [busy, setBusy] = React.useState(false)
  const { data: preview } = useSWR(open && canSwitch && token ? ['live-preview', orgId, template.template_uuid] : null, () => templatesApi.livePreview(orgId, template.template_uuid, token))
  React.useEffect(() => { if (!open) setConfirming(null) }, [open])
  const live = template.live_version

  const apply = async () => {
    if (!confirming) return
    setBusy(true)
    try {
      const result = await templatesApi.setLive(orgId, template.template_uuid, confirming === 'off' ? null : confirming.version_uuid, token)
      await editing.replace(result)
      await globalMutate(isTemplatesKey)
      toast.success(confirming === 'off' ? 'The plan is inactive. Assignments keep running the version they’re on.'
        : `${versionLabel(confirming)} is live${result.moved?.plans ? `; ${plural(result.moved.plans, 'learner plan')} moved to it` : ''}.`)
      setOpen(false)
    } catch (error: any) { toast.error(error?.message || 'Could not change the live version.') } finally { setBusy(false) }
  }

  const direction = (version: TemplateVersion) => {
    const a = parseSemver(version.semver), b = parseSemver(live?.semver)
    return a && b && (a[0] - b[0] || a[1] - b[1] || a[2] - b[2]) < 0 ? 'Roll back to' : 'Make live:'
  }
  const moving = preview?.open_plans ? `${plural(preview.open_plans, 'learner plan')} in ${plural(preview.assignments, 'active assignment')} will move to it. Steps learners already started stay as they were; finished plans don’t change.` : 'No active assignments to move.'

  return <Modal isDialogOpen={open} onOpenChange={setOpen} minHeight="no-min" minWidth="sm" dialogTitle="Versions"
    dialogDescription={canSwitch ? 'The live version is what new assignments get. Published versions are locked.' : 'Published versions are locked.'}
    dialogContent={confirming ? <div className="space-y-4" data-testid="live-confirm">
      <p className="text-base font-black">{confirming === 'off' ? 'Turn this plan off?' : `${direction(confirming)} ${versionLabel(confirming)}?`}</p>
      <p className="text-sm text-muted-foreground">{confirming === 'off'
        ? 'Nobody can be assigned or start it until you pick a live version again. Current assignments keep running the version they’re on.'
        : moving}</p>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => setConfirming(null)} disabled={busy}>Back</Button>
        <Button onClick={() => void apply()} disabled={busy} variant={confirming === 'off' ? 'destructive' : 'default'}>{busy ? <Loader2 className="animate-spin" /> : null}{confirming === 'off' ? 'Turn off' : 'Make live'}</Button>
      </div>
    </div> : <div className="space-y-2">
      {template.draft ? <div className="flex items-center gap-3 rounded-xl border border-dashed border-amber-300 bg-amber-50/60 px-3 py-2.5 text-sm text-amber-900">
        <span className="font-black">v{template.draft.semver}</span><span className="min-w-0 flex-1 truncate">Draft{template.draft.note ? ` · ${template.draft.note}` : ''}</span>
      </div> : null}
      {versions.length ? versions.map((version) => <div key={version.version_uuid} className={cn('flex items-center gap-3 rounded-xl border px-3 py-2.5', version.live ? 'border-emerald-300 bg-emerald-50/60' : 'border-border')}>
        <Lock size={13} className="shrink-0 text-muted-foreground" aria-label="Locked" />
        <div className="min-w-0 flex-1">
          <p className="text-sm"><span className="font-black">{versionLabel(version)}</span>{version.live ? <span className="ml-2 rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-black uppercase text-white">Live</span> : null}</p>
          <p className="truncate text-xs text-muted-foreground">{[version.note, shortDate(version.published_at)].filter(Boolean).join(' · ')}</p>
        </div>
        {canSwitch && !version.live ? <Button size="sm" variant="outline" onClick={() => setConfirming(version)}>Make live</Button> : null}
      </div>) : <p className="text-sm text-muted-foreground">Nothing published yet.</p>}
      {canSwitch && live ? <button type="button" onClick={() => setConfirming('off')} className="mt-2 inline-flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-bold text-red-700 hover:bg-red-50"><Power size={13} />Turn off (no live version)</button> : null}
    </div>} />
}
