'use client'

import React from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { ArrowLeft, Printer } from 'lucide-react'
import { getUriWithOrg } from '@services/config/config'
import { EmptyState, PageLoader } from '../live/ui'
import { ReportBody, longDate, useGroupReport, useOrgAndToken } from './GroupReport'
import { insightsRoutes } from './reportRoutes'

// Paper shows only the report: everything around it (the admin menu, overlays) is hidden, and the
// scrolling shells it sits in are let out so every page prints.
const PRINT_CSS = `
@media print {
  @page { size: auto; margin: 14mm 12mm; }
  html, body { background: #fff !important; height: auto !important; overflow: visible !important; }
  body *:has(.group-report-print) { display: block !important; position: static !important; height: auto !important; min-height: 0 !important; max-height: none !important; overflow: visible !important; padding: 0 !important; margin: 0 !important; border: 0 !important; }
  body *:not(:has(.group-report-print)):not(.group-report-print):not(.group-report-print *) { display: none !important; }
  .group-report-print { position: static !important; overflow: visible !important; inset: auto !important; }
  .group-report-print tr { break-inside: avoid; }
}`

/** A group's report laid out for paper. Opens the print dialog once it has loaded. */
export default function GroupReportPrint({ orgslug, groupId, frameworks, autoPrint = true }: { orgslug: string; groupId: number; frameworks: string[]; autoPrint?: boolean }) {
  const { orgId, token } = useOrgAndToken()
  const { data: report, error } = useGroupReport(orgId, token, groupId, frameworks)
  const printed = React.useRef(false)
  React.useEffect(() => {
    if (!report || !autoPrint || printed.current) return
    printed.current = true
    // Let the page paint before the dialog takes over.
    const timer = window.setTimeout(() => window.print(), 400)
    return () => window.clearTimeout(timer)
  }, [report, autoPrint])
  // Rendered on the body, above the admin menus (the admin content area is its own stacking context).
  const [host, setHost] = React.useState<HTMLElement | null>(null)
  React.useEffect(() => setHost(document.body), [])
  const back = getUriWithOrg(orgslug, insightsRoutes.report(groupId, frameworks))
  if (!host) return null
  return createPortal(<div className="group-report-print fixed inset-0 overflow-y-auto bg-white text-gray-900" style={{ zIndex: 'var(--z-modal)' }}>
    <style>{PRINT_CSS}</style>
    <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-gray-100 bg-white/95 px-4 py-3 backdrop-blur sm:px-8 print:hidden">
      <Link href={back} className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-bold text-gray-700 hover:bg-gray-100"><ArrowLeft size={16} aria-hidden="true" />Back to report</Link>
      <span className="flex-1" />
      <button type="button" onClick={() => window.print()} disabled={!report} className="inline-flex h-9 items-center gap-2 rounded-full bg-gray-900 px-4 text-sm font-bold text-white disabled:opacity-40"><Printer size={16} aria-hidden="true" />Print</button>
    </div>
    <main className="mx-auto max-w-[960px] px-4 py-8 sm:px-8 print:max-w-none print:p-0">
      {error && !report ? <EmptyState title="This report isn’t available" detail={error?.message} />
        : !report ? <PageLoader />
        : <>
          <header className="mb-6 border-b border-gray-200 pb-4">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-gray-500">{report.org.name}</p>
            <h1 className="mt-1 text-2xl font-black">{report.group.name}</h1>
            <p className="mt-0.5 text-sm text-gray-500">Progress report · {longDate(report.generated_on)} · {report.summary.learner_count} learner{report.summary.learner_count === 1 ? '' : 's'}</p>
          </header>
          <ReportBody report={report} orgslug={orgslug} variant="print" />
        </>}
    </main>
  </div>, host)
}
