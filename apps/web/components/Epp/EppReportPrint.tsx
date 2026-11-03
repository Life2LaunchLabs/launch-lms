'use client'

import React from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import useSWR from 'swr'
import { ArrowLeft, Printer } from 'lucide-react'
import { useProfile, usePeopleContext } from '@components/Admin/People/usePeople'
import { EmptyState, PageLoader } from '@components/Goals/admin/live/ui'
import { getUriWithOrg } from '@services/config/config'
import { eppReportApi, eppReportKey, type EppReport as Report } from '@services/epp/report'
import { routePaths } from '@services/routing/paths'
import EppReport from './EppReport'
import { ReviewPanel, SavedRecords } from './EppRecords'

// Paper shows only the report: everything around it is hidden, and the scrolling shells are let out so
// every sheet prints (as GroupReportPrint does).
const PRINT_CSS = `
@media print {
  @page { size: letter; margin: 12mm 14mm; }
  :root, html, body { background: #fff !important; color-scheme: light; height: auto !important; min-width: 0 !important; width: auto !important; overflow: visible !important; }
  body *:has(.epp-report-print) { display: block !important; position: static !important; height: auto !important; min-height: 0 !important; max-height: none !important; overflow: visible !important; padding: 0 !important; margin: 0 !important; border: 0 !important; }
  body *:not(:has(.epp-report-print)):not(.epp-report-print):not(.epp-report-print *) { display: none !important; }
  .epp-report-print { position: static !important; overflow: visible !important; inset: auto !important; }
  .epp-report-print, .epp-report-print main { width: 100% !important; max-width: none !important; margin: 0 !important; padding: 0 !important; }
  .epp-report table { break-inside: avoid; }
}`

/** A report on a white page above the app, with a bar to go back or print. */
export function ReportFrame({ back, backLabel, report, error, actions, children }: { back: string; backLabel: string; report?: Report; error?: any; actions?: React.ReactNode; children?: React.ReactNode }) {
  const [host, setHost] = React.useState<HTMLElement | null>(null)
  React.useEffect(() => setHost(document.body), [])
  if (!host) return null
  return createPortal(<div className="epp-report-print fixed inset-0 overflow-y-auto bg-[#fff] text-[#1C2433]" style={{ zIndex: 'var(--z-modal)' }}>
    <style>{PRINT_CSS}</style>
    <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-[#E8ECF2] bg-[#fff]/95 px-4 py-3 backdrop-blur sm:px-8 print:hidden">
      <Link href={back} className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-bold text-[#3C4656] hover:bg-[#F4F6F9]"><ArrowLeft size={16} aria-hidden="true" />{backLabel}</Link>
      <span className="flex-1" />
      {actions}
      <button type="button" onClick={() => window.print()} disabled={!report} className="inline-flex h-9 items-center gap-2 rounded-full bg-[#1C2433] px-4 text-sm font-bold text-[#fff] disabled:opacity-40"><Printer size={16} aria-hidden="true" />Print</button>
    </div>
    <main className="mx-auto max-w-[816px] px-4 pb-10 sm:px-8 print:max-w-none print:p-0">
      {children ? <div className="pt-5 print:hidden">{children}</div> : null}
      {error && !report ? <div className="py-10"><EmptyState title="This report isn’t available" detail={error?.message} /></div>
        : !report ? <PageLoader /> : <EppReport report={report} />}
    </main>
  </div>, host)
}

/** Staff: a supported learner's live Education Plan and Profile report, to read or print. */
export default function EppReportPrint({ orgslug, username }: { orgslug: string; username: string }) {
  const { orgId, token } = usePeopleContext()
  const { data: profile, error: profileError } = useProfile(username)
  const userId = profile?.user?.id
  const { data: report, error } = useSWR(orgId && token && userId ? eppReportKey(orgId, userId) : null, () => eppReportApi.staff(orgId, userId as number, token), { revalidateOnFocus: false, shouldRetryOnError: false })
  const [reviewing, setReviewing] = React.useState(false)
  return <ReportFrame back={getUriWithOrg(orgslug, routePaths.org.admin.people.user(username))} backLabel="Back to profile" report={report} error={error || profileError}
    actions={report && !reviewing ? <button type="button" onClick={() => setReviewing(true)} className="inline-flex h-9 items-center rounded-full border border-[#1C2433] px-4 text-sm font-bold text-[#1C2433] hover:bg-[#F4F6F9]">Review and save</button> : null}>
    {userId && report ? <>
      {reviewing ? <ReviewPanel orgslug={orgslug} userId={userId} first={report.learner.first_name} onCancel={() => setReviewing(false)} /> : null}
      <SavedRecords orgslug={orgslug} userId={userId} />
    </> : null}
  </ReportFrame>
}
