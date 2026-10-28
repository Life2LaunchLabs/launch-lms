'use client'

import React from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Award, BarChart3, Home, Layers3, ListChecks, Lock, Users, UsersRound } from 'lucide-react'
import { cn } from '@/lib/utils'
import { AVATAR_COLORS, initials, slugify } from './roles'
import type { StartState } from './StartFlow'
import type { StartFramework, SuggestedPlan } from '@services/onboarding/start'

export type PreviewPage = 'plans' | 'people' | 'groups' | 'requirements' | 'invite'

const hue = (title: string) => [...title].reduce((total, char) => total + char.charCodeAt(0), 0) % 360

/** The new space as it fills in: the same window through setup, showing whatever the step changes. */
export default function SitePreview({ state, page, plans, spaceName, framework }: {
  state: StartState; page: PreviewPage; plans: SuggestedPlan[]; spaceName: string; framework: StartFramework | null
}) {
  const accent = state.orgOn ? state.color : '#2F66D6'
  const picked = state.picked.map((uuid) => plans.find((plan) => plan.template_uuid === uuid)).filter((plan): plan is SuggestedPlan => !!plan)
  const full = state.trial === true
  const nav: Array<[PreviewPage | 'home' | 'insights', string, React.ReactNode, number?]> = [
    ['home', 'Home', <Home key="h" size={14} />], ['plans', 'Plans', <Layers3 key="p" size={14} />, picked.length],
    ['people', 'People', <Users key="u" size={14} />, full ? state.staff.length : state.learners.length],
    ...(full ? [['groups', 'Groups', <UsersRound key="g" size={14} />, state.groups.length] as [PreviewPage, string, React.ReactNode, number]] : []),
    ...(page === 'requirements' || framework ? [['requirements', 'Requirements', <ListChecks key="r" size={14} />, framework ? 1 : 0] as [PreviewPage, string, React.ReactNode, number]] : []),
    ['insights', 'Insights', <BarChart3 key="i" size={14} />],
  ]
  const mark = <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-lg text-[11px] font-black text-white" style={{ background: accent }}>{initials(spaceName)}</span>
  return <div className="flex h-full w-full flex-col overflow-hidden rounded-2xl bg-white shadow-[0_30px_80px_rgba(15,23,42,0.18)] ring-1 ring-black/5" style={{ ['--accent' as string]: accent }}>
    <div className="flex items-center gap-1.5 border-b border-border bg-[#f6f7f9] px-3 py-2">
      {['#FF5F57', '#FEBC2E', '#28C840'].map((color) => <i key={color} className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />)}
      <span className="ml-2 flex flex-1 items-center gap-1 truncate rounded-md bg-white px-2 py-0.5 text-[11px] text-muted-foreground"><Lock size={10} />life2launch.app/{page === 'invite' ? `join/${slugify(spaceName)}` : `${slugify(spaceName)}/${page}`}</span>
    </div>
    {page === 'invite' ? <Invite state={state} spaceName={spaceName} accent={accent} mark={mark} /> : <div className="flex min-h-0 flex-1">
      <aside className="hidden w-40 shrink-0 flex-col gap-1 border-r border-border p-3 sm:flex">
        <div className="mb-2 flex items-center gap-2">{mark}<b className="truncate text-[12px]">{spaceName}</b></div>
        <span className={cn('mb-2 w-fit rounded-full px-2 py-0.5 text-[10px] font-bold', full ? 'bg-violet-100 text-violet-700' : 'bg-muted text-muted-foreground')}>{full ? 'Full trial · 30 days' : 'Free'}</span>
        {nav.map(([key, label, icon, count]) => <span key={key} className={cn('flex items-center gap-2 rounded-lg px-2 py-1.5 text-[12px]', key === page ? 'bg-[var(--accent)] font-bold text-white' : 'text-muted-foreground')}>
          {icon}{label}{count ? <em className="ml-auto text-[10px] not-italic">{count}</em> : null}</span>)}
      </aside>
      <div className="min-w-0 flex-1 overflow-hidden p-4">
        {page === 'plans' ? <PlansPage picked={picked} /> : page === 'groups' ? <GroupsPage groups={state.groups} staff={state.staff.length} />
          : page === 'requirements' ? <RequirementsPage chosen={framework ? [{ id: framework.framework_uuid, title: framework.name }] : []} />
            : <PeoplePage full={full} people={full ? state.staff : state.learners} name={state.name} />}
      </div>
    </div>}
  </div>
}

function Head({ title, sub, action }: { title: string; sub: string; action: string }) {
  return <div className="mb-3 flex items-start justify-between gap-2">
    <div><h4 className="text-base font-black">{title}</h4><span className="text-[11px] text-muted-foreground">{sub}</span></div>
    <span className="rounded-full bg-[var(--accent)] px-2.5 py-1 text-[11px] font-bold text-white">{action}</span>
  </div>
}

const enter = { initial: { opacity: 0, scale: 0.92, y: 8 }, animate: { opacity: 1, scale: 1, y: 0 }, exit: { opacity: 0, scale: 0.92 }, transition: { type: 'spring' as const, stiffness: 320, damping: 26 } }

function PlansPage({ picked }: { picked: SuggestedPlan[] }) {
  return <>
    <Head title="Plans" sub={picked.length ? `${picked.length} in your plans` : 'Your plans'} action="+ New plan" />
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
      <AnimatePresence>{picked.map((plan) => <motion.div key={plan.template_uuid} layout {...enter} className="overflow-hidden rounded-xl border border-border">
        <div className="flex h-16 items-center justify-center" style={{ background: `hsl(${hue(plan.title)} 70% 92%)`, color: `hsl(${hue(plan.title)} 55% 38%)` }}>
          <Layers3 size={20} />{plan.badge ? <Award size={13} className="ml-1 text-amber-600" /> : null}</div>
        <div className="p-2"><b className="block truncate text-[11px]">{plan.title}</b><span className="text-[10px] text-muted-foreground">{plan.step_count} steps</span></div>
      </motion.div>)}</AnimatePresence>
      {picked.length < 2 ? <div className="flex h-[104px] items-center justify-center rounded-xl border border-dashed border-border p-2 text-center text-[11px] text-muted-foreground">{picked.length ? 'Add another' : 'Plans you add show up here'}</div> : null}
    </div>
  </>
}

function PeoplePage({ full, people, name }: { full: boolean; people: string[]; name: string }) {
  return <>
    <Head title="People" sub={full ? `${people.length + 1} of 12 staff · 0 of 200 learners` : `${people.length} of 25 learners`} action="Invite" />
    <div className="space-y-1.5">
      {full ? <Row label={name || 'You'} pill="Admin" color="#2F66D6" /> : null}
      <AnimatePresence>{people.map((person, index) => <motion.div key={person} layout {...enter}><Row label={person} pill={full ? 'Staff' : 'Ready to invite'} color={AVATAR_COLORS[index % AVATAR_COLORS.length]} /></motion.div>)}</AnimatePresence>
      {!full && !people.length ? <p className="rounded-xl border border-dashed border-border p-4 text-center text-[11px] text-muted-foreground">People you add show up here</p> : null}
    </div>
  </>
}

function Row({ label, pill, color }: { label: string; pill: string; color: string }) {
  return <div className="flex items-center gap-2 rounded-xl border border-border p-2">
    <span className="flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-black text-white" style={{ background: color }}>{initials(label)}</span>
    <b className="min-w-0 flex-1 truncate text-[11px]">{label}</b><span className="rounded-full bg-muted px-2 py-0.5 text-[10px]">{pill}</span>
  </div>
}

function GroupsPage({ groups, staff }: { groups: string[]; staff: number }) {
  return <>
    <Head title="Groups" sub={groups.length ? `${groups.length} groups` : 'Cohorts, classes and teams'} action="+ New group" />
    <div className="grid grid-cols-2 gap-2">
      <AnimatePresence>{groups.map((group, index) => <motion.div key={group} layout {...enter} className="rounded-xl border border-border p-2.5">
        <i className="mb-2 block h-1.5 w-8 rounded-full" style={{ background: AVATAR_COLORS[(index + 2) % AVATAR_COLORS.length] }} />
        <b className="block truncate text-[12px]">{group}</b><span className="text-[10px] text-muted-foreground">0 learners · {staff ? '1 staff' : 'no staff yet'}</span>
      </motion.div>)}</AnimatePresence>
    </div>
    {groups.length ? null : <p className="rounded-xl border border-dashed border-border p-4 text-center text-[11px] text-muted-foreground">Groups you name show up here</p>}
  </>
}

function RequirementsPage({ chosen }: { chosen: Array<{ id: string; title: string }> }) {
  return <>
    <Head title="Requirements" sub="What your plans count toward" action="+ Add" />
    <div className="space-y-1.5">
      <AnimatePresence>{chosen.map((item) => <motion.div key={item.id} layout {...enter} className="flex items-center gap-2 rounded-xl border border-border p-2.5">
        <ListChecks size={14} className="text-sky-700" /><span className="min-w-0 flex-1"><b className="block truncate text-[11px]">{item.title}</b><span className="text-[10px] text-muted-foreground">Plans you add count toward it</span></span>
      </motion.div>)}</AnimatePresence>
      {chosen.length ? null : <p className="rounded-xl border border-dashed border-border p-4 text-center text-[11px] text-muted-foreground">Frameworks you track show up here</p>}
    </div>
  </>
}

/** What a learner sees when invited: this is where the name, logo and color show. */
function Invite({ state, spaceName, accent, mark }: { state: StartState; spaceName: string; accent: string; mark: React.ReactNode }) {
  const who = state.name.trim() || 'Someone'
  return <div className="relative flex flex-1 items-center justify-center p-6" style={{ background: `linear-gradient(180deg, ${accent}22, #fff 60%)` }}>
    <div className="w-full max-w-xs rounded-3xl bg-white p-6 text-center shadow-xl ring-1 ring-black/5">
      <div className="mx-auto flex w-fit scale-150 justify-center">{mark}</div>
      <small className="mt-5 block text-[11px] font-bold uppercase tracking-wide text-muted-foreground">You’re invited</small>
      <b className="mt-1 block text-lg">{state.orgOn ? `Join ${spaceName}` : `${who} invited you`}</b>
      <p className="mt-1 text-[12px] text-muted-foreground">{state.orgOn ? `${who} invited you to plan what’s next with ${spaceName}.` : 'They’ve set up a plan to help you figure out what’s next and get there.'}</p>
      <span className="mt-4 block rounded-full py-2 text-[12px] font-bold text-white" style={{ background: accent }}>Accept invite</span>
    </div>
  </div>
}
