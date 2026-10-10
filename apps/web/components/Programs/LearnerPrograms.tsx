'use client'

import React from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { Layers3, MailOpen } from 'lucide-react'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { getAPIUrl, getUriWithOrg, routePaths } from '@services/config/config'
import { swrFetcher } from '@services/utils/ts/requests'
import { cn } from '@/lib/utils'
import { useReducedMotion } from 'motion/react'

const allMyKey = () => `${getAPIUrl()}programs/me/all/details`

export function LearnerProgramsCarousel({ orgslug }: { orgslug: string }) {
  const session = useLHSession() as any
  const token = session?.data?.tokens?.access_token
  const { data } = useSWR(token ? allMyKey() : null, (url) => swrFetcher(url, token), { revalidateOnFocus: false })
  const visible = (data || []).filter((item: any) => ['invited', 'active'].includes(item.status))
  const reduceMotion = useReducedMotion()
  const [activeIndex, setActiveIndex] = React.useState(0)
  const active = visible[Math.min(activeIndex, visible.length - 1)] || visible[0]
  React.useEffect(() => { setActiveIndex((current) => Math.min(current, Math.max(0, visible.length - 1))) }, [visible.length])
  React.useEffect(() => {
    if (visible.length < 2 || reduceMotion) return
    const timer = window.setTimeout(() => setActiveIndex((current) => (current + 1) % visible.length), 6000)
    return () => window.clearTimeout(timer)
  }, [activeIndex, reduceMotion, visible.length])
  if (!visible.length) return null
  const href = routePaths.org.program(active.program.slug)
  return <section className="min-w-0"><div className="mb-2 flex items-center justify-between"><h2 className="text-base font-black text-foreground">Your programs</h2><Link href={getUriWithOrg(orgslug, routePaths.org.programs())} className="text-xs font-black text-foreground hover:underline">View all</Link></div><div className="grid gap-3"><Link href={href} className={cn('group grid min-h-32 grid-cols-[minmax(0,1fr)_38%] overflow-hidden rounded-xl border bg-popover transition hover:border-foreground/25 hover:bg-accent/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-foreground sm:min-h-44 sm:grid-cols-[34%_minmax(0,1fr)]', active.status === 'invited' ? 'border-blue-200' : 'border-border')}><div className={cn('order-2 flex items-center justify-center border-l border-border sm:order-1 sm:border-l-0 sm:border-r', active.status === 'invited' ? 'bg-blue-50 text-blue-600' : 'bg-lime-100 text-gray-950')}>{active.status === 'invited' ? <MailOpen size={44} strokeWidth={1.6} /> : <Layers3 size={44} strokeWidth={1.6} />}</div><div className="order-1 flex min-w-0 flex-col justify-center p-4 sm:order-2 sm:px-6"><div className="flex items-center gap-2">{active.status === 'invited' && <span className="rounded-full bg-blue-600 px-2 py-0.5 text-[9px] font-black uppercase text-white">New invitation</span>}</div><h3 className="mt-2 line-clamp-2 text-lg font-black text-foreground">{active.program?.name}</h3>{(active.program?.description || active.assignment?.welcome_message) && <p className="mt-2 hidden line-clamp-2 text-sm leading-5 text-muted-foreground sm:block">{active.program?.description || active.assignment?.welcome_message}</p>}<p className="mt-3 text-xs font-bold text-muted-foreground">{active.status === 'invited' ? 'Ready when you are' : `${active.assignment.progress_percent}% complete`}</p>{active.status === 'active' && <div className="mt-2 h-1.5 max-w-sm overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-[var(--org-primary-color)]" style={{ width: `${active.assignment.progress_percent}%` }} /></div>}</div></Link>{visible.length > 1 && <div className="flex snap-x gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">{visible.map((item: any, index: number) => <button type="button" key={item.participant_uuid} onClick={() => setActiveIndex(index)} aria-pressed={index === activeIndex} className={cn('flex h-16 min-w-44 max-w-56 shrink-0 snap-start items-center gap-3 rounded-lg px-2 text-left transition hover:bg-muted/60', index === activeIndex && 'bg-muted')}><span className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-md', item.status === 'invited' ? 'bg-blue-100 text-blue-700' : 'bg-lime-100 text-gray-950')}>{item.status === 'invited' ? <MailOpen size={17} /> : <Layers3 size={17} />}</span><span className="line-clamp-2 text-sm font-semibold leading-snug">{item.program?.name}</span></button>)}</div>}</div></section>
}
