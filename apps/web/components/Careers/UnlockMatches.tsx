'use client'

import React from 'react'
import Link from 'next/link'
import { useSWRConfig } from 'swr'
import { Check, Lock, ShieldCheck } from 'lucide-react'
import { getUriWithOrg } from '@services/config/config'
import { exploreKey, type MatchQuest, type QuestItem } from '@services/life/careers'
import { cn } from '@/lib/utils'
import HomeBaseSheet from './HomeBaseSheet'

// "Unlock your matches": five things from the learner's portfolio, each turning on part of Explore's matching.
// Each item opens the place it's done (the interest quiz, the skills picker, the home base sheet, the timeline).

const PATHS: Record<Exclude<QuestItem['key'], 'home'>, string> = {
  interests: '/portfolio/interests',
  skills: '/portfolio/results?open=skills-values',
  styles: '/portfolio/results?open=skills-values',
  school: '/portfolio/timeline/new?type=education',
}

export default function UnlockMatches({ quest, orgslug, orgId, token, compact = false }: { quest: MatchQuest; orgslug: string; orgId?: number; token: string; compact?: boolean }) {
  const [homeOpen, setHomeOpen] = React.useState(false)
  const { mutate } = useSWRConfig()
  const saved = () => mutate((key) => Array.isArray(key) && (key[0] === 'career-profile' || key[0] === 'life-home' || (key[0] === exploreKey(orgId)[0])))
  const homeHref = getUriWithOrg(orgslug, '/discover/explore')
  const items = compact ? quest.items.filter((item) => !item.done) : quest.items

  return <section aria-labelledby="unlock-matches-title" className="flex flex-col gap-3 rounded-[20px] border-2 border-[var(--org-primary-color)] bg-card p-4 shadow-[0_4px_0_color-mix(in_srgb,var(--org-primary-color)_35%,transparent)]">
    <div className="flex flex-col gap-1">
      <h2 id="unlock-matches-title" className="m-0 text-[19px] font-extrabold leading-tight">Unlock your matches · {quest.done} of {quest.total}</h2>
      <p className="m-0 text-[14px] leading-snug text-muted-foreground">Each one makes Explore more about you. Finish all {quest.total} to make your Explore home your own.</p>
    </div>
    <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={quest.total} aria-valuenow={quest.done} aria-label={`${quest.done} of ${quest.total} done`}>
      <div className="h-full rounded-full bg-[var(--org-primary-color)] transition-[width]" style={{ width: `${(quest.done / quest.total) * 100}%` }} />
    </div>
    <ul className="m-0 flex list-none flex-col gap-2 p-0">
      {items.map((item) => {
        const go = 'flex min-h-10 shrink-0 items-center rounded-xl bg-foreground px-3 text-[13px] font-extrabold text-background no-underline'
        return <li key={item.key} className={cn('flex items-center gap-3 rounded-[14px] px-3 py-2.5', item.done ? 'bg-muted/60' : 'border-2 border-border bg-card')}>
          <span aria-hidden="true" className={cn('flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full', item.done ? 'bg-[var(--org-primary-color)] text-[var(--org-on-primary-color)]' : 'border-2 border-border')}>
            {item.done ? <Check size={14} strokeWidth={3} /> : null}
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className={cn('text-[14.5px] font-extrabold', item.done && 'text-muted-foreground line-through')}>
              {item.title}{!item.done && item.need ? <span className="font-bold text-muted-foreground"> · {item.have || 0}/{item.need}</span> : null}
              {item.done ? <span className="sr-only"> (done)</span> : null}
            </span>
            <span className="text-[12.5px] font-bold text-[var(--org-primary-color)]">{item.unlocks}</span>
          </span>
          {item.done ? null : item.key === 'home'
            ? <button type="button" onClick={() => setHomeOpen(true)} className={go}>Go<span className="sr-only">: {item.title}</span></button>
            : <Link href={getUriWithOrg(orgslug, PATHS[item.key])} className={go}>Go<span className="sr-only">: {item.title}</span></Link>}
        </li>
      })}
    </ul>
    {compact ? null : <>
      <div className="flex items-start gap-2.5 rounded-[14px] border-2 border-dashed border-border p-3">
        <Lock size={17} className="mt-0.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <p className="m-0 text-[13.5px] leading-snug text-muted-foreground"><span className="font-extrabold text-foreground">Your Explore home:</span> careers that fit you, near you, with what they pay and how long training takes. <Link href={homeHref} className="font-extrabold text-[var(--org-primary-color)]">Preview it</Link></p>
      </div>
      <p className="m-0 flex items-start gap-2 text-[12.5px] leading-snug text-muted-foreground">
        <ShieldCheck size={15} className="mt-0.5 shrink-0" aria-hidden="true" />Your interests and skills only show on your portfolio if you put them there. Your home base is your portfolio’s location.
      </p>
    </>}
    {homeOpen ? <HomeBaseSheet token={token} onClose={() => setHomeOpen(false)} onSaved={saved} /> : null}
  </section>
}
