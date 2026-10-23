'use client'

import React from 'react'
import Link from 'next/link'
import { Loader2 } from 'lucide-react'
import { CaretRight } from '@phosphor-icons/react'
import Modal from '@components/Objects/StyledElements/Modal/Modal'
import { useCanEditPlans } from '@components/Plans/shared/useCanEditPlans'
import { EmptyState } from '@components/Goals/admin/live/ui'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { useOrg } from '@components/Contexts/OrgContext'
import { getUriWithOrg, routePaths } from '@services/config/config'
import TemplateSettings from '@components/Plans/editor/TemplateSettings'
import TemplateSteps from '@components/Plans/editor/TemplateSteps'
import { StaleTemplateBanner, useTemplate, type TemplateEditing } from '@components/Plans/editor/useTemplate'
import DraftBar from './DraftBar'
import LiveVersionModal from './LiveVersionModal'
import PlanCollections from './PlanCollections'
import PlanHeader from './PlanHeader'
import PlanSidebar from './PlanSidebar'
import VisibilityChip from './VisibilityChip'
import { plural } from './planVersions'

/** Panels the old template tabs open on the plan page (links to /<plan>/settings keep working). */
export type PlanPanel = 'settings' | 'versions' | 'visibility' | null

/**
 * One plan on one page. The header and steps show the live version; the draft is its own bar, and
 * steps change only while editing it. The sidebar has the badge, requirements and assignments.
 */
export default function PlanDetail({ orgslug, templateUuid, panel = null }: { orgslug: string; templateUuid: string; panel?: PlanPanel }) {
  const org = useOrg() as { id?: number; name?: string } | null
  const session = useLHSession() as { data?: { tokens?: { access_token?: string } } }
  const token = session?.data?.tokens?.access_token
  const orgId = Number(org?.id)
  const editing = useTemplate(orgId, templateUuid, token)
  const canAssign = useCanEditPlans() === true
  const template = editing.template
  const [editMode, setEditMode] = React.useState(false)
  const [versionsOpen, setVersionsOpen] = React.useState(panel === 'versions')
  const [settingsOpen, setSettingsOpen] = React.useState(panel === 'settings')
  const [visibilityOpen, setVisibilityOpen] = React.useState(panel === 'visibility')
  // A plan that was never published is all draft: open it ready to edit.
  const opened = React.useRef(false)
  React.useEffect(() => {
    if (!template || opened.current) return
    opened.current = true
    if (!template.read_only && !template.live_version && template.draft && !template.versions?.length && Number(template.org_id) === orgId) setEditMode(true)
  }, [template, orgId])

  if (editing.error && !template) return <div className="p-10"><EmptyState title="Plan not found" detail="It may have been removed, or your organization isn't allowed to run it." /></div>
  if (!template) return <div className="flex min-h-full w-full items-center justify-center bg-[#f8f8f8]"><Loader2 className="animate-spin text-muted-foreground" /></div>

  const owned = Number(template.org_id) === orgId
  const readOnly = !!template.read_only
  const canEdit = owned && !readOnly && !template.system_type
  const drafting = editMode && canEdit && !!template.draft
  // The live view: the live version's steps; with nothing live yet, the draft is all there is.
  const document = drafting || !template.live_document ? template.document : template.live_document
  const view: TemplateEditing = drafting ? editing : { ...editing, template: { ...template, document } }
  const basedOn = template.based_on as { org?: { name?: string } | null; version?: number | null } | null | undefined
  const liveIsOriginal = !!basedOn?.org && template.live_version?.number === 1
  const byName = !owned ? template.owner_org?.name || template.badge?.owner_org?.name || 'another organization'
    : liveIsOriginal ? basedOn!.org!.name || 'another organization' : org?.name || 'your organization'
  const stageCount = document.stages.length
  const stepCount = document.stages.reduce((total, stage) => total + stage.steps.length, 0)
  const note = readOnly && !owned ? `${byName} owns this plan and keeps it up to date. You can assign it; your assignments move when you apply a new version.` : null

  return <div className="min-h-full w-full bg-[#f8f8f8]">
    <div className="mx-auto max-w-6xl px-4 pb-16 pt-6 sm:px-6 lg:px-10">
      <nav aria-label="Breadcrumb" className="mb-4 flex items-center gap-1.5 text-xs font-bold text-muted-foreground">
        <Link href={getUriWithOrg(orgslug, routePaths.org.admin.plans())} className="hover:text-foreground">Plans</Link>
        <CaretRight size={12} aria-hidden="true" />
        <span aria-current="page" className="min-w-0 truncate text-foreground">{template.title}</span>
      </nav>
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_21rem] lg:items-start">
        <main className="min-w-0 space-y-6">
          <PlanHeader editing={editing} editMode={drafting} byName={byName} canSwitchLive={canEdit}
            onOpenVersions={() => setVersionsOpen(true)} onOpenSettings={canEdit || owned ? () => setSettingsOpen(true) : null} note={note}
            collections={owned ? <PlanCollections orgslug={orgslug} orgId={orgId} token={token} template={template} canEdit={canEdit} /> : null}
            visibility={<VisibilityChip orgId={orgId} token={token} template={template} open={visibilityOpen} setOpen={setVisibilityOpen} />} />
          {canEdit ? <DraftBar orgId={orgId} token={token} editing={editing} editMode={drafting} setEditMode={setEditMode} canAssign={canAssign} /> : null}
          <StaleTemplateBanner editing={editing} />
          <section aria-labelledby="plan-steps">
            <div className="mb-3 flex items-baseline justify-between gap-3 border-b border-border pb-3">
              <h2 id="plan-steps" className="text-xl font-black">Steps</h2>
              <span className="text-sm text-muted-foreground">{plural(stepCount, 'step')}{stageCount > 1 ? ` · ${plural(stageCount, 'stage')}` : ''}</span>
            </div>
            <TemplateSteps bare orgslug={orgslug} orgId={orgId} token={token} editing={view} readOnly={!drafting} />
          </section>
        </main>
        <PlanSidebar orgslug={orgslug} orgId={orgId} token={token} template={template} document={document} canAssign={canAssign} />
      </div>
    </div>
    <LiveVersionModal open={versionsOpen} setOpen={setVersionsOpen} orgId={orgId} token={token} editing={editing} canSwitch={canEdit} />
    {owned ? <Modal isDialogOpen={settingsOpen} onOpenChange={setSettingsOpen} minHeight="no-min" minWidth="md" dialogTitle="Plan settings" noPadding
      dialogContent={<TemplateSettings orgId={orgId} token={token} editing={editing} runOnly={readOnly} />} /> : null}
  </div>
}
