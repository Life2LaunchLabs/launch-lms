'use client'

import React from 'react'
import Link from 'next/link'
import { ArrowRight, Calendar, Compass, ListChecks, MessageCircle, Pencil, Search, Signpost, Users } from 'lucide-react'
import NewPlanModal from '@components/Plans/create/NewPlanModal'
import { useCanEditPlans } from '@components/Plans/shared/useCanEditPlans'
import { getUriWithOrg, routePaths } from '@services/config/config'

const choice = 'group flex w-full items-center gap-4 rounded-[18px] border-[1.5px] border-border bg-card px-[18px] py-4 text-left transition hover:-translate-y-px hover:border-[#2F66D6] hover:shadow-[0_8px_28px_rgba(15,30,40,0.08)]'

/** Plans before the org has any: what a plan is, and the two ways to get one. */
export default function PlansWelcome({ orgslug }: { orgslug: string }) {
  const canEdit = useCanEditPlans() === true
  return <div className="min-h-full w-full bg-[#f8f8f8]">
    <section className="mx-auto grid min-h-[calc(100vh-120px)] max-w-[1180px] items-center gap-7 px-4 py-7 sm:px-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-12">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.06em] text-[#2253B8]">New here</p>
        <h1 className="mt-3 text-[clamp(34px,4vw,52px)] font-extrabold leading-[1.02] tracking-[-0.04em]">Say hello to Plans</h1>
        <p className="mt-3.5 max-w-[460px] text-[17px] leading-normal text-muted-foreground">A plan is a path of steps you assign to a learner. They work through it at their own pace, and you see every step they finish.</p>
        <div className="mt-7 grid max-w-[440px] gap-2.5">
          <Link href={getUriWithOrg(orgslug, routePaths.org.admin.discover())} className={choice}>
            <Choice color="#0B8077" icon={<Compass size={24} />} title="Explore ready-made plans" detail="Find one in Discover, add it, and make it yours" />
          </Link>
          {canEdit ? <NewPlanModal orgslug={orgslug} trigger={<button type="button" className={choice}>
            <Choice color="#2F66D6" icon={<Pencil size={24} />} title="Build your own" detail="Start blank and add steps one at a time" />
          </button>} /> : null}
        </div>
      </div>
      <div className="grid gap-3.5">
        <Feature tone="bg-[hsl(190_60%_94%)] text-[hsl(195_60%_14%)]" color="#0B8077" icon={<ListChecks size={19} />} title="Steps learners can follow"
          detail="Tasks, write-ups, uploads, events, decisions and more. Learners always know what’s next."
          art={<Mini>{[['#C77A0E', <Signpost key="d" size={12} />, 'Pick a career area', true], ['#0B8077', <Search key="e" size={12} />, 'Research three jobs', false], ['#C8327D', <Calendar key="v" size={12} />, 'Job shadow visit', false]].map(([color, icon, label, done]) =>
            <div key={label as string} className={`flex items-center gap-2 rounded-lg bg-[hsl(200_22%_96%)] p-1.5 ${done ? 'line-through opacity-55' : ''}`}><i className="grid h-5 w-5 place-items-center rounded-md text-white" style={{ background: color as string }}>{icon}</i>{label}</div>)}</Mini>} />
        <Feature flip tone="bg-[hsl(42_90%_92%)] text-[hsl(30_60%_16%)]" color="#C8327D" icon={<MessageCircle size={19} />} title="Talk it through in the feed"
          detail="Every plan has a chat feed. Learners share progress and ask for help, and you answer right there."
          art={<Mini chat>
            <Bubble initials="MR" color="#C8327D">Done with my job shadow! Photos are up.</Bubble>
            <Bubble mine>Love it. What surprised you most?</Bubble>
            <Bubble initials="JL" color="#2F66D6">Can we talk about step 3?</Bubble>
          </Mini>} />
        <Feature tone="bg-[hsl(255_70%_95%)] text-[hsl(255_40%_20%)]" color="#6B3FE0" icon={<Users size={19} />} title="Assign it and follow along"
          detail="Give a plan to one learner or a whole group, and see who’s moving and who needs a hand."
          art={<Mini>{([['MR', '#C8327D', 80], ['JL', '#2F66D6', 45], ['SP', '#0B8077', 15]] as const).map(([initials, color, width]) =>
            <div key={initials} className="flex items-center gap-2 p-1"><Avatar initials={initials} color={color} /><span className="h-[5px] flex-1 overflow-hidden rounded bg-[hsl(200_18%_90%)]"><b className="block h-full" style={{ width: `${width}%`, background: color }} /></span></div>)}</Mini>} />
      </div>
    </section>
  </div>
}

function Choice({ color, icon, title, detail }: { color: string; icon: React.ReactNode; title: string; detail: string }) {
  return <>
    <span className="grid h-12 w-12 flex-none place-items-center rounded-[14px] text-white" style={{ background: color }}>{icon}</span>
    <span className="min-w-0"><b className="block text-base">{title}</b><span className="text-[13.5px] text-muted-foreground">{detail}</span></span>
    <ArrowRight size={20} className="ml-auto shrink-0 text-muted-foreground" aria-hidden="true" />
  </>
}

function Feature({ tone, color, icon, title, detail, art, flip }: { tone: string; color: string; icon: React.ReactNode; title: string; detail: string; art: React.ReactNode; flip?: boolean }) {
  return <div className={`grid min-h-[150px] items-center gap-5 overflow-hidden rounded-[22px] px-6 py-[22px] sm:grid-cols-[minmax(0,1fr)_210px] ${tone} ${flip ? 'sm:grid-cols-[210px_minmax(0,1fr)]' : ''}`}>
    <div className={flip ? 'sm:order-2' : ''}>
      <span className="mb-2.5 grid h-[38px] w-[38px] place-items-center rounded-full text-white" style={{ background: color }}>{icon}</span>
      <h3 className="text-lg font-bold">{title}</h3>
      <p className="mt-1.5 text-sm leading-[1.45] opacity-80">{detail}</p>
    </div>
    <div aria-hidden="true">{art}</div>
  </div>
}

function Mini({ children, chat }: { children: React.ReactNode; chat?: boolean }) {
  return <div className={`grid rounded-xl bg-white text-[11.5px] font-semibold text-[hsl(200_30%_9%)] shadow-[0_10px_24px_rgba(15,30,40,0.12)] ${chat ? 'gap-2 p-3' : 'gap-1.5 p-2.5'}`}>{children}</div>
}

function Avatar({ initials, color }: { initials: string; color: string }) {
  return <span className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full text-[9px] font-bold text-white" style={{ background: color }}>{initials}</span>
}

function Bubble({ initials, color, mine, children }: { initials?: string; color?: string; mine?: boolean; children: React.ReactNode }) {
  return <div className={`flex items-end gap-1.5 ${mine ? 'justify-end' : ''}`}>
    {initials && color ? <Avatar initials={initials} color={color} /> : null}
    <span className={`max-w-[85%] rounded-xl px-2.5 py-1.5 font-medium ${mine ? 'bg-[#2F66D6] text-white' : 'bg-[hsl(200_22%_95%)]'}`}>{children}</span>
  </div>
}
