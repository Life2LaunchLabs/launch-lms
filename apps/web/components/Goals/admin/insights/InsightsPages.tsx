'use client'

import React from 'react'
import InsightsShell from '@components/Insights/InsightsShell'
import GroupReport from './GroupReport'
import GroupReportPrint from './GroupReportPrint'

/** The group reports sit in the Insights rail beside the dashboards. */
function InsightsTabs({ children }: { children: React.ReactNode }) {
  return <InsightsShell place="reports">
    <div className="-mx-4 overflow-hidden rounded-[22px] border border-border bg-card sm:mx-0">{children}</div>
  </InsightsShell>
}

/** Reports by group: plans and badges, who's behind and what's left, optional frameworks; print or send. */
export function InsightsReportsPage({ orgslug, groupId, frameworks }: { orgslug: string; groupId: number | null; frameworks: string[] }) {
  return <InsightsTabs><GroupReport orgslug={orgslug} groupId={groupId} frameworks={frameworks} /></InsightsTabs>
}

/** One group's report on its own, laid out for paper. */
export function InsightsReportPrintPage({ orgslug, groupId, frameworks }: { orgslug: string; groupId: number; frameworks: string[] }) {
  return <GroupReportPrint orgslug={orgslug} groupId={groupId} frameworks={frameworks} />
}

/** Engagement by group. Not designed yet. */
export function InsightsEngagementPage() {
  return <InsightsTabs>
    <div className="px-4 pb-10 pt-6 sm:px-10"><section className="max-w-[640px] rounded-xl border border-gray-100 bg-white p-5 nice-shadow">
      <b className="text-sm text-gray-900">Engagement</b>
      <p className="mt-1 text-[13px] text-gray-500">Coming later: messages, logins and how groups respond to reminders. Group progress is under Reports.</p>
    </section></div>
  </InsightsTabs>
}
