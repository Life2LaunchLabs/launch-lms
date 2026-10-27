'use client';
import DashLeftMenu from '@components/Dashboard/Menus/DashLeftMenu';
import DashMobileMenu from '@components/Dashboard/Menus/DashMobileMenu';
import AdminAuthorization from '@components/Security/AdminAuthorization'
import React from 'react'
import { useMediaQuery } from 'usehooks-ts';
import ExperiencePreferenceTracker from '@components/Auth/ExperiencePreferenceTracker'
import CandidateExperience from '@components/Candidate/CandidateExperience'
import OperationsSurface from '@components/Operations/OperationsSurface'
import HubShell, { type HubThreadsTab } from '@components/Hub/HubShell'
import ThreadsPanel from '@components/Threads/ThreadsPanel'
import { useOrg } from '@components/Contexts/OrgContext'
import { useLHSession } from '@components/Contexts/LHSessionContext'

// Staff keep Threads and Coach beside any admin page, in the panel the learner side has for Coach.
const threadsTab: HubThreadsTab = (state) => <ThreadsPanel {...state} />

function ClientAdminLayout({
    children,
    params,
}: {
    children: React.ReactNode
    params: any
}) {
    const isMobile = useMediaQuery('(max-width: 768px)')
    const org = useOrg() as any
    const session = useLHSession() as any

    return (
        <AdminAuthorization authorizationMode="page">
            <ExperiencePreferenceTracker side="admin" orgslug={params.orgslug} />
            <OperationsSurface theme="dark" />
            <CandidateExperience />
            <HubShell key={`${org?.id}:${session?.data?.user?.id}`} orgslug={params.orgslug} orgId={org?.id} threads={threadsTab}>
                <div className="org-layout-shell admin-layout-shell learner-page flex min-h-[100dvh] flex-col md:h-[100dvh] md:flex-row md:overflow-hidden">
                    {isMobile ? (
                        <DashMobileMenu />
                    ) : (
                        <DashLeftMenu />
                    )}
                    <div className="page-frame relative isolate flex min-w-0 w-full md:h-[100dvh] md:overflow-y-auto">{children}</div>
                </div>
            </HubShell>
        </AdminAuthorization>
    )
}

export default ClientAdminLayout
