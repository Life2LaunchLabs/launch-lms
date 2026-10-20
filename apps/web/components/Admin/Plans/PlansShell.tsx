'use client'

import React from 'react'
import { ArrowsDownUp, CaretDown, CaretUp } from '@phosphor-icons/react'
import { useTranslation } from 'react-i18next'
import AdminTabPage from '@components/Admin/AdminTabPage'
import { ADMIN_NAV_ICONS } from '@components/Admin/adminNavIcons'
import { Popover, PopoverContent, PopoverTrigger } from '@components/ui/popover'
import { useOrg } from '@components/Contexts/OrgContext'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { adminLabel, adminTab } from '@/lib/admin/registry'
import type { PlansTabId } from '@/lib/admin/plansTabs'
import { usePlansTabs } from './usePlansTabs'
import { usePlansTabCounts, type PlansTabCounts } from './usePlansTabCounts'

export type PlansShellProps = {
  /** The tab this page is. */
  active: PlansTabId
  /** Extra header actions, before the reorder button (most tab actions belong in the page's FilterBar instead). */
  actions?: React.ReactNode
  /** Numbers on tabs, over what `usePlansTabCounts` loads (e.g. `{ marketplace: { count: 2, label: '2 requests waiting' } }`). */
  counts?: PlansTabCounts
  children: React.ReactNode
}

const PLANS_PAGES = new Map((adminTab('plans').children || []).map((child) => [child.id, child]))

/**
 * Plans: Assignments, Templates, Badges, Requirements and Marketplace as tabs, in the viewer's
 * own order (saved for them, reordered with the arrows button), around one tab's page.
 */
export default function PlansShell({ active, actions, counts, children }: PlansShellProps) {
  const { t } = useTranslation()
  const org = useOrg() as { slug?: string } | null
  const orgslug = org?.slug || ''
  const tabs = usePlansTabs()
  const loaded = usePlansTabCounts()
  const shown = { ...loaded, ...counts }
  const label = (id: PlansTabId) => adminLabel(t, PLANS_PAGES.get(id) || { label: id })
  return (
    <AdminTabPage
      tab="plans"
      variant="underline"
      activeTab={active}
      tabs={tabs.order.map((id) => {
        const Icon = ADMIN_NAV_ICONS[id]
        return {
          id,
          label: label(id),
          icon: <Icon size={16} />,
          href: getUriWithOrg(orgslug, routePaths.org.admin.plans(id)),
          count: shown[id]?.count,
          countLabel: shown[id]?.label,
        }
      })}
      actions={<>{actions}<ReorderTabs tabs={tabs} labelOf={label} /></>}
    >
      {children}
    </AdminTabPage>
  )
}

/* eslint-disable no-unused-vars -- parameter names in a type document the callback */
type LabelOf = (id: PlansTabId) => string
/* eslint-enable no-unused-vars */

/** The arrows button: each tab with up and down buttons, and Reset to the org's default order. */
function ReorderTabs({ tabs, labelOf }: { tabs: ReturnType<typeof usePlansTabs>; labelOf: LabelOf }) {
  const [open, setOpen] = React.useState(false)
  const last = tabs.order.length - 1
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" aria-label="Reorder tabs" title="Reorder tabs" className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-gray-600 transition-colors hover:bg-gray-100 hover:text-black data-[state=open]:bg-gray-100 data-[state=open]:text-black">
          <ArrowsDownUp size={18} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" aria-label="Reorder tabs" className="w-[min(300px,calc(100vw-32px))] rounded-2xl border-gray-200 bg-white p-3 text-black shadow-xl">
        <p className="px-1 pb-1 text-xs font-semibold text-gray-500">Reorder tabs to fit how you work</p>
        <ol>
          {tabs.order.map((id, index) => {
            const Icon = ADMIN_NAV_ICONS[id]
            const label = labelOf(id)
            return (
              <li key={id} className="flex min-h-[42px] items-center gap-2 rounded-lg pl-2 pr-1">
                <Icon size={16} className="shrink-0 text-gray-400" aria-hidden="true" />
                <span className="flex-1 text-sm font-medium">{label}</span>
                <MoveButton label={`Move ${label} up`} disabled={index === 0} onClick={() => tabs.move(id, -1)}><CaretUp size={16} weight="bold" /></MoveButton>
                <MoveButton label={`Move ${label} down`} disabled={index === last} onClick={() => tabs.move(id, 1)}><CaretDown size={16} weight="bold" /></MoveButton>
              </li>
            )
          })}
        </ol>
        <div className="mt-2 flex items-center justify-between gap-2 border-t border-gray-100 px-1 pt-3">
          <button type="button" onClick={() => void tabs.reset()} disabled={!tabs.saved} className="text-sm font-semibold text-violet-700 underline underline-offset-2 disabled:cursor-default disabled:text-gray-400 disabled:no-underline">Reset to default</button>
          <span className="text-xs text-gray-500">Saved for you</span>
        </div>
      </PopoverContent>
    </Popover>
  )
}

function MoveButton({ label, disabled, onClick, children }: { label: string; disabled: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick} className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100 hover:text-black disabled:cursor-default disabled:text-gray-300 disabled:hover:bg-transparent">
      {children}
    </button>
  )
}
