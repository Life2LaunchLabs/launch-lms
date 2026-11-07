'use client'

import React from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import useSWR from 'swr'
import { ArrowLeft, ArrowLeftRight, Layers, Loader2, MapPin } from 'lucide-react'
import { useOrg } from '@components/Contexts/OrgContext'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import GeneralWrapper from '@components/Objects/StyledElements/Wrappers/GeneralWrapper'
import ResourceSheet from '@components/Discover/ResourceSheet'
import { getUriWithOrg } from '@services/config/config'
import { careersApi, exploreKey, shortMoney, type ExploreCareer } from '@services/life/careers'
import { cn } from '@/lib/utils'
import { CAREER_TYPES, TRAINING, CareerIcon, matchLabel } from './CareerTile'
import CareerCompare, { type CompareChoice } from './CareerCompare'
import UnlockMatches from './UnlockMatches'

// The learner's own Explore home: careers ranked for them (interest fit, nudged by the skills a job uses), each
// with pay near their home base and how long training takes, then the careers they saved, ready to compare.
// Until the "Unlock your matches" quest is done, its open items sit on top and the page says what's missing.

type Sort = 'fit' | 'pay' | 'quick'
const SORTS: Array<[Sort, string]> = [['fit', 'Best fit'], ['pay', 'Highest pay'], ['quick', 'Quickest to start']]
const SHOWN = 12

function CareerCard({ career, href }: { career: ExploreCareer; href: string }) {
  const color = (CAREER_TYPES[career.top_interests?.[0]] || CAREER_TYPES.E).color
  const used = career.skills_used.length
  return <Link href={href} scroll={false} className="flex items-center gap-3 rounded-[18px] border-2 border-border bg-card p-3.5 text-foreground no-underline shadow-[0_4px_0_hsl(var(--border))] active:translate-y-[3px] active:shadow-[0_1px_0_hsl(var(--border))]">
    <span aria-hidden="true" className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl text-white" style={{ backgroundColor: color }}><CareerIcon code={career.code} className="h-6 w-6" /></span>
    <span className="flex min-w-0 flex-1 flex-col gap-1">
      <span className="flex items-baseline justify-between gap-2">
        <span className="min-w-0 text-[16px] font-extrabold leading-tight">{career.title}</span>
        {career.pay ? <span className="flex shrink-0 items-center gap-1 text-[14px] font-extrabold">
          {career.pay.near ? <MapPin size={13} className="text-amber-600" aria-label={`Pay near you, in ${career.pay.place}`} /> : null}{shortMoney(career.pay.yearly)}<span className="text-[12px] font-bold text-muted-foreground">/yr</span>
        </span> : null}
      </span>
      <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[12.5px] font-bold text-muted-foreground">
        {career.match != null ? <span className={cn('rounded-full px-2 py-0.5 text-[12px] font-extrabold', career.match >= 0.7 ? 'text-white' : 'text-foreground')}
          style={{ backgroundColor: career.match >= 0.7 ? color : `${color}26` }}>{matchLabel(career.match)}</span> : null}
        {career.job_zone ? <span>{TRAINING[career.job_zone]}</span> : null}
        {used ? <span>· uses {used} of your skills</span> : null}
      </span>
    </span>
  </Link>
}

export default function ExploreHome({ orgslug }: { orgslug: string }) {
  const org = useOrg() as any
  const session = useLHSession() as any
  const token: string | undefined = session?.data?.tokens?.access_token
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const { data, error } = useSWR(token && org?.id ? [...exploreKey(org.id), token] : null, () => careersApi.explore(org.id, token!))
  const [sort, setSort] = React.useState<Sort>('fit')
  const [all, setAll] = React.useState(false)
  const [compare, setCompare] = React.useState<CompareChoice[] | null>(null)

  const sheet = params.get('r') || ''
  const setSheet = React.useCallback((uuid: string) => {
    const next = new URLSearchParams(params.toString())
    if (uuid) next.set('r', uuid.replace(/^resource_/, '')); else next.delete('r')
    router.replace(`${pathname}${next.size ? `?${next}` : ''}`, { scroll: false })
  }, [params, pathname, router])
  const hrefOf = (uuid: string) => {
    const next = new URLSearchParams(params.toString())
    next.set('r', uuid.replace(/^resource_/, ''))
    return `${pathname}?${next}`
  }

  const careers = React.useMemo(() => {
    const list = data?.careers || []
    if (sort === 'pay') return [...list].sort((a, b) => (b.pay?.yearly ?? -1) - (a.pay?.yearly ?? -1))
    if (sort === 'quick') return [...list].sort((a, b) => (a.job_zone ?? 9) - (b.job_zone ?? 9) || (b.match ?? -1) - (a.match ?? -1))
    return list
  }, [data, sort])

  let body: React.ReactNode
  if (!token) body = <p className="m-0 text-[15px] text-muted-foreground">Sign in to see careers that fit you.</p>
  else if (error) body = <p className="m-0 text-[15px] text-muted-foreground">Explore didn’t load. Try again in a moment.</p>
  else if (!data) body = <div className="flex h-32 items-center justify-center"><Loader2 className="animate-spin text-muted-foreground" aria-label="Loading" /></div>
  else if (!data.has_careers) body = <p className="m-0 text-[15px] text-muted-foreground">Your organization hasn’t added careers yet.</p>
  else {
    const shown = all ? careers : careers.slice(0, SHOWN)
    const based = [data.has_quiz ? 'your interests' : '', data.has_skills ? 'the skills you picked' : '', data.home ? 'pay near home' : ''].filter(Boolean)
    body = <>
      {!data.quest.complete && org?.id ? <UnlockMatches quest={data.quest} orgslug={orgslug} orgId={org.id} token={token} compact /> : null}
      <p className="m-0 text-[14px] leading-snug text-muted-foreground">
        {based.length ? `From ${based.length > 1 ? `${based.slice(0, -1).join(', ')} and ${based[based.length - 1]}` : based[0]}.` : 'Finish a few of the steps above to see your closest matches first.'}
      </p>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Sort careers">
        {SORTS.map(([key, label]) => <button key={key} type="button" aria-pressed={sort === key} onClick={() => { setSort(key); setAll(false) }}
          className={cn('min-h-10 rounded-full border-2 px-3.5 text-[13px] font-extrabold', sort === key ? 'border-foreground bg-foreground text-background' : 'border-border bg-card text-foreground')}>{label}</button>)}
      </div>
      <div className="flex flex-col gap-2.5">{shown.map((career) => <CareerCard key={career.code} career={career} href={hrefOf(career.resource_uuid)} />)}</div>
      {careers.length > SHOWN ? <button type="button" onClick={() => setAll(!all)} className="min-h-11 self-start text-[14px] font-extrabold text-[var(--org-primary-color)] hover:underline">
        {all ? 'Show fewer' : `Show ${careers.length - SHOWN} more`}
      </button> : null}

      <section aria-labelledby="explore-saved" className="flex flex-col gap-2 rounded-[20px] border-2 border-border bg-card p-4">
        <h2 id="explore-saved" className="m-0 text-[12px] font-extrabold uppercase tracking-[0.08em] text-muted-foreground">Saved</h2>
        {data.saved.length ? <div className="flex flex-wrap items-center justify-between gap-2.5">
          <span className="min-w-0 text-[14.5px] font-extrabold">{data.saved.map((item) => item.title).join(', ')}</span>
          <button type="button" onClick={() => setCompare(data.saved.slice(0, 3).map((item) => ({ code: item.code, title: item.title })))}
            className="flex min-h-10 items-center gap-1.5 rounded-xl border-2 border-border px-3 text-[13px] font-extrabold"><ArrowLeftRight size={14} aria-hidden="true" />Compare</button>
        </div> : <p className="m-0 text-[13.5px] text-muted-foreground">Careers you save show up here. Career swipe is a quick way to find some.</p>}
        <Link href={getUriWithOrg(orgslug, '/discover/careers')} className="flex min-h-10 items-center gap-1.5 self-start text-[14px] font-extrabold text-[var(--org-primary-color)] no-underline hover:underline"><Layers size={15} aria-hidden="true" />Career swipe</Link>
      </section>
      {compare && token ? <CareerCompare start={compare} token={token} onClose={() => setCompare(null)} suggestions={data.careers.slice(0, 6).map((item) => ({ code: item.code, title: item.title }))} /> : null}
    </>
  }

  return <GeneralWrapper>
    <main className="mx-auto flex w-full max-w-[640px] flex-col gap-4 pb-16 pt-2 text-foreground">
      <Link href={getUriWithOrg(orgslug, '/discover')} className="flex min-h-10 items-center gap-1.5 self-start text-[14px] font-bold text-muted-foreground no-underline hover:text-foreground"><ArrowLeft size={16} aria-hidden="true" />Discover</Link>
      <div className="flex flex-col gap-1">
        <span className="text-[13px] font-extrabold text-[var(--org-primary-color)]">For you{data?.home ? ` · around ${data.home.label.replace(/, OR$/, '')}` : ''}</span>
        <h1 className="m-0 text-[26px] font-extrabold leading-tight">Careers that fit you</h1>
      </div>
      {body}
      {sheet ? <ResourceSheet resourceUuid={sheet} orgslug={orgslug} onClose={() => setSheet('')} onOpen={setSheet} /> : null}
    </main>
  </GeneralWrapper>
}
