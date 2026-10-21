'use client'
import React, { useState } from 'react'
import { mutate as globalMutate } from 'swr'
import toast from 'react-hot-toast'
import { Check } from '@phosphor-icons/react'
import { getAPIUrl } from '@services/config/config'
import { updatePlatformOrgAccess } from '@services/platform/platform'
import { FEATURE_LABELS, PARTNER_LABELS, type OrgAccess } from '@services/plans/plans'
import { Card, TierBadge } from './shared'

const TIER_CHOICES = [
  { id: 'free', description: '25 active learners, 2 staff seats' },
  { id: 'full', description: '200 active learners, 12 staff, groups and bulk invites' },
  { id: 'enterprise', description: 'Unlimited, with SSO, audit logs, API tokens and advanced reports' },
]

// Features a superadmin may grant beyond the tier.
const GRANTABLE = ['groups', 'bulk_invites', 'advanced_reports', 'sso', 'audit_logs', 'api_tokens', 'payments']
const EXTRA_LIMITS = [
  { key: 'learners', label: 'Extra active learners' },
  { key: 'staff_seats', label: 'Extra staff seats' },
]

/** A superadmin sets an org's tier, partner programs and grants directly. */
export default function AccessTab({
  orgId,
  accessToken,
  access,
  config,
  onChanged,
}: {
  orgId: string
  accessToken: string
  access: OrgAccess | undefined
  config: any
  onChanged: () => void
}) {
  const initial = React.useMemo(() => ({
    tier: config?.tier || 'free',
    partners: [...(config?.partners || [])] as string[],
    grants: { ...(config?.grants || {}) } as Record<string, { enabled?: boolean; extra?: number }>,
  }), [config])
  const [draft, setDraft] = useState(initial)
  const [saving, setSaving] = useState(false)
  React.useEffect(() => setDraft(initial), [initial])
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial)

  const toggle = (list: string[], key: string) => (list.includes(key) ? list.filter((item) => item !== key) : [...list, key])
  const setGrant = (key: string, grant: { enabled?: boolean; extra?: number } | null) =>
    setDraft((current) => {
      const grants = { ...current.grants }
      if (grant) grants[key] = grant
      else delete grants[key]
      return { ...current, grants }
    })

  const handleSave = async () => {
    setSaving(true)
    const res = await updatePlatformOrgAccess(Number(orgId), draft, accessToken)
    setSaving(false)
    if (res.status === 200) {
      toast.success('Access updated')
      onChanged()
      globalMutate(`${getAPIUrl()}superadmin/organizations/${orgId}`)
    } else {
      toast.error(res.data?.detail || 'Failed to update access')
    }
  }

  return (
    <div className="space-y-6">
      {access?.owner && (
        <p className="text-sm text-gray-500">This is the owner organization: it has every feature and no limits, whatever is set here.</p>
      )}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {TIER_CHOICES.map((tier) => (
          <button
            key={tier.id}
            onClick={() => setDraft((current) => ({ ...current, tier: tier.id }))}
            className={`text-left p-4 rounded-xl border transition-all bg-white ${
              draft.tier === tier.id ? 'border-gray-900 nice-shadow' : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <TierBadge tier={tier.id} />
              {draft.tier === tier.id && <Check size={16} weight="bold" className="text-emerald-500" />}
            </div>
            <p className="text-xs text-gray-400 mt-1">{tier.description}</p>
          </button>
        ))}
      </div>

      <Card title="Partner programs">
        <div className="space-y-2">
          {Object.entries(PARTNER_LABELS).map(([key, label]) => (
            <label key={key} className="flex items-center gap-3 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={draft.partners.includes(key)}
                onChange={() => setDraft((current) => ({ ...current, partners: toggle(current.partners, key) }))}
              />
              {label}
            </label>
          ))}
        </div>
      </Card>

      <Card title="Grants">
        <div className="space-y-2">
          {GRANTABLE.map((key) => (
            <label key={key} className="flex items-center gap-3 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={draft.grants[key]?.enabled === true}
                onChange={(event) => setGrant(key, event.target.checked ? { enabled: true } : null)}
              />
              {FEATURE_LABELS[key] ?? key}
              {access?.features[key]?.enabled && !draft.grants[key]?.enabled && <span className="text-xs text-gray-400">(included now)</span>}
            </label>
          ))}
          {EXTRA_LIMITS.map((limit) => (
            <label key={limit.key} className="flex items-center gap-3 text-sm text-gray-700">
              <input
                type="number"
                min={0}
                value={draft.grants[limit.key]?.extra ?? 0}
                onChange={(event) => {
                  const extra = Math.max(0, Number(event.target.value) || 0)
                  setGrant(limit.key, extra ? { extra } : null)
                }}
                className="w-24 rounded-md border border-gray-200 px-2 py-1"
              />
              {limit.label}
              {access && <span className="text-xs text-gray-400">(limit now {access.limits[limit.key] || 'unlimited'})</span>}
            </label>
          ))}
        </div>
      </Card>

      {dirty && (
        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-gray-900 hover:bg-gray-700 text-white text-sm rounded-lg transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save access'}
          </button>
          <button onClick={() => setDraft(initial)} className="px-4 py-2 text-gray-400 hover:text-gray-600 text-sm transition-colors">
            Cancel
          </button>
        </div>
      )}
    </div>
  )
}
