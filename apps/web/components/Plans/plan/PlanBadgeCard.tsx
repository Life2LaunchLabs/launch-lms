'use client'

import React from 'react'
import Link from 'next/link'
import { Eye, Medal, Pencil, Plus, Upload, X } from 'lucide-react'
import { useOrg } from '@components/Contexts/OrgContext'
import { BadgeMedal, medalColor } from '@components/Badges/BadgeMedal'
import { AwardBadgeButton } from '@components/Badges/award/AwardFlow'
import Certificate from '@components/Badges/Certificate'
import OrgMediaPicker from '@components/Objects/Media/OrgMediaPicker'
import { useTemplateLearners } from '@components/Plans/editor/TemplateLearnersCard'
import type { TemplateEditing } from '@components/Plans/editor/useTemplate'
import { smallActionClass, smallGhostClass, smallPrimaryClass } from '@components/Plans/shared/actions'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { getOrgLogoMediaDirectory, normalizeMediaUrl } from '@services/media/media'
import { BADGE_KINDS, CERTIFICATE_STYLES, badgeKindLabel, emptyTemplateBadge, type TemplateBadge } from '@services/badges/badges'
import type { TemplateDetail } from '@services/goals/templates'
import type { TemplateDocument } from '@services/goals/types'
import { cn } from '@/lib/utils'
import { AsideCard, Tag } from './AsideCard'
import PlanDialog from './PlanDialog'

type Props = { orgslug: string; orgId: number; token?: string; editing: TemplateEditing; document: TemplateDocument; canEdit: boolean }

/** The badge as a card or certificate shows it: the block, with the plan's title, image and color filling the gaps. */
function shown(template: TemplateDetail, document: TemplateDocument, block: TemplateBadge) {
  return {
    name: block.name || document.template.title || template.title,
    description: document.template.description || '',
    kind: block.kind,
    image_url: normalizeMediaUrl(block.image_url || String(template.thumbnail_image || '')) || '',
    icon: template.icon, color: template.color,
  }
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

/**
 * The badge learners earn by finishing the plan. It's part of the plan, so it changes in the draft
 * and reaches learners when that version goes live; on your own plan, add, edit or remove it here.
 */
export default function PlanBadgeCard({ orgslug, orgId, token, editing, document, canEdit }: Props) {
  const template = editing.template!
  const { data: learners } = useTemplateLearners(orgId, template.template_uuid, token)
  const [open, setOpen] = React.useState<'view' | 'edit' | null>(null)
  const block = document.badge
  const draftChanged = canEdit && !!template.draft && !!template.live_document && !same(template.document?.badge, template.live_document?.badge)
  if (!block) {
    if (!canEdit) return null
    return <AsideCard icon={<Medal size={16} />} title="Badge" tag={draftChanged ? <Tag>Changed in draft</Tag> : <Tag>Off</Tag>}>
      <p className="mt-2 text-[13.5px] leading-[1.45] text-muted-foreground">Give learners who finish an Open Badge and a certificate they keep.</p>
      <button type="button" className={smallActionClass + ' mt-3'} onClick={() => setOpen('edit')}><Plus />Add a badge</button>
      <BadgeDialog open={open} setOpen={setOpen} orgslug={orgslug} orgId={orgId} token={token} editing={editing} canEdit={canEdit} />
    </AsideCard>
  }
  const badge = shown(template, document, block)
  return <AsideCard icon={<Medal size={16} />} title="Badge" tag={draftChanged ? <Tag>Changed in draft</Tag> : null}>
    <button type="button" onClick={() => setOpen('view')} className="mt-3 flex w-full items-center gap-3.5 rounded-xl text-left hover:opacity-85">
      <BadgeMedal badge={badge} size={64} />
      <span className="min-w-0">
        <span className="block text-[11px] font-black uppercase tracking-wide text-muted-foreground">{badgeKindLabel(block.kind)}</span>
        <b className="block truncate text-sm">{badge.name}</b>
        <span className="block text-[12.5px] leading-snug text-muted-foreground">Awarded when a learner finishes every step.</span>
      </span>
    </button>
    {block.skills.length ? <div className="mt-2.5 flex flex-wrap gap-1">{block.skills.slice(0, 6).map((skill) => <span key={skill} className="rounded-full bg-muted px-2 py-0.5 text-[11.5px] font-semibold">{skill}</span>)}</div> : null}
    {learners && learners.badge && !learners.earns_badge ? <p className="mt-2 text-[12.5px] text-amber-700 dark:text-amber-300">Finishing it here doesn’t earn the badge: your organization isn’t approved to run this plan.</p> : null}
    <div className="mt-3 flex flex-wrap gap-2">
      <button type="button" className={smallActionClass} onClick={() => setOpen('view')}><Eye />View</button>
      {canEdit ? <button type="button" className={smallActionClass} onClick={() => setOpen('edit')}><Pencil />Edit</button> : null}
      {template.live_document?.badge ? <AwardBadgeButton templateUuid={template.template_uuid} className={smallActionClass}><Medal />Award directly</AwardBadgeButton> : null}
    </div>
    <BadgeDialog open={open} setOpen={setOpen} orgslug={orgslug} orgId={orgId} token={token} editing={editing} canEdit={canEdit} />
  </AsideCard>
}

type DialogProps = {
  open: 'view' | 'edit' | null
  setOpen: React.Dispatch<React.SetStateAction<'view' | 'edit' | null>>
  orgslug: string; orgId: number; token?: string; editing: TemplateEditing; canEdit: boolean
}

/** One badge, styled like the card: its medal and name on top, then its fields as a table, edited in place, or its certificate. */
function BadgeDialog({ open, setOpen, orgslug, orgId, token, editing, canEdit }: DialogProps) {
  const template = editing.template!
  const org = useOrg() as { name?: string; org_uuid?: string; logo_image?: string } | null
  // Edits go to the draft, so the dialog shows the draft's badge (the card may be showing the live one).
  const current = template.document?.badge || null
  const [draft, setDraft] = React.useState<TemplateBadge>(() => current || emptyTemplateBadge())
  const [certificate, setCertificate] = React.useState(false)
  const [removing, setRemoving] = React.useState(false)
  const [picking, setPicking] = React.useState(false)
  const [skill, setSkill] = React.useState('')
  const [more, setMore] = React.useState(false)
  React.useEffect(() => {
    if (!open) return
    setDraft({ ...emptyTemplateBadge(), ...(current || {}) })
    setCertificate(false); setRemoving(false); setSkill('')
    setMore(!!current && !!(current.human_code || current.field_of_study || current.specialization || current.credits_available != null || current.in_language))
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps
  const edit = open === 'edit' && canEdit
  const document = template.document!
  const badge = shown(template, document, edit ? draft : current || draft)
  const achievement = template.badge
  const set = (patch: Partial<TemplateBadge>) => setDraft((value) => ({ ...value, ...patch }))
  const addSkill = () => {
    const value = skill.trim()
    if (value && !draft.skills.includes(value)) set({ skills: [...draft.skills, value].slice(0, 12) })
    setSkill('')
  }
  const save = async () => {
    const ok = await editing.save((doc) => ({ ...doc, badge: { ...draft, name: draft.name.trim() === (doc.template.title || '').trim() ? '' : draft.name.trim() } }),
      current ? 'Badge saved to the draft. It changes for learners when this version goes live.' : 'Badge added to the draft. Learners earn it once this version goes live.')
    if (ok) setOpen(null)
  }
  const remove = async () => {
    const ok = await editing.save((doc) => { const next = { ...doc }; delete next.badge; return next }, 'Badge removed from the draft. Anyone who earned it keeps theirs.')
    if (ok) setOpen(null)
  }
  const shownBlock = edit ? draft : current
  const criteriaPage = getUriWithOrg(orgslug, routePaths.org.discoverPlan(template.template_uuid))
  const rows: Array<{ label: string; spec: string; view: React.ReactNode; editor?: React.ReactNode }> = [
    { label: 'Image', spec: 'image', view: <span className="flex items-center gap-2.5"><BadgeMedal badge={badge} size={36} />{shownBlock?.image_url ? 'Its own image' : 'The plan’s image'}</span>,
      editor: <span className="flex flex-wrap items-center gap-2.5"><BadgeMedal badge={badge} size={36} /><button type="button" className={smallActionClass} onClick={() => setPicking(true)}><Upload />Upload</button>{draft.image_url ? <button type="button" className={smallGhostClass} onClick={() => set({ image_url: '' })}>Use the plan’s image</button> : null}</span> },
    { label: 'Name', spec: 'name', view: <>{badge.name}{!(current?.name) ? <span className="text-muted-foreground"> (the plan’s title)</span> : null}</>,
      editor: <input value={draft.name} onChange={(event) => set({ name: event.target.value })} maxLength={120} placeholder={document.template.title || 'The plan’s title'} className="h-9 w-full rounded-lg border border-border bg-background px-2.5 text-sm" /> },
    { label: 'Kind', spec: 'achievementType', view: badgeKindLabel(badge.kind),
      editor: <select value={draft.kind} onChange={(event) => set({ kind: event.target.value as TemplateBadge['kind'] })} className="h-9 rounded-lg border border-border bg-background px-2 text-sm">{BADGE_KINDS.map((kind) => <option key={kind.key} value={kind.key}>{kind.label}</option>)}</select> },
    { label: 'Description', spec: 'description', view: badge.description || <span className="text-muted-foreground">The plan’s description (none yet)</span> },
    { label: 'How it’s earned', spec: 'criteria.narrative', view: <span className="whitespace-pre-line">{achievement?.criteria_narrative || `Finish every step of ${document.template.title || template.title}.`}</span> },
    { label: 'Skills', spec: 'tag', view: shownBlock?.skills.length ? <span className="flex flex-wrap gap-1">{shownBlock.skills.map((item) => <span key={item} className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold">{item}</span>)}</span> : <span className="text-muted-foreground">None yet</span>,
      editor: <div className="flex flex-wrap items-center gap-1 rounded-lg border border-border bg-background p-1.5">
        {draft.skills.map((item) => <span key={item} className="inline-flex items-center gap-1 rounded-full bg-muted py-0.5 pl-2 pr-1 text-xs font-semibold">{item}<button type="button" aria-label={`Remove ${item}`} onClick={() => set({ skills: draft.skills.filter((other) => other !== item) })} className="grid h-4 w-4 place-items-center rounded-full hover:bg-background"><X size={11} /></button></span>)}
        <input value={skill} onChange={(event) => setSkill(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ',') { event.preventDefault(); addSkill() } }} onBlur={addSkill} placeholder="Add a skill and press Enter" className="min-w-[160px] flex-1 bg-transparent px-1 text-sm outline-none" aria-label="Add a skill" />
      </div> },
    { label: 'Certificate', spec: 'style', view: `${CERTIFICATE_STYLES.find((style) => style.key === (shownBlock || draft).style)?.label || 'Modern'} style, in the plan’s color`,
      editor: <select value={draft.style} onChange={(event) => set({ style: event.target.value as TemplateBadge['style'] })} className="h-9 rounded-lg border border-border bg-background px-2 text-sm">{CERTIFICATE_STYLES.map((style) => <option key={style.key} value={style.key}>{style.label}</option>)}</select> },
    { label: 'Criteria page', spec: 'criteria.id', view: <Link href={criteriaPage} className="break-all font-mono text-xs text-muted-foreground underline">{criteriaPage}</Link> },
  ]
  const extras: Array<{ key: 'human_code' | 'field_of_study' | 'specialization' | 'in_language'; label: string; spec: string }> = [
    { key: 'human_code', label: 'Code', spec: 'humanCode' }, { key: 'field_of_study', label: 'Field of study', spec: 'fieldOfStudy' },
    { key: 'specialization', label: 'Specialization', spec: 'specialization' }, { key: 'in_language', label: 'Language', spec: 'inLanguage' },
  ]
  const filledExtras = extras.filter((extra) => shownBlock?.[extra.key])
  const footer = edit ? removing
    ? <><span className="mr-auto text-[13px] font-semibold text-destructive">Remove this badge? Learners stop earning it once this version is live. Anyone who has it keeps theirs.</span>
      <button type="button" className={smallGhostClass} onClick={() => setRemoving(false)}>Keep it</button>
      <button type="button" className={cn(smallPrimaryClass, 'bg-destructive text-white')} disabled={editing.saving} onClick={() => void remove()}>Remove</button></>
    : <>{current ? <button type="button" className={cn(smallGhostClass, 'mr-auto text-destructive')} onClick={() => setRemoving(true)}>Remove badge</button> : null}
      <button type="button" className={smallGhostClass} onClick={() => setOpen(current ? 'view' : null)}>Cancel</button>
      <button type="button" className={smallPrimaryClass} disabled={editing.saving} onClick={() => void save()}>{current ? 'Save' : 'Add badge'}</button></>
    : null

  return <PlanDialog open={!!open} onOpenChange={(next) => { if (!next) setOpen(null) }} size="md" bare title={badge.name} description="The badge learners earn by finishing this plan" footer={footer} bodyClassName="p-0">
    <div className="h-16 opacity-25" style={{ background: medalColor(badge) }} aria-hidden="true" />
    <div className="-mt-10 flex flex-wrap items-end gap-4 px-6">
      <BadgeMedal badge={badge} size={104} />
      <div className="min-w-0 flex-1 pb-1">
        <span className="text-[11px] font-black uppercase tracking-wide text-muted-foreground">{badgeKindLabel(badge.kind)} · Open Badge</span>
        <h2 className="m-0 truncate text-2xl font-bold tracking-tight">{badge.name}</h2>
        <p className="m-0 text-sm text-muted-foreground">Earned by finishing every step of {document.template.title || template.title}</p>
      </div>
    </div>
    <div className="flex flex-wrap gap-2 px-6 pt-4">
      {certificate ? <button type="button" className={smallActionClass} onClick={() => setCertificate(false)}>Back to the badge</button>
        : !edit ? <>{current ? <button type="button" className={smallActionClass} onClick={() => setCertificate(true)}><Eye />View certificate</button> : null}
          {canEdit ? <button type="button" className={smallPrimaryClass} onClick={() => setOpen('edit')}><Pencil />Edit</button> : null}</> : null}
    </div>
    <div className="p-6 pt-4">
      {certificate ? <>
        <Certificate badge={badge} style={(current || draft).style} learner="Sample Learner" awardedBy={{ name: org?.name || 'Your organization', logo_url: org?.logo_image && org.org_uuid ? getOrgLogoMediaDirectory(org.org_uuid, org.logo_image) : null }}
          date={new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })} code="SAMPLE-CODE" />
        <p className="mt-3 text-center text-[12.5px] text-muted-foreground">An example with a sample learner. Each learner’s certificate has a QR code that opens a page verifying it.</p>
      </> : <>
        {edit && !current ? <p className="mb-3 rounded-xl bg-muted px-3.5 py-2.5 text-[13px]">It starts with the plan’s image and title. The description and how it’s earned come from the plan itself.</p> : null}
        <div className="overflow-hidden rounded-[14px] border border-border">
          <table className="w-full text-sm"><tbody>
            {rows.map((row) => <tr key={row.label} className="border-b border-border last:border-0 align-top">
              <th scope="row" className="w-[34%] bg-muted/50 px-3.5 py-2.5 text-left font-semibold"><span className="block">{row.label}</span><span className="block font-mono text-[11px] font-normal text-muted-foreground">{row.spec}</span></th>
              <td className="px-3.5 py-2.5">{edit && row.editor ? row.editor : row.view}</td>
            </tr>)}
            {(edit && more ? extras : filledExtras).map((extra) => <tr key={extra.key} className="border-b border-border last:border-0 align-top">
              <th scope="row" className="w-[34%] bg-muted/50 px-3.5 py-2.5 text-left font-semibold"><span className="block">{extra.label}</span><span className="block font-mono text-[11px] font-normal text-muted-foreground">{extra.spec}</span></th>
              <td className="px-3.5 py-2.5">{edit ? <input value={draft[extra.key]} onChange={(event) => set({ [extra.key]: event.target.value } as Partial<TemplateBadge>)} maxLength={120} className="h-9 w-full rounded-lg border border-border bg-background px-2.5 text-sm" /> : shownBlock?.[extra.key]}</td>
            </tr>)}
            {(edit && more) || shownBlock?.credits_available != null ? <tr className="align-top">
              <th scope="row" className="w-[34%] bg-muted/50 px-3.5 py-2.5 text-left font-semibold"><span className="block">Credits</span><span className="block font-mono text-[11px] font-normal text-muted-foreground">creditsAvailable</span></th>
              <td className="px-3.5 py-2.5">{edit ? <input type="number" min={0} step="0.5" value={draft.credits_available ?? ''} onChange={(event) => set({ credits_available: event.target.value === '' ? null : Number(event.target.value) })} className="h-9 w-32 rounded-lg border border-border bg-background px-2.5 text-sm" /> : shownBlock?.credits_available}</td>
            </tr> : null}
          </tbody></table>
        </div>
        {edit && !more ? <button type="button" className={smallGhostClass + ' mt-2'} onClick={() => setMore(true)}><Plus />More Open Badge fields</button> : null}
        {!canEdit ? <p className="mt-3 text-[13px] text-muted-foreground">{template.owner_org?.name || 'The plan’s owner'} looks after this badge along with the plan.</p> : null}
      </>}
    </div>
    {picking ? <OrgMediaPicker open onOpenChange={(next) => { if (!next) setPicking(false) }} title="Badge image" description="Upload an image for the badge, choose one from your media library, or find a free stock photo." orgId={orgId} mediaType="image" accessToken={token}
      onSave={(asset) => { set({ image_url: asset.url }); setPicking(false) }} /> : null}
  </PlanDialog>
}
