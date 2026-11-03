'use client'

import React from 'react'
import type { EppReport as Report, EvidenceItem, ReportWork } from '@services/epp/report'

/**
 * The Oregon Education Plan and Profile report, laid out like the paper copy: a summary page, then who
 * they are and where they're headed, their courses and graduation progress, evidence they chose, and
 * review. Always light, so screen and print match. Each part starts a new sheet when printed.
 */
const monthYear = (value?: string | null) => {
  if (!value) return ''
  const date = new Date(value.length === 7 ? `${value}-01T12:00:00` : value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
}
const longDate = (value: string) => new Date(value).toLocaleDateString(undefined, { dateStyle: 'medium' })
const credits = (value: number) => (Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2))))
const ATTENTION = 'font-semibold text-[#A84300]'
const STATUS_TEXT: Record<string, string> = { complete: '✓ Complete', reviewed: '✓ Reviewed', needs_attention: '! Needs attention' }
const KIND_LABEL: Record<EvidenceItem['kind'], string> = { credential: 'Credential', result: 'Result', project: 'Project', experience: 'Experience', quote: 'Quote' }

function Sheet({ children, first }: { children: React.ReactNode; first?: boolean }) {
  return <section className={`epp-sheet border-[#D8DDE6] py-8 ${first ? '' : 'border-t print:break-before-page print:border-0'}`}>{children}</section>
}

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-3 text-xl font-extrabold">{children}</h2>
}

function Table({ head, rows }: { head?: React.ReactNode[]; rows: React.ReactNode[][] }) {
  return <table className="w-full border-collapse text-[13px]">
    {head ? <thead><tr>{head.map((cell, index) => <th key={index} className="border-b border-[#1C2433] py-1.5 pr-2 text-left text-xs font-semibold text-[#505A6B]">{cell}</th>)}</tr></thead> : null}
    <tbody>{rows.map((row, index) => <tr key={index} className="break-inside-avoid">{row.map((cell, column) => <td key={column} className={`border-b border-[#D8DDE6] py-1.5 pr-2 align-top ${column === 0 ? 'font-semibold' : ''}`}>{cell}</td>)}</tr>)}</tbody>
  </table>
}

function Work({ work, first }: { work: ReportWork[]; first: string }) {
  const done = work.filter((item) => item.text.length || item.items.length)
  if (!done.length) return <p className="text-[13px] text-[#505A6B]">{work.length ? `${first} hasn’t written this yet.` : 'Not part of their plan yet.'}</p>
  return <div className="space-y-2">
    {done.map((item, index) => <div key={index} className="text-[13px] leading-relaxed">
      {item.text.map((text, line) => <p key={line}>{text}</p>)}
      {item.items.length ? <ul className="ml-4 list-disc">{item.items.map((entry, line) => <li key={line}>{entry}</li>)}</ul> : null}
      <p className="text-xs text-[#505A6B]">
        {item.source === 'teacher_reviewed' ? `✓ Teacher reviewed${item.reviewed_by ? ` by ${item.reviewed_by}` : ''}` : 'Student entered'}
        {item.completed_at ? `, ${monthYear(item.completed_at)}` : item.status === 'submitted' ? ', waiting for review' : ''}
      </p>
    </div>)}
  </div>
}

function Requirements({ report, section }: { report: Report; section: string }) {
  const found = report.sections.find((item) => item.key === section)
  if (!found) return null
  return <div className="space-y-4">
    {found.requirements.map((requirement) => <div key={requirement.code} className="break-inside-avoid">
      <h3 className="mb-1 text-sm font-bold">{requirement.label}</h3>
      <Work work={requirement.work} first={report.learner.first_name} />
    </div>)}
  </div>
}

function Evidence({ items, first }: { items: EvidenceItem[]; first: string }) {
  if (!items.length) return <p className="text-[13px] text-[#505A6B]">{first} hasn’t chosen anything from their portfolio yet.</p>
  return <div className="space-y-2">
    {items.map((item) => <div key={`${item.kind}-${item.uuid}`} className="break-inside-avoid rounded-md border border-[#D8DDE6] px-3.5 py-2.5">
      <div className="flex flex-wrap justify-between gap-x-4 text-sm"><b>{item.kind === 'quote' ? `“${item.summary}”` : item.title}</b>
        <span className="text-xs text-[#3C4656]">{KIND_LABEL[item.kind]}{item.date ? ` · ${monthYear(item.date)}${item.ongoing ? ' to now' : item.end ? ` to ${monthYear(item.end)}` : ''}` : ''}</span></div>
      {item.kind === 'quote' ? <p className="text-[13px] text-[#3C4656]">{item.title}{item.detail ? `, ${item.detail}` : ''}{item.verified ? ', confirmed by them' : ''}</p>
        : <>{item.detail ? <p className="text-[13px] text-[#3C4656]">{item.detail}</p> : null}{item.summary ? <p className="mt-0.5 text-[13px]">{item.summary}</p> : null}</>}
      {item.verified && item.kind === 'credential' ? <p className="text-xs font-semibold">✓ Verified with the issuer</p> : null}
    </div>)}
  </div>
}

export default function EppReport({ report }: { report: Report }) {
  const { learner, graduation } = report
  const tally = graduation.tally
  const pct = (value: number) => `${Math.max(0, Math.min(100, (value / tally.required) * 100))}%`
  const facts = [learner.grade ? `Grade ${learner.grade}` : null, learner.graduation_year ? `Class of ${learner.graduation_year}` : null, learner.diploma,
    learner.student_id ? `Student ID ${learner.student_id}` : null].filter(Boolean).join(' · ')
  return <article className="epp-report text-[#1C2433]">
    <Sheet first>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold text-[#1B4FCC]">Education Plan and Profile · {report.school_year}</p>
          <h1 className="mt-1 text-3xl font-extrabold leading-tight">{learner.name}</h1>
          {facts ? <p className="mt-1.5 text-[13px] text-[#3C4656]">{facts}</p> : null}
          <p className="text-[13px] text-[#3C4656]">{report.org.name}{learner.counselor ? ` · Counselor: ${learner.counselor}` : ''}</p>
        </div>
        <div className="rounded-md border border-[#1C2433] px-3 py-2 text-right">
          <p className="text-[13px] font-bold">{report.reviews[0] ? `Reviewed ${longDate(report.reviews[0].date)}` : 'Not reviewed yet'}</p>
          <p className="text-xs text-[#3C4656]">Live report, {longDate(report.generated_at)}</p>
        </div>
      </div>
      <div className="mt-5 grid gap-5 rounded-md bg-[#EEF3FE] px-4 py-3 sm:grid-cols-2">
        <div><p className="text-xs font-semibold text-[#1B4FCC]">Next step after high school</p><p className="mt-0.5 font-bold">{report.next_step || <span className={ATTENTION}>Not chosen yet</span>}</p></div>
        <div><p className="text-xs font-semibold text-[#1B4FCC]">Interests</p><p className="mt-0.5 font-bold">{report.interests[0] || <span className="font-normal text-[#3C4656]">No results yet</span>}</p></div>
      </div>
      <h2 className="mb-2 mt-6 text-[15px] font-bold">Required plan and profile</h2>
      <Table head={['Component', 'Status', 'Detail']} rows={report.components.map((item) => [item.label,
        <span key="s" className={item.status === 'needs_attention' ? ATTENTION : ''}>{STATUS_TEXT[item.status] || item.status}</span>, item.detail])} />
      <h2 className="mb-2 mt-6 text-[15px] font-bold">Graduation progress</h2>
      <div className="mb-1 flex flex-wrap justify-between gap-2 text-[13px]"><span><b>{credits(tally.completed)}</b> completed · <b>{credits(tally.planned)}</b> planned · <b>{credits(tally.left)}</b> not planned</span><span className="text-[#3C4656]">{tally.required} credits required</span></div>
      <div className="flex h-3 overflow-hidden rounded-sm border border-[#1C2433] print:[print-color-adjust:exact]" role="img" aria-label={`${tally.completed} credits completed, ${tally.planned} planned, ${tally.left} not planned, of ${tally.required}`}>
        <div className="bg-[#1B4FCC]" style={{ width: pct(tally.completed) }} /><div className="border-l border-[#1C2433] bg-[#A9C0F3]" style={{ width: pct(Math.min(tally.planned, tally.required - tally.completed)) }} />
      </div>
      <div className="mt-2"><Table rows={graduation.beyond_credits.map((item) => [item.label, <span key="d" className={item.attention ? ATTENTION : ''}>{item.attention ? '! ' : ''}{item.detail}</span>])} /></div>
      {report.to_talk_about.length ? <>
        <h2 className="mb-2 mt-6 text-[15px] font-bold">To talk about</h2>
        <ol className="ml-5 list-decimal space-y-1 text-[13px]">{report.to_talk_about.map((item) => <li key={item}>{item}</li>)}</ol>
      </> : null}
    </Sheet>

    <Sheet>
      <H2>1 · Who I am</H2>
      <Requirements report={report} section="who" />
      <div className="mt-8"><H2>2 · Where I’m headed</H2></div>
      <Requirements report={report} section="headed" />
    </Sheet>

    <Sheet>
      <H2>3 · Course plan</H2>
      <p className="mb-2 text-xs text-[#3C4656]"><span className="font-medium text-[#1B4FCC]">Blue</span> means planned or in progress. ✓ means school confirmed.</p>
      <div className="overflow-x-auto">
        <Table head={['Subject', 'Grade 9', 'Grade 10', 'Grade 11', 'Grade 12']} rows={report.courses.grid.map((row) => [row.label, ...['9', '10', '11', '12'].map((grade) =>
          <span key={grade}>{row.grades[grade].map((course, index) => <span key={index} className={course.status === 'completed' ? '' : 'font-medium text-[#1B4FCC]'}>
            {index ? ', ' : ''}{course.title}{course.dual_credit ? ' (dual credit)' : ''}{course.school_confirmed ? ' ✓' : ''}
          </span>)}</span>)])} />
      </div>
      {report.courses.dual_credit.length ? <p className="mt-2 text-[13px]"><b>Dual credit:</b> {report.courses.dual_credit.map((course) =>
        `${course.title}, ${credits(course.credits)} high school${course.college_credits ? ` and ${credits(course.college_credits)} college` : ''} credits${course.college ? ` at ${course.college}` : ''}`).join('; ')}.</p> : null}
    </Sheet>

    <Sheet>
      <H2>4 · Graduation progress</H2>
      <Table head={['Oregon Diploma credits', 'Required', 'Completed', 'Planned', 'Left']} rows={[...tally.areas.map((area) => [area.label, credits(area.required), credits(area.completed), credits(area.planned),
        <span key="l" className={area.left ? ATTENTION : ''}>{credits(area.left)}</span>]), ['Total', credits(tally.required), credits(tally.completed), credits(tally.planned), credits(tally.left)]]} />
      <p className="mt-1.5 text-xs text-[#3C4656]">The transcript is the official record of credit. This school’s own requirements may add to this table.</p>
    </Sheet>

    <Sheet>
      <H2>5 · Learning beyond the classroom</H2>
      <Requirements report={report} section="beyond" />
      <div className="mt-8"><H2>6 · Evidence</H2></div>
      <p className="mb-3 text-[13px] text-[#3C4656]">Chosen by {learner.first_name} from their portfolio.</p>
      <Evidence items={report.evidence} first={learner.first_name} />
    </Sheet>

    <Sheet>
      <H2>7 · Look back and review</H2>
      <Requirements report={report} section="review" />
      <div className="mt-6 rounded-md bg-[#F4F6F9] px-4 py-3 text-[13px] leading-relaxed">
        <h3 className="mb-1 text-sm font-bold">About this report</h3>
        <p><b>Student entered</b> is written by {learner.first_name}. <b>Teacher reviewed</b> was checked by the named staff member. <b>School confirmed</b> was entered by school staff.</p>
        <p className="mt-1">The school decides academic credit, and the transcript is the official record. Budgets, private items, documents and contact details aren’t included.</p>
      </div>
    </Sheet>
  </article>
}
