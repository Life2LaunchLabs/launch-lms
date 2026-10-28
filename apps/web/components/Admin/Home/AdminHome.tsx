'use client'
import React from 'react'
import useSWR from 'swr'
import toast from 'react-hot-toast'
import { SlidersHorizontal, X } from 'lucide-react'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { useOrg } from '@components/Contexts/OrgContext'
import { PersonAvatar } from '@components/Goals/share/PersonAvatar'
import { TrialBanner } from '@components/Admin/Upgrade/PlanBanners'
import { Skeleton } from '@components/ui/skeleton'
import { personLabel } from '@services/assignments/status'
import {
  adminHomeApi, adminHomeKey, type AdminHome as AdminHomeData, type GlanceCard, type HomeAssignmentRow, type HomeDismissable, type HomeSectionId, type TickableStep,
} from '@services/goals/adminHome'
import { HOME_SECTIONS } from '@/lib/admin/registry'
import { cn } from '@/lib/utils'
import AssignmentBrief from './AssignmentBrief'
import FirstSteps from './FirstSteps'
import Glance from './Glance'
import { RequirementsWidget } from './OrgWidgets'
import { Continue, NeedsYou, YourAssignments } from './Sections'
import { WeekWidget } from './StaffWidgets'

function greeting(now = new Date()) {
  const hour = now.getHours()
  return hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
}

/**
 * Home: one page for everyone on staff, filled from what they can do and the assignments they're on.
 * A new member gets a welcome with their inviter's note; First steps stays in the middle until it's
 * dismissed; then Needs you, their assignments, Continue for builders, This week beside them and pinned
 * insight cards at the bottom. The API sends every section in one call; each person hides sections for themselves.
 */
export default function AdminHome({ orgslug }: { orgslug: string }) {
  const org = useOrg() as any
  const session = useLHSession() as any
  const token = session?.data?.tokens?.access_token
  const user = session?.data?.user
  const orgId = Number(org?.id)
  const { data, error, mutate } = useSWR<AdminHomeData>(orgId && token ? adminHomeKey(orgId) : null, () => adminHomeApi.get(orgId, token), { revalidateOnFocus: true })
  const [customizing, setCustomizing] = React.useState(false)
  const [brief, setBrief] = React.useState<HomeAssignmentRow | null>(null)

  const change = async (optimistic: Partial<AdminHomeData>, call: () => Promise<unknown>, refetch = false, failure = 'Could not save that.') => {
    if (!data) return
    try {
      await mutate(async (current) => {
        await call()
        return refetch ? adminHomeApi.get(orgId, token) : current ? { ...current, ...optimistic } : current
      }, { optimisticData: { ...data, ...optimistic }, rollbackOnError: true, revalidate: false })
    } catch (caught: any) {
      toast.error(caught?.message || failure)
    }
  }
  const dismiss = (what: HomeDismissable) => change(
    what === 'welcome' ? { welcome: null } : what === 'first_steps' ? { first_steps: null } : { needs: data?.needs && { ...data.needs, intro: false } },
    () => adminHomeApi.dismiss(orgId, what, token))
  const tick = (step: TickableStep) => { void adminHomeApi.tick(orgId, step, token).then(() => mutate()).catch(() => undefined) }
  // Showing a section needs its data, so refetch; hiding one only needs the list.
  const toggle = (id: HomeSectionId) => {
    if (!data) return
    const hidden = data.hidden.includes(id) ? data.hidden.filter((item) => item !== id) : [...data.hidden, id]
    void change({ hidden }, () => adminHomeApi.saveLayout(orgId, hidden, token), hidden.length < data.hidden.length, 'Could not save your Home.')
  }
  const unpin = (card: GlanceCard) => {
    if (!data?.glance) return
    const pins = data.glance.cards.filter((item) => item.source === 'pin' && item.key !== card.key)
      .map((item) => ({ dashboard_uuid: item.dashboard_uuid!, card_key: item.card.key, scope_key: item.scope.key }))
    void change({ glance: { ...data.glance, cards: data.glance.cards.filter((item) => item.key !== card.key) } }, () => adminHomeApi.savePins(orgId, pins, token), !pins.length)
  }
  const openBrief = () => {
    const focus = data?.first_steps?.kind === 'staff' ? data.first_steps.focus : null
    const rows = data?.assignments?.mine || []
    setBrief(rows.find((row) => row.assignment_uuid === focus?.assignment_uuid) || rows[0] || null)
  }

  const firstName = user?.first_name || user?.username || ''
  const shown = (id: HomeSectionId) => Boolean(data?.sections.includes(id) && !data.hidden.includes(id))
  const waiting = data?.needs?.total || 0
  // An admin's first days, before a plan is out, are about setting up.
  const settingUp = Boolean(data?.viewer.admin && data.first_steps && !data.assignments?.all?.length)
  const rail = data && ((shown('week') && data.week) || (shown('requirements') && data.requirements))

  return (
    <div className="h-full w-full bg-[#f8f8f8]">
      <div className="mx-auto w-full max-w-[1240px] px-4 pb-10 pt-8 sm:px-10">
        {data?.welcome ? <Welcome data={data} orgName={org?.name} firstName={firstName} onDismiss={() => void dismiss('welcome')} onCustomize={() => setCustomizing(!customizing)} customizing={customizing} />
          : <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-2xl font-bold text-gray-900">{greeting()}{firstName ? `, ${firstName}` : ''}</h1>
              <p className="mt-1 text-sm text-gray-500">{new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}{waiting ? <> · <b className="text-gray-900">{waiting} {waiting === 1 ? 'thing needs' : 'things need'}</b> you</> : null}</p>
            </div>
            {data?.sections.length ? <CustomizeButton open={customizing} onClick={() => setCustomizing(!customizing)} /> : null}
          </div>}

        {customizing && data ? <Customizer data={data} onToggle={toggle} orgName={org?.name} /> : null}
        <TrialBanner className="mb-4" />

        {error ? <p className="rounded-xl bg-white px-5 py-6 text-center text-sm text-gray-500 nice-shadow">Home couldn’t load. {error.message}</p>
          : !data ? <HomeSkeleton />
          : <div className="space-y-5">
            {data.first_steps ? <FirstSteps data={data.first_steps} orgslug={orgslug} onDismiss={() => void dismiss('first_steps')} onTick={tick} onBrief={openBrief} /> : null}
            <div className={cn('grid grid-cols-1 items-start gap-5', rail && 'xl:grid-cols-[minmax(0,1fr)_340px]')}>
              <div className="min-w-0 space-y-5">
                {settingUp ? <p className="py-2 text-center text-[13px] text-gray-500">Needs you, assignments and insights show up here once your first plan is out.</p> : <>
                  {shown('needs') && data.needs ? <NeedsYou data={data.needs} orgslug={orgslug} onDismissIntro={() => void dismiss('needs_intro')} /> : null}
                  {shown('assignments') && data.assignments ? <YourAssignments data={data.assignments} admin={data.viewer.admin} canRun={data.viewer.permissions.includes('run_assignments')} orgslug={orgslug} onOpen={setBrief} /> : null}
                  {shown('continue') && data.continue ? <Continue items={data.continue} orgslug={orgslug} /> : null}
                </>}
              </div>
              {rail ? <div className="min-w-0 space-y-5">
                {shown('week') && data.week ? <WeekWidget data={data.week} orgslug={orgslug} /> : null}
                {shown('requirements') && data.requirements ? <RequirementsWidget data={data.requirements} orgslug={orgslug} /> : null}
              </div> : null}
            </div>
            {!settingUp && shown('glance') && data.glance ? <Glance data={data.glance} orgslug={orgslug} onUnpin={unpin} /> : null}
          </div>}
      </div>
      <AssignmentBrief row={brief} orgslug={orgslug} onClose={() => setBrief(null)} />
    </div>
  )
}

function CustomizeButton({ open, onClick }: { open: boolean; onClick: () => void }) {
  return <button type="button" aria-expanded={open} onClick={onClick}
    className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-white px-3.5 py-2 text-xs font-semibold text-gray-700 nice-shadow hover:bg-gray-50">
    <SlidersHorizontal size={14} />{open ? 'Done' : 'Customize'}
  </button>
}

/** A new member's welcome: their inviter's note, which they can put away. */
function Welcome({ data, orgName, firstName, onDismiss, onCustomize, customizing }: {
  data: AdminHomeData; orgName?: string; firstName: string; onDismiss: () => void; onCustomize: () => void; customizing: boolean
}) {
  const note = data.welcome?.invitation
  return <section className="relative mb-6 overflow-hidden rounded-[22px] bg-[linear-gradient(120deg,#fde8dc,#e6eefc)] px-6 py-6 dark:bg-[linear-gradient(120deg,#3b2a20,#1d2a40)]">
    <div className="flex flex-wrap items-start gap-4 pr-9">
      <div className="min-w-0 basis-full sm:basis-0 sm:flex-1">
        <h1 className="text-[26px] font-extrabold tracking-tight text-gray-900">Welcome to {orgName}{firstName ? `, ${firstName}` : ''}</h1>
        {data.viewer.admin && !note ? <p className="mt-1.5 text-[15px] text-gray-700">Your organization is set up. Home fills in as you hand out plans.</p> : null}
      </div>
      {data.sections.length ? <CustomizeButton open={customizing} onClick={onCustomize} /> : null}
      <button type="button" onClick={onDismiss} aria-label={note ? 'Dismiss the welcome note' : 'Dismiss the welcome'} className="absolute right-4 top-4 rounded-md p-1.5 text-gray-500 hover:bg-white/70 hover:text-gray-800"><X size={16} /></button>
    </div>
    {note ? <div className="mt-4 flex max-w-[620px] items-start gap-2.5">
      <PersonAvatar user={note.from ? { ...note.from, name: personLabel(note.from) } as any : null} size="sm" />
      <p className="rounded-[4px_16px_16px_16px] bg-white px-3.5 py-2.5 text-sm leading-relaxed text-gray-800 shadow-sm">
        <small className="mb-0.5 block text-[11.5px] font-bold text-gray-500">{note.from ? personLabel(note.from) : 'Your admin'} · when they invited you</small>{note.note}
      </p>
    </div> : null}
  </section>
}

// eslint-disable-next-line no-unused-vars
function Customizer({ data, onToggle, orgName }: { data: AdminHomeData; onToggle: (id: HomeSectionId) => void; orgName?: string }) {
  return (
    <section aria-label="Customize Home" className="mb-6 rounded-xl border border-gray-100 bg-white p-4 nice-shadow">
      <p className="mb-3 text-xs text-gray-500">Pick what shows on your Home{orgName ? ` in ${orgName}` : ''}. Only you see this.</p>
      <ul className="grid gap-2 sm:grid-cols-2">
        {HOME_SECTIONS.filter((section) => data.sections.includes(section.id)).map((section) => <li key={section.id}>
          <label className="flex items-start gap-3 rounded-lg px-2 py-1.5 hover:bg-gray-50">
            <input type="checkbox" className="mt-1" checked={!data.hidden.includes(section.id)} onChange={() => onToggle(section.id)} />
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-gray-900">{section.label}</span>
              <span className="block text-xs text-gray-500">{section.description}</span>
            </span>
          </label>
        </li>)}
      </ul>
    </section>
  )
}

function HomeSkeleton() {
  return <div aria-hidden="true" className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
    {[0, 1].map((index) => <div key={index} className="rounded-xl bg-white p-5 nice-shadow">
      <Skeleton className="h-4 w-40 rounded-md" />
      <div className="mt-5 space-y-3">{[0, 1, 2].map((row) => <Skeleton key={row} className="h-9 w-full rounded-lg" />)}</div>
    </div>)}
  </div>
}
