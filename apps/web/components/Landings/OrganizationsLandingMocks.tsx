import { Check, Compass, FileText, Hammer, Star, Wallet } from 'lucide-react'
import { cn } from '@/lib/utils'

/*
 * Small, static pictures of the admin screens for the organizations landing. They show what the
 * product looks like with sample data; nothing here is wired to the API.
 */

const PRIMARY = 'bg-[var(--org-primary-color)] text-[var(--org-on-primary-color)]'

function Avatar({ initials, className }: { initials: string; className: string }) {
  return <span aria-hidden="true" className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[13px] font-bold', className)}>{initials}</span>
}

function Chip({ tone, children }: { tone: 'amber' | 'green' | 'red'; children: React.ReactNode }) {
  const tones = { amber: 'bg-[#f6e7c1] text-[#7a5000]', green: 'bg-[#d6efe2] text-[#1d6b48]', red: 'bg-[#f8dcd7] text-[#9a2f22]' }
  return <span className={cn('shrink-0 rounded-full px-2.5 py-1 text-xs font-bold', tones[tone])}>{children}</span>
}

const LEARNERS = [
  { initials: 'AC', name: 'Ava Chen', detail: 'Turned in: informational interview notes', chip: <Chip tone="amber">Review</Chip>, avatar: PRIMARY },
  { initials: 'ML', name: 'Marcus Lee', detail: 'Working on: compare three pathways', chip: <Chip tone="green">On pace</Chip>, avatar: 'bg-gray-900 text-white' },
  { initials: 'PP', name: 'Priya Patel', detail: 'Finished stage 2 yesterday', chip: <Chip tone="green">Ahead</Chip>, avatar: 'bg-[#bfe3d1] text-gray-900' },
  { initials: 'DR', name: 'Diego Ramos', detail: "Hasn't started research yet", chip: <Chip tone="red">Nudge</Chip>, avatar: 'bg-[#f1e3bf] text-gray-900' },
]

/** The hero picture: one plan handed to a group, where each learner is, and what's waiting. */
export function AssignmentMock() {
  return (
    <div className="relative px-2 pb-10 pt-6 sm:px-6">
      <div aria-hidden="true" className="absolute inset-x-6 bottom-2 top-0 -rotate-3 rounded-[40px] bg-[color-mix(in_srgb,var(--org-primary-color)_14%,white)]" />
      <div className="relative overflow-hidden rounded-[22px] bg-white text-left shadow-[0_30px_60px_-20px_rgba(23,35,80,0.35)] ring-1 ring-gray-200/70">
        <div className="flex items-center gap-2 border-b border-gray-100 bg-gray-50/70 px-4 py-3">
          <span className="h-2.5 w-2.5 rounded-full bg-[#f2b8b5]" /><span className="h-2.5 w-2.5 rounded-full bg-[#f3dca4]" /><span className="h-2.5 w-2.5 rounded-full bg-[#b9e0cb]" />
          <span className="ml-3 text-[13px] font-semibold text-gray-500">Plans › Assignments</span>
        </div>
        <div className="px-5 pb-2 pt-5">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#bfe3d1]"><Compass size={22} className="text-gray-900" /></span>
            <div className="min-w-0">
              <p className="font-bold text-gray-900">Career exploration</p>
              <p className="text-[13px] text-gray-500">Fall group · 4 learners · week 3 of 8</p>
            </div>
            <span className="ml-auto"><Chip tone="amber">3 to review</Chip></span>
          </div>
          <div className="mt-4 grid grid-cols-4 gap-1.5">
            <span className="h-2 rounded-full bg-[var(--org-primary-color)]" />
            <span className="h-2 rounded-full bg-[var(--org-primary-color)]" />
            <span className="h-2 rounded-full bg-[linear-gradient(90deg,var(--org-primary-color)_40%,#e5e7eb_40%)]" />
            <span className="h-2 rounded-full bg-gray-200" />
          </div>
          <div className="mt-2 grid grid-cols-4 text-xs font-semibold text-gray-500">
            <span>Explore</span><span>Research</span><span className="text-gray-900">Plan</span><span>Reflect</span>
          </div>
        </div>
        <ul className="px-2.5 pb-3 pt-2">
          {LEARNERS.map((learner, index) => (
            <li key={learner.initials} className={cn('flex items-center gap-3 rounded-2xl p-2.5', index === 1 && 'bg-gray-50')}>
              <Avatar initials={learner.initials} className={learner.avatar} />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-gray-900">{learner.name}</span>
                <span className="block truncate text-xs text-gray-500">{learner.detail}</span>
              </span>
              {learner.chip}
            </li>
          ))}
        </ul>
      </div>
      <div className="absolute -left-1 bottom-0 flex items-center gap-3 rounded-2xl bg-white px-4 py-3 text-left shadow-[0_18px_40px_-14px_rgba(23,35,80,0.35)] ring-1 ring-gray-200/70 sm:-left-4">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#d6efe2]"><Check size={18} strokeWidth={3} className="text-[#1d6b48]" /></span>
        <span><span className="block text-sm font-bold text-gray-900">Approved, with a note</span><span className="block text-xs text-gray-500">Sent to Ava's feed</span></span>
      </div>
      <div className="absolute -top-1 right-0 rotate-3 rounded-xl bg-[#f1e3bf] px-4 py-3 text-left shadow-[0_14px_30px_-14px_rgba(60,40,0,0.35)] sm:-right-3">
        <span className="block text-xs font-bold text-[#6b4a00]">Badge earned</span>
        <span className="block font-black text-gray-900">Career Explorer</span>
      </div>
    </div>
  )
}

const PLANS = [
  { title: 'Career exploration', detail: '4 stages · 14 steps · earns a badge', tags: ['Oregon SB 3', 'Ages 15+'], art: 'bg-[#bfe3d1]', icon: Compass },
  { title: 'Money basics', detail: '3 stages · 11 steps', tags: ['Personal finance'], art: 'bg-[#f1e3bf]', icon: Wallet },
  { title: 'Build something real', detail: 'Project plan · 9 steps · earns a badge', tags: ['Self-paced'], art: 'bg-[color-mix(in_srgb,var(--org-primary-color)_16%,white)]', icon: Hammer },
]

/** Plan cards as the Marketplace lists them, with a card for building your own. */
export function MarketplaceMock() {
  return (
    <div className="grid gap-4 rounded-[32px] bg-[#f3f6fc] p-5 sm:grid-cols-2 sm:p-8">
      {PLANS.map((plan, index) => (
        <div key={plan.title} className={cn('rounded-[20px] bg-white p-5 shadow-[0_12px_24px_-16px_rgba(23,35,80,0.3)] ring-1 ring-gray-200/60', index % 2 === 1 && 'sm:translate-y-6')}>
          <div className={cn('flex h-24 items-center justify-center rounded-2xl', plan.art)}><plan.icon size={38} strokeWidth={1.6} className="text-gray-900" /></div>
          <p className="mt-3.5 font-bold text-gray-900">{plan.title}</p>
          <p className="mt-1 text-[13px] text-gray-500">{plan.detail}</p>
          <div className="mt-3 flex flex-wrap gap-1.5">{plan.tags.map((tag) => <span key={tag} className="rounded-lg bg-gray-100 px-2 py-1 text-xs font-bold text-gray-600">{tag}</span>)}</div>
        </div>
      ))}
      <div className="flex flex-col justify-between rounded-[20px] bg-gray-900 p-5 text-white sm:translate-y-6">
        <div>
          <p className="font-bold">Or build your own</p>
          <p className="mt-2 text-[13px] leading-relaxed text-gray-300">Stages, steps, uploads, check-ins and interactive activities.</p>
        </div>
        <span className="mt-4 self-start rounded-xl bg-white px-3 py-2 text-[13px] font-extrabold text-gray-900">Open the plan builder</span>
      </div>
    </div>
  )
}

/** A learner's feed: a turn-in, the staff review and the stage it finished. */
export function FeedMock() {
  return (
    <div className="rounded-[32px] bg-[#e8f4ee] p-5 sm:p-8">
      <div className="overflow-hidden rounded-[22px] bg-white shadow-[0_24px_48px_-24px_rgba(23,35,80,0.35)]">
        <div className="flex items-center gap-3 border-b border-gray-100 px-5 py-4">
          <Avatar initials="AC" className={PRIMARY} />
          <span><span className="block text-[15px] font-bold text-gray-900">Ava Chen</span><span className="block text-xs text-gray-500">Career exploration · Research stage</span></span>
        </div>
        <div className="flex flex-col gap-3.5 bg-gray-50/60 p-5">
          <div className="max-w-[85%] self-start rounded-[18px] rounded-bl-md border border-gray-200 bg-white px-4 py-3.5">
            <p className="text-xs font-bold text-gray-500">Turned in a step</p>
            <p className="mt-1.5 text-[15px] font-bold text-gray-900">Informational interview</p>
            <div className="mt-2.5 flex flex-wrap gap-2 text-xs font-semibold text-gray-700">
              <span className="flex items-center gap-1.5 rounded-lg bg-gray-100 px-2.5 py-1.5"><FileText size={13} />interview-notes.pdf</span>
              <span className="rounded-lg bg-gray-100 px-2.5 py-1.5">Reflection</span>
            </div>
          </div>
          <div className={cn('max-w-[85%] self-end rounded-[18px] rounded-br-md px-4 py-3.5', PRIMARY)}>
            <p className="text-xs font-bold opacity-80">Approved · Ms. Rivera</p>
            <p className="mt-1.5 text-[15px] leading-relaxed">Great questions. Ask her about apprenticeships next time.</p>
          </div>
          <div className="flex items-center gap-2.5 self-center rounded-full bg-[#f6ecd0] py-2 pl-2 pr-3.5">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-900 text-[#f1e3bf]"><Star size={13} fill="currentColor" /></span>
            <span className="text-[13px] font-bold text-gray-900">Research stage complete</span>
          </div>
        </div>
      </div>
    </div>
  )
}

type Cell = 'met' | 'waiting' | 'no'
const CELL: Record<Cell, string> = { met: 'bg-[#2e9d6a]', waiting: 'bg-[#f0c25a]', no: 'bg-gray-200' }
const COVERAGE: { requirement: string; cells: Cell[] }[] = [
  { requirement: 'Connect strengths with careers', cells: ['met', 'met', 'met', 'met'] },
  { requirement: 'Compare postsecondary pathways', cells: ['met', 'waiting', 'met', 'no'] },
  { requirement: 'Practice workplace collaboration', cells: ['waiting', 'no', 'met', 'no'] },
  { requirement: 'Prepare a job application', cells: ['no', 'no', 'waiting', 'no'] },
]

/** A group's requirements report: which learner has met which requirement. */
export function CoverageMock() {
  return (
    <div className="rounded-[32px] bg-[#f3f6fc] p-5 sm:p-8">
      <div className="rounded-[22px] bg-white p-5 shadow-[0_24px_48px_-24px_rgba(23,35,80,0.35)]">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0"><p className="font-bold text-gray-900">Higher Education and Career Path Skills</p><p className="text-[13px] text-gray-500">Fall group · 4 learners</p></div>
          <span className="ml-auto rounded-xl bg-gray-900 px-3 py-2 text-[13px] font-extrabold text-white">Print report</span>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[420px] border-collapse text-sm">
            <thead>
              <tr className="text-xs font-bold text-gray-500">
                <th scope="col" className="py-2 text-left font-bold">Requirement</th>
                {['AC', 'ML', 'PP', 'DR'].map((initials) => <th key={initials} scope="col" className="w-12 py-2 text-center font-bold">{initials}</th>)}
              </tr>
            </thead>
            <tbody>
              {COVERAGE.map((row) => (
                <tr key={row.requirement} className="border-t border-gray-100">
                  <th scope="row" className="py-2.5 pr-2 text-left font-semibold text-gray-900">{row.requirement}</th>
                  {row.cells.map((cell, index) => <td key={index} className="px-1.5 py-2.5"><span className={cn('block h-6 rounded-lg', CELL[cell])} /></td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-4 flex flex-wrap gap-4 text-xs font-semibold text-gray-600">
          <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-[#2e9d6a]" />Met, evidence on file</span>
          <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-[#f0c25a]" />Turned in, waiting on review</span>
          <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-gray-200 ring-1 ring-gray-300" />Not yet</span>
        </div>
      </div>
    </div>
  )
}

const CHECKLIST = [
  { label: 'Find your first plan', done: true },
  { label: 'Set up your organization', done: true },
  { label: 'Add your learners', done: false, current: true },
  { label: 'Hand out your first plan', done: false },
  { label: 'Review your first turn-in', done: false },
]

/** The getting-started checklist a new organization sees on its admin Home. */
export function ChecklistMock() {
  return (
    <div className="rounded-[26px] bg-white p-6 shadow-[0_30px_60px_-28px_rgba(23,35,80,0.4)] ring-1 ring-gray-200/70">
      <div className="flex items-center gap-3">
        <p className="text-lg font-black text-gray-900">Getting started</p>
        <span className="ml-auto text-[13px] font-bold text-gray-500">2 of 5</span>
      </div>
      <div className="mt-3 h-2 rounded-full bg-gray-200"><div className="h-2 w-2/5 rounded-full bg-[#2e9d6a]" /></div>
      <ul className="mt-4 flex flex-col gap-1.5 text-[15px]">
        {CHECKLIST.map((item) => (
          <li key={item.label} className={cn('flex items-center gap-3 rounded-2xl px-2 py-2.5', item.current && 'bg-[#f3f6fc] px-3 font-bold text-gray-900', item.done && 'text-gray-500')}>
            {item.done
              ? <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#2e9d6a] text-white"><Check size={14} strokeWidth={3} /></span>
              : <span className={cn('h-6 w-6 rounded-full border-2', item.current ? 'border-[var(--org-primary-color)]' : 'border-gray-300')} />}
            <span className={cn(item.done && 'line-through')}>{item.label}</span>
            {item.current ? <span className="ml-auto text-[13px] text-[var(--org-primary-color)]">Invite →</span> : null}
          </li>
        ))}
      </ul>
    </div>
  )
}
