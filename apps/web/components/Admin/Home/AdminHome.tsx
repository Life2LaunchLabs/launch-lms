'use client'
import React from 'react'
import useSWR from 'swr'
import toast from 'react-hot-toast'
import { ArrowDown, ArrowUp, SlidersHorizontal } from 'lucide-react'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { useOrg } from '@components/Contexts/OrgContext'
import { useFeatures } from '@components/Hooks/useFeatures'
import { Skeleton } from '@components/ui/skeleton'
import { adminHomeApi, adminHomeKey, type AdminHome as AdminHomeData, type HomeWidgetId } from '@services/goals/adminHome'
import { ADMIN_HOME_WIDGETS, type AdminVisibility, type AdminWidget } from '@/lib/admin/registry'
import { arrangeWidgets, layoutOf, moveWidget, toggleWidget, type ArrangedWidget } from '@/lib/admin/homeLayout'
import { cn } from '@/lib/utils'
import { CreatorWidget, MessagesWidget } from './OrgWidgets'
import { AttentionWidget, TodayWidget, WaitingWidget } from './StaffWidgets'
import { LockedWidget } from './WidgetCard'
import GettingStarted from './GettingStarted'
import { TrialBanner } from '@components/Admin/Upgrade/PlanBanners'

const WIDE: HomeWidgetId[] = ['today', 'attention']

function greeting(now = new Date()) {
  const hour = now.getHours()
  return hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
}

/**
 * The admin Home: widgets for what needs the viewer today and how the org's work is going.
 * The API says which widgets this viewer gets and sends their data in one call; the registry
 * hides or locks each like the tabs. Each person orders and hides widgets for this org.
 */
export default function AdminHome({ orgslug }: { orgslug: string }) {
  const org = useOrg() as any
  const session = useLHSession() as any
  const token = session?.data?.tokens?.access_token
  const user = session?.data?.user
  const orgId = Number(org?.id)
  const features = useFeatures()
  const { data, error, mutate } = useSWR<AdminHomeData>(orgId && token ? adminHomeKey(orgId) : null, () => adminHomeApi.get(orgId, token), { revalidateOnFocus: true })
  const [customizing, setCustomizing] = React.useState(false)

  // A widget shows when the API offers it and the registry doesn't hide it; it's locked when either says so.
  const visibilityOf = (widget: AdminWidget): AdminVisibility => features.visibility(widget.requires)
  const offered = (data?.widgets || []).filter((id) => {
    const widget = ADMIN_HOME_WIDGETS.find((item) => item.id === id)
    return widget && visibilityOf(widget).state !== 'hidden'
  })
  const arranged = arrangeWidgets(offered, data?.layout)

  const save = async (next: ArrangedWidget[]) => {
    if (!data) return
    const layout = layoutOf(next, data.layout)
    try {
      // Showing a widget needs its data, so refetch; hiding or moving one only needs the layout.
      const revealed = next.some((item) => !item.hidden && data.layout.hidden.includes(item.id))
      await mutate(async (current) => {
        const saved = await adminHomeApi.saveLayout(orgId, layout, token)
        return revealed ? adminHomeApi.get(orgId, token) : current ? { ...current, layout: saved } : current
      }, { optimisticData: { ...data, layout }, rollbackOnError: true, revalidate: false })
    } catch (failure: any) {
      toast.error(failure?.message || 'Could not save your Home layout.')
    }
  }

  const dismissGettingStarted = async () => {
    if (!data) return
    try {
      await mutate(async (current) => {
        await adminHomeApi.dismissGettingStarted(orgId, token)
        return current ? { ...current, getting_started: null } : current
      }, { optimisticData: { ...data, getting_started: null }, rollbackOnError: true, revalidate: false })
    } catch (failure: any) {
      toast.error(failure?.message || 'Could not dismiss getting started.')
    }
  }

  const firstName = user?.first_name || user?.username || ''
  const start = data?.getting_started
  // Once a plan is out, Home leads with how it's going and the checklist moves to the side.
  const beside = !!start?.steps.find((step) => step.key === 'assign')?.done
  const today = new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })

  return (
    <div className="h-full w-full bg-[#f8f8f8]">
      <div className="mx-auto w-full max-w-[1400px] px-4 pb-10 pt-8 sm:px-10">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-gray-900">{greeting()}{firstName ? `, ${firstName}` : ''}</h1>
            <p className="mt-1 text-sm text-gray-500">{today}{org?.name ? ` · ${org.name}` : ''}</p>
          </div>
          {data && arranged.length ? <button type="button" aria-expanded={customizing} onClick={() => setCustomizing(!customizing)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3.5 py-2 text-xs font-semibold text-gray-700 nice-shadow hover:bg-gray-50">
            <SlidersHorizontal size={14} />{customizing ? 'Done' : 'Customize'}
          </button> : null}
        </div>

        {customizing ? <Customizer arranged={arranged} onChange={save} /> : null}

        <TrialBanner className="mb-4" />
        {start && !beside ? <GettingStarted data={start} orgslug={orgslug} onDismiss={dismissGettingStarted} /> : null}

        {error ? <p className="rounded-xl bg-white px-5 py-6 text-center text-sm text-gray-500 nice-shadow">Home couldn’t load. {error.message}</p>
          : !data ? <HomeSkeleton />
          : <div className={cn(beside && 'grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_340px]')}>
          <div className="grid grid-cols-1 gap-5 xl:grid-flow-row-dense xl:grid-cols-2">
            {arranged.filter((item) => !item.hidden).map(({ id }) => {
              const widget = ADMIN_HOME_WIDGETS.find((item) => item.id === id)!
              const visibility = visibilityOf(widget)
              const wide = WIDE.includes(id) ? 'xl:col-span-2' : ''
              if (visibility.state === 'locked') return <div key={id} className={wide}><LockedWidget title={widget.label} description={widget.description} request={visibility.request} /></div>
              const content = renderWidget(id, data, orgslug, widget.label)
              return content ? <div key={id} className={cn('min-w-0', wide)}>{content}</div> : null
            })}
          </div>
          {start && beside ? <GettingStarted side data={start} orgslug={orgslug} onDismiss={dismissGettingStarted} /> : null}
          </div>}
      </div>
    </div>
  )
}

function renderWidget(id: HomeWidgetId, data: AdminHomeData, orgslug: string, title: string): React.ReactNode {
  if (id === 'waiting' && data.waiting) return <WaitingWidget data={data.waiting} orgslug={orgslug} title={title} />
  if (id === 'today' && data.today) return <TodayWidget data={data.today} orgslug={orgslug} title={title} />
  if (id === 'messages' && data.messages) return <MessagesWidget data={data.messages} orgslug={orgslug} title={title} />
  if (id === 'attention' && data.attention) return <AttentionWidget data={data.attention} orgslug={orgslug} title={title} />
  if (id === 'creator' && data.creator) return <CreatorWidget data={data.creator} orgslug={orgslug} title={title} />
  return null
}

// eslint-disable-next-line no-unused-vars
function Customizer({ arranged, onChange }: { arranged: ArrangedWidget[]; onChange: (next: ArrangedWidget[]) => void }) {
  return (
    <section aria-label="Customize Home" className="mb-6 rounded-xl border border-gray-100 bg-white p-4 nice-shadow">
      <p className="mb-3 text-xs text-gray-500">Choose the widgets on your Home and their order. Only you see this, in this organization.</p>
      <ol className="divide-y divide-gray-100">
        {arranged.map((item, index) => {
          const widget = ADMIN_HOME_WIDGETS.find((entry) => entry.id === item.id)!
          return <li key={item.id} className="flex items-center gap-3 py-2">
            <label className="flex min-w-0 flex-1 items-center gap-3">
              <input type="checkbox" checked={!item.hidden} onChange={() => onChange(toggleWidget(arranged, item.id))} />
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-gray-900">{widget.label}</span>
                <span className="block truncate text-xs text-gray-500">{widget.description}</span>
              </span>
            </label>
            <button type="button" aria-label={`Move ${widget.label} up`} disabled={index === 0} onClick={() => onChange(moveWidget(arranged, item.id, -1))}
              className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 disabled:opacity-30"><ArrowUp size={14} /></button>
            <button type="button" aria-label={`Move ${widget.label} down`} disabled={index === arranged.length - 1} onClick={() => onChange(moveWidget(arranged, item.id, 1))}
              className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 disabled:opacity-30"><ArrowDown size={14} /></button>
          </li>
        })}
      </ol>
    </section>
  )
}

function HomeSkeleton() {
  return <div aria-hidden="true" className="grid grid-cols-1 gap-5 xl:grid-cols-2">
    {[0, 1, 2, 3].map((index) => <div key={index} className={cn('rounded-xl bg-white p-5 nice-shadow', index === 1 && 'xl:col-span-2')}>
      <Skeleton className="h-4 w-40 rounded-md" />
      <div className="mt-5 space-y-3">{[0, 1, 2].map((row) => <Skeleton key={row} className="h-9 w-full rounded-lg" />)}</div>
    </div>)}
  </div>
}
