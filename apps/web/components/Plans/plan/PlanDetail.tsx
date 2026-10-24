'use client'

import React from 'react'
import Link from 'next/link'
import { mutate } from 'swr'
import toast from 'react-hot-toast'
import { Loader2 } from 'lucide-react'
import { CaretRight } from '@phosphor-icons/react'
import { useCanEditPlans } from '@components/Plans/shared/useCanEditPlans'
import { EmptyState } from '@components/Goals/admin/live/ui'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { useOrg } from '@components/Contexts/OrgContext'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { isTemplatesKey, templatesApi } from '@services/goals/templates'
import { StaleTemplateBanner, useTemplate, type TemplateEditing } from '@components/Plans/editor/useTemplate'
import DraftBar from './DraftBar'
import LiveVersionModal from './LiveVersionModal'
import PlanCollections from './PlanCollections'
import PlanHeader, { type PlanMenu } from './PlanHeader'
import PlanSettings from './PlanSettings'
import PlanSidebar from './PlanSidebar'
import PlanSteps from './PlanSteps'
import VisibilityChip, { useVisibility } from './VisibilityChip'

/** Panels the old template tabs open on the plan page (links to /<plan>/settings keep working). */
export type PlanPanel = 'settings' | 'versions' | 'visibility' | null

/**
 * One plan on one page. The header and steps show the live version; the draft is its own bar, and
 * steps change only while editing it. The sidebar has the badge, requirements and assignments.
 */
export default function PlanDetail({ orgslug, templateUuid, panel = null }: { orgslug: string; templateUuid: string; panel?: PlanPanel }) {
  const org = useOrg() as { id?: number; name?: string; org_uuid?: string; logo_image?: string } | null
  const session = useLHSession() as { data?: { tokens?: { access_token?: string } } }
  const token = session?.data?.tokens?.access_token
  const orgId = Number(org?.id)
  const editing = useTemplate(orgId, templateUuid, token)
  const template = editing.template
  if (editing.error && !template) return <div className="p-10"><EmptyState title="Plan not found" detail="It may have been removed, or your organization isn't allowed to run it." /></div>
  if (!template) return <div className="flex min-h-full w-full items-center justify-center bg-[#f8f8f8]"><Loader2 className="animate-spin text-muted-foreground" /></div>
  return <PlanPage orgslug={orgslug} org={org} orgId={orgId} token={token} editing={editing} panel={panel} />
}

function PlanPage({ orgslug, org, orgId, token, editing, panel }: { orgslug: string; org: { name?: string; org_uuid?: string; logo_image?: string } | null; orgId: number; token?: string; editing: TemplateEditing; panel: PlanPanel }) {
  const template = editing.template!
  const canAssign = useCanEditPlans() === true
  const visibility = useVisibility(orgId, token, template)
  const [editMode, setEditMode] = React.useState(false)
  const [versionsOpen, setVersionsOpen] = React.useState(panel === 'versions')
  const [settingsOpen, setSettingsOpen] = React.useState(panel === 'settings')
  const [visibilityOpen, setVisibilityOpen] = React.useState(panel === 'visibility')
  const owned = Number(template.org_id) === orgId
  const readOnly = !!template.read_only
  const canEdit = owned && !readOnly && !template.system_type
  // A plan that was never published is all draft: open it ready to edit.
  const opened = React.useRef(false)
  React.useEffect(() => {
    if (opened.current) return
    opened.current = true
    if (canEdit && !template.live_version && template.draft && !template.versions?.length) setEditMode(true)
  }, [canEdit, template])

  const drafting = editMode && canEdit && !!template.draft
  // The live view: the live version's steps; with nothing live yet, the draft is all there is.
  const document = drafting || !template.live_document ? template.document : template.live_document
  const basedOn = template.based_on as { org?: { name?: string } | null; version?: number | null } | null | undefined
  const liveIsOriginal = !!basedOn?.org && template.live_version?.number === 1
  const by = !owned ? { name: template.owner_org?.name || 'another organization' }
    : liveIsOriginal ? { name: basedOn!.org!.name || 'another organization' } : { name: org?.name || 'your organization', org_uuid: org?.org_uuid, logo_image: org?.logo_image }
  const note = readOnly && !owned ? <><b className="text-foreground">{by.name} keeps this plan up to date.</b> You can assign it; your assignments move when you apply a new version.</> : null
  const archived = template.status === 'archived'
  const toggleArchived = async () => {
    if (!archived && !window.confirm('Archive this plan? It leaves your Plans list and can’t be assigned. Learners who have it keep going.')) return
    try {
      const next = archived ? await templatesApi.unarchive(orgId, template.template_uuid, token) : await templatesApi.archive(orgId, template.template_uuid, token)
      await editing.replace({ status: next.status })
      await mutate(isTemplatesKey)
      toast.success(archived ? 'Plan restored.' : 'Plan archived.')
    } catch (error: any) { toast.error(error?.message || 'Could not change the plan.') }
  }
  const menu: PlanMenu = {
    settings: owned ? () => setSettingsOpen(true) : undefined,
    versions: canEdit && template.versions?.length ? () => setVersionsOpen(true) : undefined,
    visibility: visibility.shown ? () => setVisibilityOpen(true) : undefined,
    discover: owned ? null : getUriWithOrg(orgslug, routePaths.org.admin.discoverPlan(template.template_uuid)),
    archive: canEdit ? { archived, run: () => void toggleArchived() } : null,
  }

  return <div className="min-h-full w-full bg-[#f8f8f8] dark:bg-background">
    <div className="mx-auto max-w-[1180px] px-4 pb-16 pt-6 sm:px-6 lg:px-10">
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-[13px] font-semibold text-muted-foreground">
        <Link href={getUriWithOrg(orgslug, routePaths.org.admin.plans())} className="hover:text-foreground">Plans</Link>
        <CaretRight size={12} aria-hidden="true" />
        <span aria-current="page" className="min-w-0 truncate text-foreground">{document.template.title || template.title}</span>
      </nav>
      <div className="mt-3.5 grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <main className="min-w-0">
          <PlanHeader editing={editing} editMode={drafting} by={by} canSwitchLive={canEdit && !!template.versions?.length} note={note} menu={menu}
            collections={owned ? <PlanCollections orgslug={orgslug} orgId={orgId} token={token} template={template} canEdit={canEdit} /> : null}
            visibility={<VisibilityChip orgId={orgId} token={token} template={template} open={visibilityOpen} setOpen={setVisibilityOpen} />} />
          {canEdit ? <DraftBar orgId={orgId} token={token} editing={editing} editMode={drafting} setEditMode={setEditMode} canAssign={canAssign} onVisibility={menu.visibility} /> : null}
          <StaleTemplateBanner editing={editing} />
          <PlanSteps orgslug={orgslug} orgId={orgId} token={token} editing={editing} document={document} editMode={drafting} />
        </main>
        <PlanSidebar orgslug={orgslug} orgId={orgId} token={token} editing={editing} document={document} canAssign={canAssign} canEdit={canEdit} />
      </div>
    </div>
    <LiveVersionModal open={versionsOpen} setOpen={setVersionsOpen} orgId={orgId} token={token} editing={editing} canSwitch={canEdit} />
    {owned ? <PlanSettings open={settingsOpen} setOpen={setSettingsOpen} orgId={orgId} token={token} editing={editing} runOnly={readOnly} /> : null}
  </div>
}
