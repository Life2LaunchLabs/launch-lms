'use client'

import React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import toast from 'react-hot-toast'
import { BookOpen, ChartBar, Check, Lock, PencilSimple } from '@phosphor-icons/react'
import { Loader2 } from 'lucide-react'
import { EmptyState, PageLoader } from '@components/Goals/admin/live/ui'
import SourceChip from '@components/Goals/admin/requirements/SourceChip'
import { getDefaultOrg, getUriWithOrg, routePaths } from '@services/config/config'
import { requirementsApi, type FrameworkDetail } from '@services/goals/requirements'
import { cn } from '@/lib/utils'
import FrameworkEdit, { draftOf, draftPayload, type FrameworkDraft } from './FrameworkEdit'
import FrameworkView from './FrameworkView'
import { plural } from './Marks'

type Props = { orgslug: string; orgId: number; token?: string; frameworkUuid: string; editing: boolean }

/**
 * One requirement framework: its tree with what the org's plans cover, or (for admins) editing its draft. Editing
 * saves a draft; plans and learners keep counting toward the live version until the draft is published.
 */
export default function FrameworkPage({ orgslug, orgId, token, frameworkUuid, editing }: Props) {
  const router = useRouter()
  const ready = Boolean(orgId && token)
  const { data: framework, error, mutate } = useSWR(ready ? ['requirement-framework', orgId, frameworkUuid] : null, () => requirementsApi.get(orgId, frameworkUuid, token), { revalidateOnFocus: false })
  const { data: coverage, mutate: refreshCoverage } = useSWR(ready ? ['requirement-coverage', orgId, frameworkUuid] : null, () => requirementsApi.coverage(orgId, frameworkUuid, token), { revalidateOnFocus: false })
  const [draft, setDraft] = React.useState<FrameworkDraft | null>(null)
  const [busy, setBusy] = React.useState<'' | 'save' | 'publish' | 'library'>('')
  const base = React.useMemo(() => framework ? JSON.stringify(draftOf(framework)) : '', [framework])
  const dirty = Boolean(draft && JSON.stringify(draft) !== base)
  const page = (edit: boolean) => getUriWithOrg(orgslug, routePaths.org.admin.requirementFrameworkPlans(frameworkUuid, edit ? 'edit' : 'plans'))

  React.useEffect(() => { if (editing && framework && !draft) setDraft(draftOf(framework)) }, [editing, framework, draft])
  React.useEffect(() => { if (!editing) setDraft(null) }, [editing])

  if (error) return <div className="px-4 py-16 sm:px-10"><EmptyState title="Requirement framework unavailable" detail={<Link href={getUriWithOrg(orgslug, routePaths.org.admin.requirements())} className="font-semibold text-violet-700">Back to requirements</Link>} /></div>
  if (!framework || !coverage) return <PageLoader tall />

  const canEdit = framework.can_edit !== false && !framework.locked
  const live = framework.published_version
  const isDraft = framework.status !== 'published'

  const save = async (): Promise<FrameworkDetail | null> => {
    if (!draft) return null
    if (!draft.name.trim()) { toast.error('Give the framework a name.'); return null }
    setBusy('save')
    try {
      const saved = await requirementsApi.update(orgId, frameworkUuid, draftPayload(framework, draft), token)
      await mutate(saved, false)
      setDraft(draftOf(saved))
      void refreshCoverage()
      return saved
    } catch (saveError: any) {
      toast.error(saveError?.message || 'Could not save the draft.')
      return null
    } finally { setBusy('') }
  }
  const publish = async () => {
    if (dirty && !(await save())) return
    setBusy('publish')
    try {
      const result = await requirementsApi.publish(orgId, frameworkUuid, token)
      toast.success(`Version ${result.version} is live.`)
      const waiting = result.active_incomplete_enrollments || 0
      if (waiting && window.confirm(`Move ${plural(waiting, 'learner')} still working toward an earlier version onto version ${result.version}? Learners who finished keep the version they finished.`)) {
        const moved = await requirementsApi.migrateActive(orgId, frameworkUuid, null, token)
        toast.success(`${plural(moved.updated, 'learner')} moved to version ${result.version}.`)
      }
      await mutate()
      void refreshCoverage()
      router.push(page(false))
    } catch (publishError: any) {
      toast.error(publishError?.message || 'Could not publish.')
    } finally { setBusy('') }
  }
  const leave = () => { if (!dirty || window.confirm('Leave without saving your changes?')) router.push(page(false)) }
  const publishToLibrary = async () => {
    setBusy('library')
    try { await requirementsApi.publishToLibrary(orgId, frameworkUuid, token); await mutate(); toast.success('Shared in Discover.') }
    catch (libraryError: any) { toast.error(libraryError?.message || 'Could not share it in Discover.') }
    finally { setBusy('') }
  }
  const setFlags = async (nodeUuids: string[]) => {
    try {
      const result = await requirementsApi.setFlags(orgId, frameworkUuid, nodeUuids, token)
      await mutate({ ...framework, flagged_node_uuids: result.flagged_node_uuids }, false)
    } catch (flagError: any) { toast.error(flagError?.message || 'Could not change the flags.') }
  }
  const steps = new Map(coverage.nodes.map((node) => [node.node_uuid, node.covered_by || []]))
  const btn = 'inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-medium disabled:opacity-50'

  return <div className="px-4 pb-10 pt-6 sm:px-6 lg:px-10"><div className="mx-auto max-w-7xl space-y-4">
    <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1.5 text-xs font-semibold text-gray-500">
      <Link href={getUriWithOrg(orgslug, routePaths.org.admin.plans())} className="hover:text-gray-900">Plans</Link><span aria-hidden="true">›</span>
      <Link href={getUriWithOrg(orgslug, routePaths.org.admin.requirements())} className="hover:text-gray-900">Requirements</Link>
    </nav>
    <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0 space-y-1.5">
        <h1 className="text-2xl font-bold text-gray-900">{framework.name}</h1>
        <div className="flex flex-wrap items-center gap-2 text-[13px] text-gray-500">
          {isDraft ? <span className="rounded-full bg-amber-50 px-2.5 py-0.5 font-semibold text-amber-700">Draft of version {framework.version}{live ? ` · version ${live} is live` : ''}</span>
            : <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2.5 py-0.5 font-semibold text-green-700"><Check size={12} weight="bold" aria-hidden="true" />Live · version {framework.version}</span>}
          {framework.locked ? <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-0.5 font-semibold text-gray-700"><Lock size={12} aria-hidden="true" />Used as is</span> : null}
          <span>{framework.publisher?.yours === false ? `From ${framework.publisher.name}` : 'Yours'} · {plural(framework.nodes.filter((node) => !framework.nodes.some((other) => other.parent_node_uuid === node.node_uuid)).length, 'requirement')}</span>
          {framework.publisher ? <SourceChip item={{ publisher: framework.publisher, can_edit: framework.can_edit !== false }} /> : null}
        </div>
        {framework.description && !editing ? <p className="max-w-3xl text-sm text-gray-600">{framework.description}</p> : null}
      </div>
      {!editing ? <div className="flex flex-wrap gap-2">
        <Link href={getUriWithOrg(orgslug, routePaths.org.admin.insightsScope('framework', framework.framework_uuid))} className={cn(btn, 'border border-gray-200 bg-white text-gray-900 hover:border-gray-300')}><ChartBar size={16} aria-hidden="true" />Progress in Insights</Link>
        {canEdit && orgslug === getDefaultOrg() && !isDraft ? <button type="button" onClick={() => void publishToLibrary()} disabled={busy === 'library' || framework.library_published_version === framework.version} className={cn(btn, 'border border-gray-200 bg-white text-gray-900 hover:border-gray-300')}><BookOpen size={16} aria-hidden="true" />{framework.library_published_version === framework.version ? 'Shared in Discover' : framework.published_to_library ? 'Update in Discover' : 'Share in Discover'}</button> : null}
        {canEdit ? <Link href={page(true)} className={cn(btn, 'bg-black text-white hover:bg-black/85')}><PencilSimple size={16} aria-hidden="true" />{isDraft && live ? 'Continue editing' : 'Edit'}</Link> : null}
      </div> : null}
    </header>
    {!canEdit && !editing ? <p className="inline-flex items-center gap-2 rounded-lg bg-gray-100 px-3 py-2 text-xs font-semibold text-gray-600"><Lock size={14} aria-hidden="true" />{framework.locked ? `Used as ${framework.publisher?.name || 'its publisher'} publishes it, so it can't be changed. You can still flag gaps.` : 'Only your organization’s admins can change this framework.'}</p> : null}
    {editing && canEdit ? <>
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-violet-100 bg-violet-50 px-4 py-3">
        <div className="min-w-0 flex-1 text-sm"><b className="text-gray-900">{isDraft ? `Editing the draft of version ${framework.version}` : `Editing starts version ${framework.version + 1}`}</b>
          <span className="block text-gray-600">{live ? `Plans and learners keep counting toward version ${live} until you publish. Links to requirements you keep carry over.` : 'Nothing counts toward this framework until you publish it.'}</span></div>
        <button type="button" onClick={leave} className={cn(btn, 'text-gray-700 hover:bg-white')}>{dirty ? 'Cancel' : 'Done'}</button>
        <button type="button" onClick={() => void save()} disabled={!dirty || Boolean(busy)} className={cn(btn, 'border border-gray-200 bg-white text-gray-900')}>{busy === 'save' ? <Loader2 size={14} className="animate-spin" /> : null}{dirty ? 'Save draft' : 'Saved'}</button>
        <button type="button" onClick={() => void publish()} disabled={Boolean(busy) || (!dirty && !isDraft) || !(draft?.nodes.length)} className={cn(btn, 'bg-black text-white hover:bg-black/85')}>{busy === 'publish' ? <Loader2 size={14} className="animate-spin" /> : null}Publish version {isDraft || dirty ? (isDraft ? framework.version : framework.version + 1) : framework.version}</button>
      </div>
      {draft ? <FrameworkEdit draft={draft} onChange={setDraft} steps={steps} /> : <PageLoader />}
    </> : <FrameworkView key={framework.version} framework={framework} coverage={coverage} orgslug={orgslug} onFlags={setFlags} />}
  </div></div>
}
