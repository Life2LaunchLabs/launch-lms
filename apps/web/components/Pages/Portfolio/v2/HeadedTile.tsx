'use client'

import { BriefcaseBusiness, Flag, GraduationCap, HeartHandshake, MapPin, Plane, School } from 'lucide-react'
import { getUriWithOrg } from '@services/config/config'
import { EmptyAdd, PALETTE, Tile } from './parts'
import type { LifePhase, Shell } from '../portfolioTypes'

// "Where I'm headed": the phase of the learner's life plan they're in now and the next ones.
// It reads only titles, kinds, places and dates, never the budget. Only the learner sees it for now.

const KIND = { school: ['In school', School], study: ['College or training', GraduationCap], work: ['Working', BriefcaseBusiness], gap: ['Gap or travel', Plane], family: ['Family or care', HeartHandshake] } as const

const monthYear = (value: string) => {
  const [year, month] = value.split('-').map(Number)
  return new Date(year, month - 1, 1).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
}

function PhaseRow({ phase, label, now }: { phase: LifePhase; label: string; now?: boolean }) {
  const [kind, Icon] = KIND[phase.kind as keyof typeof KIND] || ['Something else', Flag]
  const [face, , soft] = PALETTE.lime
  return <div className="flex min-w-0 items-center gap-3">
    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl" style={now ? { background: face, color: '#fff' } : { background: soft, color: face }}><Icon className="h-5 w-5" /></span>
    <span className="min-w-0 flex-1">
      <small className="block text-[11.5px] font-extrabold uppercase tracking-[0.06em] text-muted-foreground">{label}</small>
      <b className="block truncate text-[15.5px] font-extrabold">{phase.title}</b>
      <small className="flex flex-wrap items-center gap-x-2 text-[12.5px] font-semibold text-muted-foreground"><span>{kind}</span>{phase.place ? <span className="inline-flex items-center gap-0.5"><MapPin className="h-3 w-3" />{phase.place}</span> : null}<span>{now ? `until ${monthYear(phase.ends)}` : `from ${monthYear(phase.starts)}`}</span></small>
    </span>
  </div>
}

export function HeadedTile({ shell, owner, orgslug, spot }: { shell: Shell; owner: boolean; orgslug: string; spot?: string }) {
  if (!owner) return null
  const headed = shell.headed || { now: null, next: [] }
  const href = getUriWithOrg(orgslug, '/plans')
  const empty = !headed.now && !headed.next.length
  return <Tile color="lime" spot={spot} icon={Flag} title="Where I’m headed" href={href} label="Where I’m headed">
    {headed.now ? <PhaseRow phase={headed.now} label="Now" now /> : null}
    {headed.next.map((phase, index) => <PhaseRow key={phase.id || index} phase={phase} label={index ? 'After that' : 'Next'} />)}
    {empty ? <EmptyAdd title="Plan your now and next" hint="Where you are right now, and the phase that comes after." href={href} />
      : !headed.now || !headed.next.length ? <EmptyAdd title={headed.now ? 'Add what comes next' : 'Add where you are now'} hint="Your plan lines up phases one after another." href={href} /> : null}
    <small className="text-[12px] font-semibold text-muted-foreground">Only you see this for now. Your budget is never shown.</small>
  </Tile>
}
