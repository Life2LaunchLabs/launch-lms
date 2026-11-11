'use client'

import React from 'react'
import useSWR from 'swr'
import { Switch } from '@components/ui/switch'
import { membershipKeys, PERMISSION_NAMES, type StaffPermission, type StaffPermissionInfo } from '@services/organizations/membership'
import { swrFetcher } from '@services/utils/ts/requests'

/**
 * "What they can do": one switch per staff permission, named and explained the way Add staff shows them.
 * Used on a staff member's profile and on a staff invitation nobody has accepted yet. `onChange` gets the
 * whole new list, in the catalog's order.
 */
export default function StaffPermissionSwitches({ orgId, token, value, disabled, onChange }: {
  orgId: number
  token: string
  value: StaffPermission[]
  disabled?: boolean
  // eslint-disable-next-line no-unused-vars
  onChange: (next: StaffPermission[]) => void
}) {
  const { data: catalog } = useSWR<{ permissions: StaffPermissionInfo[] }>(orgId && token ? membershipKeys.staffPermissions(orgId) : null,
    (url: string) => swrFetcher(url, token), { revalidateOnFocus: false })
  const permissions = catalog?.permissions || []
  const toggle = (key: StaffPermission, checked: boolean) => {
    const on = new Set(value)
    if (checked) on.add(key)
    else on.delete(key)
    onChange(permissions.map((item) => item.key).filter((item) => on.has(item)))
  }

  return <fieldset className="space-y-2">
    <legend className="text-sm font-semibold text-foreground">What they can do</legend>
    <div className="divide-y divide-border rounded-xl border border-border">
      {permissions.map((item) => <label key={item.key} className="flex cursor-pointer items-center gap-3 px-4 py-3">
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-foreground">{PERMISSION_NAMES[item.key] || item.key}</span>
          <span className="block text-xs text-muted-foreground">{item.label}</span>
        </span>
        <Switch checked={value.includes(item.key)} disabled={disabled} onCheckedChange={(checked) => toggle(item.key, checked)} aria-label={PERMISSION_NAMES[item.key] || item.key} />
      </label>)}
      {!catalog && <div className="h-40 animate-pulse bg-muted/40" />}
    </div>
  </fieldset>
}
