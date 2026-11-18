'use client'

import React from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import useSWR from 'swr'
import toast from 'react-hot-toast'
import { Check, Loader2 } from 'lucide-react'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { useOrg } from '@components/Contexts/OrgContext'
import { CoursePlanCard } from '@components/Threads/profiles/CoursePlan'
import { Card } from '@components/Threads/profiles/ProfileFrame'
import { routePaths } from '@services/routing/paths'
import { eppReportApi, myCoursesApi, myCoursesKey, myEppKey, type EvidenceItem, type Pick } from '@services/epp/report'
import EppReport from './EppReport'
import { SupportAsk, useMySupports } from './SupportAsk'

const KIND_LABEL: Record<EvidenceItem['kind'], string> = { credential: 'Credential', result: 'Result', project: 'Project', experience: 'Experience', quote: 'Quote' }
const same = (a: Pick, b: Pick) => a.kind === b.kind && a.uuid === b.uuid

/** Choose which public portfolio items go in the report. */
function EvidencePicker({ choices, picks, onSave }: { choices: EvidenceItem[]; picks: Pick[]; onSave: React.Dispatch<Pick[]> }) {
  const [chosen, setChosen] = React.useState<Pick[]>(picks)
  React.useEffect(() => setChosen(picks), [picks])
  const changed = chosen.length !== picks.length || chosen.some((pick, index) => !same(pick, picks[index]))
  const toggle = (item: EvidenceItem) => setChosen((current) => current.some((pick) => same(pick, item)) ? current.filter((pick) => !same(pick, item)) : [...current, { kind: item.kind, uuid: item.uuid }])
  return <Card title="What I show" aside={changed ? <button type="button" onClick={() => onSave(chosen)} className="inline-flex h-8 items-center gap-1 rounded-full bg-foreground px-3 text-xs font-semibold text-background"><Check size={13} aria-hidden="true" />Save</button> : null}>
    <p className="mb-3 text-sm text-muted-foreground">Pick your best work, credentials and experiences for the report. Only things your portfolio already shares are listed.</p>
    {!choices.length ? <p className="text-sm text-muted-foreground">Nothing in your portfolio is shared yet. Add something there and it shows up here.</p>
      : <ul className="divide-y divide-border/60">{choices.map((item) => {
        const on = chosen.some((pick) => same(pick, item))
        return <li key={`${item.kind}-${item.uuid}`}>
          <label className="flex cursor-pointer items-center gap-3 py-2 text-sm">
            <input type="checkbox" checked={on} onChange={() => toggle(item)} className="h-4 w-4" />
            <span className="min-w-0 flex-1"><span className="font-semibold">{item.kind === 'quote' ? `“${item.summary}”` : item.title}</span>
              <span className="block text-xs text-muted-foreground">{KIND_LABEL[item.kind]}{item.detail ? ` · ${item.detail}` : ''}</span></span>
          </label>
        </li>
      })}</ul>}
  </Card>
}

/**
 * A learner's Education Plan and Profile with the organization they're in: their course plan, the
 * portfolio items they choose to show, and a preview of the report their school sees.
 */
export default function MyEpp() {
  const hostOrg = useOrg() as any
  const session = useLHSession() as any
  const token: string | undefined = session?.data?.tokens?.access_token
  const asked = useSearchParams()?.get('org')
  // Learners use the main site, so the school comes from their support links, not the address: the one
  // named by ?org=, else the school that supports them (the first, if several), else this site's organization.
  const mySupports = useMySupports()
  const supports = mySupports.loaded ? mySupports : undefined
  const schools = mySupports.active.map((item) => item.org!)
  // Asks they can still answer, from any school: answered here as well as in their chat (FEED-214, FEED-219).
  const asks = mySupports.open
  const org: { id: number; name: string; slug?: string } | undefined = !supports ? undefined
    : schools.find((item) => item.slug === asked) || schools[0] || asks.find((item) => item.org?.slug === asked)?.org || asks[0]?.org || (hostOrg?.id ? { id: Number(hostOrg.id), name: hostOrg.name, slug: hostOrg.slug } : undefined)
  const orgId = Number(org?.id) || 0
  const ready = Boolean(orgId && token)
  const { data, error, mutate } = useSWR(ready ? myEppKey(orgId) : null, () => eppReportApi.mine(orgId, token), { revalidateOnFocus: false, shouldRetryOnError: false })
  const { data: plan, mutate: setPlan } = useSWR(ready && data ? myCoursesKey(orgId) : null, () => myCoursesApi.plan(orgId, token), { revalidateOnFocus: false })

  const savePicks = async (picks: Pick[]) => {
    try {
      await mutate(await eppReportApi.setPicks(orgId, picks, token), { revalidate: false })
      toast.success('Saved')
    } catch (failure: any) {
      toast.error(failure?.message || 'That didn’t save')
    }
  }

  return <div className="mx-auto w-full max-w-[880px] space-y-5 px-4 py-8 @container sm:px-6">
    <header>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{org?.name}</p>
      <h1 className="mt-1 text-2xl font-extrabold">My Education Plan and Profile</h1>
      <p className="mt-1 text-sm text-muted-foreground">Your school uses this for Oregon’s yearly plan. You choose what goes in, and you can stop sharing any time from your chat with them.</p>
      {schools.length > 1 ? <nav className="mt-3 flex flex-wrap gap-2" aria-label="Schools">
        {schools.map((school) => <Link key={school.id} href={routePaths.org.epp(school.slug)} aria-current={school.id === orgId ? 'page' : undefined}
          className={school.id === orgId ? 'rounded-full bg-foreground px-3 py-1 text-sm font-semibold text-background' : 'rounded-full border border-border px-3 py-1 text-sm font-semibold hover:bg-muted'}>{school.name}</Link>)}
      </nav> : null}
    </header>
    {asks.map((ask) => <SupportAsk key={ask.support_uuid} ask={ask} token={token} onAnswered={async () => { await mySupports.mutate(); await mutate() }} />)}
    {supports && !org ? asks.length ? null : <Card><p className="text-sm text-muted-foreground">No school supports your plan yet. When one asks, a card shows up in your chat with them.</p></Card>
      : error && !data ? asks.length ? null : <Card><p className="text-sm text-muted-foreground">{org?.name || 'This organization'} doesn’t support your plan yet. When they ask, a card shows up in your chat with them.</p></Card>
      : !data ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      : <>
        <CoursePlanCard plan={plan} onChange={async (result) => { await setPlan(result, { revalidate: false }); await mutate() }}
          note="Your school confirms courses you've finished. Ask them if something they confirmed needs to change."
          actions={{
            add: (value) => myCoursesApi.add(orgId, value, token),
            update: (courseUuid, value) => myCoursesApi.update(orgId, courseUuid, value, token),
            remove: (courseUuid) => myCoursesApi.remove(orgId, courseUuid, token),
          }} />
        <EvidencePicker choices={data.choices} picks={data.picks} onSave={(picks) => void savePicks(picks)} />
        {(data.report.careers_explored || 0) > (data.report.careers?.length || 0) ? <p className="text-sm text-muted-foreground">
          Your school sees how many careers you’ve explored. To show which ones, and what you wrote, turn on <b>Add to my EPP</b> on a career you saved in Discover.
        </p> : null}
        <section>
          <h2 className="mb-2 text-base font-bold">What your school sees</h2>
          <div className="overflow-hidden rounded-2xl border border-border bg-[#fff] px-4 sm:px-8"><EppReport report={data.report} /></div>
        </section>
      </>}
  </div>
}
