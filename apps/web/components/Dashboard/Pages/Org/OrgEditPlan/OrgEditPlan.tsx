'use client'
import React from 'react'
import useSWR from 'swr'
import { useOrg } from '@components/Contexts/OrgContext'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { useFeatures } from '@components/Hooks/useFeatures'
import RequestAccessButton from '@components/Admin/RequestAccessButton'
import { getOrgPlanRequests, type PlanRequest } from '@services/plans/plan_requests'
import { getAccessCatalog, getOrgUsage, type LimitUsage } from '@services/plans/access'
import { FEATURE_LABELS, TIERS, accessRequestLabel, tierLabel, type AccessRequest } from '@services/plans/plans'
import { Check, CheckCircle, Hourglass, SealCheck, X } from '@phosphor-icons/react'

function StatusBadge({ status }: { status: string }) {
  if (status === 'approved') return (
    <span className="flex items-center gap-1 text-xs font-semibold text-green-600 bg-green-50 px-2 py-0.5 rounded-full border border-green-200">
      <Check size={12} weight="bold" /> Approved
    </span>
  )
  if (status === 'denied') return (
    <span className="flex items-center gap-1 text-xs font-semibold text-red-600 bg-red-50 px-2 py-0.5 rounded-full border border-red-200">
      <X size={12} weight="bold" /> Denied
    </span>
  )
  return (
    <span className="flex items-center gap-1 text-xs font-semibold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
      <Hourglass size={12} weight="fill" /> Pending
    </span>
  )
}

function Meter({ label, usage }: { label: string; usage?: LimitUsage }) {
  if (!usage) return null
  const unlimited = usage.limit === 'unlimited'
  const percent = unlimited ? 0 : Math.min(100, Math.round((usage.usage / Math.max(1, usage.limit as number)) * 100))
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-medium text-gray-700">{label}</span>
        <span className="text-gray-500">{usage.usage}{unlimited ? '' : ` of ${usage.limit}`}</span>
      </div>
      {!unlimited && (
        <div className="mt-1.5 h-1.5 rounded-full bg-gray-100 overflow-hidden">
          <div className={`h-full rounded-full ${usage.limit_reached ? 'bg-amber-500' : 'bg-gray-900'}`} style={{ width: `${percent}%` }} />
        </div>
      )}
    </div>
  )
}

/** The org's tier, its seats in use, and what it can request: a higher tier, a partner program or an on-request feature. */
export default function OrgEditPlan({ orgslug }: { orgslug: string }) {
  const org = useOrg() as any
  const session = useLHSession() as any
  const token = session?.data?.tokens?.access_token
  const features = useFeatures()
  const { access } = features

  const { data: catalog } = useSWR('access-catalog', getAccessCatalog, { revalidateOnFocus: false })
  const { data: usage } = useSWR(token && org?.id ? ['org-usage', org.id] : null, () => getOrgUsage(org.id, token), { revalidateOnFocus: false })
  const { data: requests } = useSWR<PlanRequest[]>(token ? `plan-requests-${orgslug}` : null, () => getOrgPlanRequests(orgslug, token), { revalidateOnFocus: false })

  const current = catalog?.tiers.find((tier) => tier.key === access.tier)
  const higher = catalog?.tiers.filter((tier) => TIERS.indexOf(tier.key) > TIERS.indexOf(access.tier)) || []
  const featureLabel = (key: string) => catalog?.features.find((feature) => feature.key === key)?.label ?? FEATURE_LABELS[key] ?? key
  const onRequest = catalog?.features.filter((feature) => feature.on_request) || []

  return (
    <div className="max-w-3xl mx-auto px-6 py-6 space-y-8">
      <section>
        <h2 className="text-lg font-bold tracking-tight mb-3">Current tier</h2>
        <div className="rounded-xl border border-black/10 bg-white p-5 shadow-sm space-y-4">
          <div className="text-2xl font-black tracking-tight">{tierLabel(access.tier)}</div>
          {access.owner && <p className="text-sm text-gray-500">This is the platform's owner organization, so it has every feature with no limits.</p>}
          <div className="grid gap-4 sm:grid-cols-2">
            <Meter label="Active learners" usage={usage?.limits.learners} />
            <Meter label="Staff seats" usage={usage?.limits.staff_seats} />
          </div>
          {current && current.features.length > 0 && (
            <ul className="space-y-1">
              {current.features.map((key) => (
                <li key={key} className="flex items-center gap-2 text-sm text-gray-600">
                  <CheckCircle size={14} weight="fill" className="text-green-500 shrink-0" />
                  {featureLabel(key)}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {!access.owner && higher.length > 0 && (
        <section>
          <h2 className="text-lg font-bold tracking-tight mb-3">Upgrade</h2>
          <div className="space-y-3">
            {higher.map((tier) => (
              <div key={tier.key} className="rounded-xl border border-black/10 bg-white p-4 flex items-start gap-4">
                <div className="flex-1 min-w-0">
                  <div className="font-bold">{tier.label}</div>
                  <p className="mt-1 text-xs text-gray-500">
                    {tier.limits.learners ? `${tier.limits.learners} active learners` : 'Unlimited learners'}
                    {' · '}
                    {tier.limits.staff_seats ? `${tier.limits.staff_seats} staff seats` : 'unlimited staff'}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">{tier.features.filter((key) => !current?.features.includes(key)).map(featureLabel).join(', ')}</p>
                </div>
                <RequestAccessButton request={{ type: 'tier_upgrade', value: tier.key }} className="px-3 py-1.5 text-xs" />
              </div>
            ))}
          </div>
        </section>
      )}

      {catalog && (
        <section>
          <h2 className="text-lg font-bold tracking-tight mb-1">Partner programs</h2>
          <p className="text-sm text-gray-500 mb-3">Programs open your work to learners and organizations beyond your own. Apply and we'll review it.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {catalog.partner_programs.map((program) => {
              const active = access.owner || access.partners.includes(program.key)
              return (
                <div key={program.key} className={`rounded-xl border p-4 ${active ? 'border-green-200 bg-green-50' : 'border-black/10 bg-white'}`}>
                  <div className="flex items-start gap-3">
                    <SealCheck size={20} weight="fill" className={`mt-0.5 ${active ? 'text-green-600' : 'text-gray-400'}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm">{program.label}</span>
                        {active && <span className="text-[10px] font-bold uppercase tracking-wider text-green-700 bg-green-100 px-1.5 py-0.5 rounded">Approved</span>}
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">{program.description}</p>
                      {!active && <RequestAccessButton request={{ type: 'partner_application', value: program.key }} className="mt-2 px-3 py-1 text-xs" />}
                    </div>
                  </div>
                </div>
              )
            })}
            {onRequest.map((feature) => {
              const active = features.has(feature.key)
              return (
                <div key={feature.key} className={`rounded-xl border p-4 ${active ? 'border-green-200 bg-green-50' : 'border-black/10 bg-white'}`}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm">{feature.label}</span>
                    {active && <span className="text-[10px] font-bold uppercase tracking-wider text-green-700 bg-green-100 px-1.5 py-0.5 rounded">On</span>}
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">Turned on per organization, on request.</p>
                  {!active && <RequestAccessButton request={{ type: 'feature_request', value: feature.key }} className="mt-2 px-3 py-1 text-xs" />}
                </div>
              )
            })}
          </div>
        </section>
      )}

      {requests && requests.length > 0 && (
        <section>
          <h2 className="text-lg font-bold tracking-tight mb-3">Requests</h2>
          <div className="rounded-xl border border-black/10 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-black/10">
                  <th className="text-left px-4 py-2.5 font-semibold text-gray-600">Requested</th>
                  <th className="text-left px-4 py-2.5 font-semibold text-gray-600">Status</th>
                  <th className="text-left px-4 py-2.5 font-semibold text-gray-600">Date</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((req) => (
                  <tr key={req.request_uuid} className="border-b border-black/5 last:border-0">
                    <td className="px-4 py-3 font-medium">{accessRequestLabel({ type: req.request_type, value: req.requested_value } as AccessRequest)}</td>
                    <td className="px-4 py-3"><StatusBadge status={req.status} /></td>
                    <td className="px-4 py-3 text-gray-400 text-xs">{new Date(req.creation_date).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}
