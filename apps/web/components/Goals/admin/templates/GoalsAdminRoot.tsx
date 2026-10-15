'use client'

import React from 'react'
import { ClipboardCheck, Inbox, Layers3 } from 'lucide-react'
import AdminFeatureHeader from '@components/Admin/AdminFeatureHeader'
import ReviewInbox from '@components/Goals/admin/live/ReviewInbox'
import RequirementsExplorer from '@components/Goals/admin/live/RequirementsExplorer'
import { RequirementFrameworkDetail } from '@components/Goals/admin/RequirementsAdmin'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { useOrg } from '@components/Contexts/OrgContext'
import { getUriWithOrg, routePaths } from '@services/config/config'
import TemplateList from './TemplateList'

export type GoalsAdminTab = 'inbox' | 'templates' | 'requirements'

export function goalsAdminTabs(orgslug: string) {
  return [
    { id: 'inbox', label: 'Inbox', icon: <Inbox size={16} />, href: getUriWithOrg(orgslug, routePaths.org.dash.plans()) },
    { id: 'templates', label: 'Templates', icon: <Layers3 size={16} />, href: getUriWithOrg(orgslug, routePaths.org.dash.goalTemplates()) },
    { id: 'requirements', label: 'Requirements', icon: <ClipboardCheck size={16} />, href: getUriWithOrg(orgslug, routePaths.org.dash.planRequirements()) },
  ]
}

/** The admin Goals area: the review inbox, goal templates and requirement frameworks under one header. */
export default function GoalsAdminRoot({ orgslug, tab, requirementFrameworkUuid, requirementSubpage = 'details' }: { orgslug: string; tab: GoalsAdminTab; requirementFrameworkUuid?: string; requirementSubpage?: 'details' | 'levels' | 'spec' }) {
  const org = useOrg() as { id?: number } | null
  const session = useLHSession() as { data?: { tokens?: { access_token?: string } } }
  const token = session?.data?.tokens?.access_token
  const orgId = Number(org?.id)
  const content = requirementFrameworkUuid
    ? <RequirementFrameworkDetail orgslug={orgslug} orgId={orgId} token={token} frameworkUuid={requirementFrameworkUuid} activeSubpage={requirementSubpage} />
    : tab === 'requirements' ? <RequirementsExplorer orgslug={orgslug} orgId={orgId} token={token} />
      : tab === 'templates' ? <TemplateList orgslug={orgslug} orgId={orgId} token={token} />
        : <ReviewInbox orgslug={orgslug} orgId={orgId} token={token} />
  return <div className="min-h-full w-full bg-[#f8f8f8]"><AdminFeatureHeader feature="Goals" activeTab={tab} tabs={goalsAdminTabs(orgslug)} />{content}</div>
}
