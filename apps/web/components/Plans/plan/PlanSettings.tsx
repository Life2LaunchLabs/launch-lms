'use client'

import React from 'react'
import toast from 'react-hot-toast'
import { mutate } from 'swr'
import { Check, ImageIcon } from 'lucide-react'
import OrgMediaPicker from '@components/Objects/Media/OrgMediaPicker'
import { SafeImage } from '@components/Objects/SafeImage'
import { GOAL_ICONS } from '@components/Goals/goalIcons'
import { PLAN_PALETTES } from '@components/Goals/planColors'
import { Textarea } from '@components/ui/textarea'
import TemplateLearnersCard from '@components/Plans/editor/TemplateLearnersCard'
import TemplateRoles from '@components/Plans/editor/TemplateRoles'
import type { TemplateEditing } from '@components/Plans/editor/useTemplate'
import { coverPalette } from '@components/Plans/shared/PlanCover'
import { smallActionClass, smallPrimaryClass } from '@components/Plans/shared/actions'
import { isTemplatesKey, templatesApi } from '@services/goals/templates'
import type { GoalIcon } from '@services/goals/types'
import { cn } from '@/lib/utils'
import PlanDialog from './PlanDialog'

type Props = { open: boolean; setOpen: React.Dispatch<React.SetStateAction<boolean>>; orgId: number; token?: string; editing: TemplateEditing; runOnly: boolean }

/**
 * Plan settings: its cover (image, else color and icon), instructions for staff, who can start it and the goal
 * roles. On another organization's plan this organization runs (`runOnly`), only who can start it,
 * which is this organization's own setting.
 */
export default function PlanSettings({ open, setOpen, orgId, token, editing, runOnly }: Props) {
  const template = editing.template!
  const done = <button type="button" className={smallPrimaryClass + ' h-10 px-4 text-sm'} onClick={() => setOpen(false)}>Done</button>
  if (runOnly) return <PlanDialog open={open} onOpenChange={setOpen} title="Plan settings" footer={done}><TemplateLearnersCard orgId={orgId} templateUuid={template.template_uuid} token={token} /></PlanDialog>
  return <PlanDialog open={open} onOpenChange={setOpen} title="Plan settings" footer={done}>
    <div className="flex flex-col gap-5">
      <Cover orgId={orgId} token={token} editing={editing} />
      <Instructions editing={editing} />
      {template.system_type ? null : <TemplateLearnersCard orgId={orgId} templateUuid={template.template_uuid} token={token} />}
      <details className="group rounded-xl border border-border">
        <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-bold">Goal roles<span className="text-xs font-normal text-muted-foreground">Who can do what on each learner’s goal ▾</span></summary>
        <div className="border-t border-border p-4"><TemplateRoles editing={editing} /></div>
      </details>
    </div>
  </PlanDialog>
}

/** The plan's image, color and icon, saved as they're picked. Plans keep one cover across versions. */
function Cover({ orgId, token, editing }: { orgId: number; token?: string; editing: TemplateEditing }) {
  const template = editing.template!
  const current = coverPalette(template).key
  const [picking, setPicking] = React.useState(false)
  const set = async (patch: { color?: string; icon?: GoalIcon; thumbnail_image?: string }) => {
    try {
      await editing.replace({ ...await templatesApi.setCover(orgId, template.template_uuid, patch, token) })
      await mutate(isTemplatesKey)
    } catch (error: any) { toast.error(error?.message || 'Could not change the cover.') }
  }
  return <section className="flex flex-col gap-2.5">
    <span className="text-[13px] font-bold">Cover</span>
    <div className="flex items-center gap-3">
      <div className="grid h-[54px] w-[86px] shrink-0 place-items-center overflow-hidden rounded-lg border border-border bg-muted text-muted-foreground">
        {template.thumbnail_image ? <SafeImage src={template.thumbnail_image} alt="" className="h-full w-full object-cover" /> : <ImageIcon size={18} aria-hidden="true" />}
      </div>
      <button type="button" className={smallActionClass} onClick={() => setPicking(true)}>{template.thumbnail_image ? 'Change image' : 'Add an image'}</button>
      {template.thumbnail_image ? <button type="button" className={smallActionClass} onClick={() => void set({ thumbnail_image: '' })}>Remove</button> : null}
    </div>
    <span className="text-[12.5px] text-muted-foreground">{template.thumbnail_image ? 'The image shows wherever the plan’s cover does.' : 'Without an image, the plan shows its icon on its color.'}</span>
    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Color">
      {PLAN_PALETTES.map((palette) => <button key={palette.key} type="button" role="radio" aria-checked={current === palette.key} aria-label={palette.label} onClick={() => void set({ color: palette.key })}
        className={cn('grid h-[30px] w-[30px] place-items-center rounded-full border-2 border-card text-white', current === palette.key ? 'ring-2 ring-foreground' : 'ring-1 ring-border')} style={{ background: palette.deep }}>
        {current === palette.key ? <Check size={14} aria-hidden="true" /> : null}
      </button>)}
    </div>
    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Icon">
      {GOAL_ICONS.map(({ key, label, icon: Icon }) => <button key={key} type="button" role="radio" aria-checked={(template.icon || 'target') === key} aria-label={label} onClick={() => void set({ icon: key })}
        className={cn('grid h-[38px] w-[38px] place-items-center rounded-[10px] border-[1.5px] bg-card', (template.icon || 'target') === key ? 'border-foreground' : 'border-border hover:border-foreground/40')}>
        <Icon size={18} aria-hidden="true" />
      </button>)}
    </div>
    {picking ? <OrgMediaPicker open onOpenChange={setPicking} title="Plan image" description="Find a free stock photo, upload one, or choose one from your media library." orgId={orgId} mediaType="image" accessToken={token}
      initialTab="stock" onSave={(asset) => set({ thumbnail_image: asset.url })} /> : null}
  </section>
}

/** Shown to staff when they hand the plan out, and the welcome message they start from. */
function Instructions({ editing }: { editing: TemplateEditing }) {
  const saved = editing.template?.document.template.instructions || ''
  const [text, setText] = React.useState(saved)
  React.useEffect(() => setText(saved), [saved])
  return <label className="flex flex-col gap-1.5 text-[13px] font-bold">Instructions for staff
    <span className="text-[12.5px] font-normal text-muted-foreground">Shown when they assign the plan, and the welcome message they start from.</span>
    <Textarea value={text} onChange={(event) => setText(event.target.value)} rows={4} className="font-normal" />
    {text !== saved ? <button type="button" className={smallActionClass + ' self-start'} disabled={editing.saving || editing.stale}
      onClick={() => void editing.save((document) => ({ ...document, template: { ...document.template, instructions: text } }), 'Instructions saved.')}>Save instructions</button> : null}
  </label>
}
