'use client'
import React, { useState } from 'react'
import { useOrg } from '@components/Contexts/OrgContext'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { usePlan } from '@components/Hooks/usePlan'
import { PLAN_LABELS, PLAN_HIERARCHY, planMeetsRequirement, type PlanLevel } from '@services/plans/plans'
import { submitPlanRequest, getOrgPlanRequests, type PlanRequest } from '@services/plans/plan_requests'
import useSWR from 'swr'
import {
  CheckCircle,
  ArrowCircleUp,
  Package,
  Sparkle,
  ChartBar,
  Certificate,
  UsersThree,
  ClockCountdown,
  Check,
  X,
  Hourglass,
} from '@phosphor-icons/react'

const PACKAGE_INFO: Record<string, { label: string; description: string; icon: React.ReactNode }> = {
  analytics: {
    label: 'Analytics',
    description: 'Detailed course analytics, learner progress reports, and engagement dashboards.',
    icon: <ChartBar size={20} weight="fill" />,
  },
  credentials: {
    label: 'Credentials',
    description: 'Issue OpenBadge-compliant digital certificates to course completers.',
    icon: <Certificate size={20} weight="fill" />,
  },
  ai: {
    label: 'AI Features',
    description: 'AI copilot, magic content blocks, and automated course planning.',
    icon: <Sparkle size={20} weight="fill" />,
  },
  advanced_user_management: {
    label: 'Advanced User Management',
    description: 'Custom roles, user groups, bulk access control, and API token management.',
    icon: <UsersThree size={20} weight="fill" />,
  },
}

const PLAN_FEATURES: Record<PlanLevel, string[]> = {
  free: ['Up to 5 courses', '1 collection', '1 admin seat', '5 GB storage', 'Basic course features'],
  full: [
    'Up to 20 courses',
    '5 collections',
    '3 admin seats',
    '20 GB storage',
    'Communities (1)',
    'Resource channels (1)',
    'Payments',
    'Collaboration',
    'Podcasts',
    'Add-on packages available',
  ],
  enterprise: [
    'Unlimited courses & collections',
    '20 admin seats',
    '100 GB storage',
    'All full features',
    'White-label subdomain',
    'Custom domains',
    'SEO configuration',
    'Boards & playgrounds',
    'Custom roles',
    'AI features included',
    'Analytics included',
    'Certifications included',
    'SSO',
    'Audit logs',
  ],
  master: ['Everything, unlimited', 'Platform management', 'No restrictions'],
}

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

interface OrgEditPlanProps {
  orgslug: string
}

export default function OrgEditPlan({ orgslug }: OrgEditPlanProps) {
  const org = useOrg() as any
  const session = useLHSession() as any
  const currentPlan = usePlan()
  const access_token = session?.data?.tokens?.access_token

  const [requestModal, setRequestModal] = useState<{
    type: 'plan_upgrade' | 'package_add'
    value: string
    label: string
  } | null>(null)
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [submitSuccess, setSubmitSuccess] = useState(false)

  const { data: planRequests, mutate: mutateRequests } = useSWR<PlanRequest[]>(
    access_token ? `plan-requests-${orgslug}` : null,
    () => getOrgPlanRequests(orgslug, access_token),
    { revalidateOnFocus: false }
  )

  const activePackages: string[] = org?.config?.config?.packages ?? []
  const isMaster = currentPlan === 'master'

  // Plans the org can request upgrade to
  const upgradablePlans = PLAN_HIERARCHY.filter(
    (p) => !planMeetsRequirement(currentPlan, p as PlanLevel) && p !== 'master'
  ) as PlanLevel[]

  async function handleSubmitRequest() {
    if (!requestModal) return
    setSubmitting(true)
    setSubmitError('')
    try {
      await submitPlanRequest(
        orgslug,
        requestModal.type,
        requestModal.value,
        message || null,
        access_token
      )
      setSubmitSuccess(true)
      setRequestModal(null)
      setMessage('')
      mutateRequests()
    } catch (e: any) {
      setSubmitError(e.message || 'Failed to submit request')
    } finally {
      setSubmitting(false)
    }
  }

  function hasPendingRequest(type: string, value: string) {
    return planRequests?.some(
      (r) => r.request_type === type && r.requested_value === value && r.status === 'pending'
    )
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-6 space-y-8">
      {/* Current plan */}
      <section>
        <h2 className="text-lg font-bold tracking-tight mb-3">Current Plan</h2>
        <div className="rounded-xl border border-black/10 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-2xl font-black tracking-tight">
                  {PLAN_LABELS[currentPlan] ?? currentPlan}
                </span>
                {isMaster && (
                  <span className="text-[10px] font-bold uppercase tracking-widest text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                    Platform Owner
                  </span>
                )}
              </div>
              <ul className="mt-3 space-y-1">
                {PLAN_FEATURES[currentPlan]?.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm text-gray-600">
                    <CheckCircle size={14} weight="fill" className="text-green-500 shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Active packages */}
      {planMeetsRequirement(currentPlan, 'full') && !isMaster && (
        <section>
          <h2 className="text-lg font-bold tracking-tight mb-3">Add-on Packages</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {Object.entries(PACKAGE_INFO).map(([id, info]) => {
              const isActive = activePackages.includes(id)
              const isPending = hasPendingRequest('package_add', id)
              return (
                <div
                  key={id}
                  className={`rounded-xl border p-4 ${
                    isActive
                      ? 'border-green-200 bg-green-50'
                      : 'border-black/10 bg-white'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`mt-0.5 ${isActive ? 'text-green-600' : 'text-gray-400'}`}>
                      {info.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm">{info.label}</span>
                        {isActive && (
                          <span className="text-[10px] font-bold uppercase tracking-wider text-green-700 bg-green-100 px-1.5 py-0.5 rounded">
                            Active
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">{info.description}</p>
                      {!isActive && (
                        <button
                          onClick={() => {
                            if (!isPending) {
                              setRequestModal({ type: 'package_add', value: id, label: info.label })
                              setSubmitSuccess(false)
                            }
                          }}
                          disabled={isPending}
                          className="mt-2 text-xs font-semibold text-blue-600 hover:text-blue-700 disabled:text-gray-400 disabled:cursor-not-allowed flex items-center gap-1"
                        >
                          {isPending ? (
                            <><ClockCountdown size={12} /> Request pending</>
                          ) : (
                            <><Package size={12} /> Request package</>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* Upgrade options */}
      {!isMaster && upgradablePlans.length > 0 && (
        <section>
          <h2 className="text-lg font-bold tracking-tight mb-3">Upgrade Plan</h2>
          <div className="space-y-3">
            {upgradablePlans.map((plan) => {
              const isPending = hasPendingRequest('plan_upgrade', plan)
              return (
                <div key={plan} className="rounded-xl border border-black/10 bg-white p-4 flex items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold">{PLAN_LABELS[plan]}</span>
                    </div>
                    <ul className="mt-2 space-y-1">
                      {PLAN_FEATURES[plan]?.slice(0, 5).map((f) => (
                        <li key={f} className="flex items-center gap-1.5 text-xs text-gray-500">
                          <CheckCircle size={12} weight="fill" className="text-green-400 shrink-0" />
                          {f}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <button
                    onClick={() => {
                      if (!isPending) {
                        setRequestModal({ type: 'plan_upgrade', value: plan, label: PLAN_LABELS[plan] })
                        setSubmitSuccess(false)
                      }
                    }}
                    disabled={isPending}
                    className="shrink-0 flex items-center gap-1.5 text-sm font-semibold bg-black text-white px-4 py-2 rounded-lg hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {isPending ? (
                      <><ClockCountdown size={14} /> Pending</>
                    ) : (
                      <><ArrowCircleUp size={14} /> Request Upgrade</>
                    )}
                  </button>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* Request history */}
      {planRequests && planRequests.length > 0 && (
        <section>
          <h2 className="text-lg font-bold tracking-tight mb-3">Request History</h2>
          <div className="rounded-xl border border-black/10 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-black/10">
                  <th className="text-left px-4 py-2.5 font-semibold text-gray-600">Type</th>
                  <th className="text-left px-4 py-2.5 font-semibold text-gray-600">Requested</th>
                  <th className="text-left px-4 py-2.5 font-semibold text-gray-600">Status</th>
                  <th className="text-left px-4 py-2.5 font-semibold text-gray-600">Date</th>
                </tr>
              </thead>
              <tbody>
                {planRequests.map((req) => (
                  <tr key={req.request_uuid} className="border-b border-black/5 last:border-0">
                    <td className="px-4 py-3 text-gray-500 capitalize">
                      {req.request_type === 'plan_upgrade' ? 'Plan Upgrade' : 'Package'}
                    </td>
                    <td className="px-4 py-3 font-medium">
                      {req.request_type === 'package_add'
                        ? (PACKAGE_INFO[req.requested_value]?.label ?? req.requested_value)
                        : (PLAN_LABELS[req.requested_value as PlanLevel] ?? req.requested_value)}
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={req.status} /></td>
                    <td className="px-4 py-3 text-gray-400 text-xs">
                      {new Date(req.creation_date).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {submitSuccess && (
        <div className="rounded-xl bg-green-50 border border-green-200 text-green-700 px-4 py-3 text-sm font-medium flex items-center gap-2">
          <CheckCircle size={16} weight="fill" />
          Your request has been submitted. We'll review it shortly.
        </div>
      )}

      {/* Request modal */}
      {requestModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <h3 className="text-lg font-bold">
              Request{' '}
              {requestModal.type === 'plan_upgrade' ? 'Plan Upgrade' : 'Package'}: {requestModal.label}
            </h3>
            <p className="text-sm text-gray-500">
              {requestModal.type === 'plan_upgrade'
                ? `You're requesting an upgrade to the ${requestModal.label} plan. Add an optional message below.`
                : `You're requesting the ${requestModal.label} package. Add an optional message below.`}
            </p>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Optional: tell us more about your needs..."
              className="w-full rounded-lg border border-black/15 px-3 py-2 text-sm resize-none h-24 focus:outline-none focus:ring-2 focus:ring-black/20"
            />
            {submitError && (
              <p className="text-sm text-red-600">{submitError}</p>
            )}
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => { setRequestModal(null); setMessage('') }}
                className="px-4 py-2 text-sm font-medium rounded-lg border border-black/15 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitRequest}
                disabled={submitting}
                className="px-4 py-2 text-sm font-semibold bg-black text-white rounded-lg hover:bg-gray-800 disabled:opacity-50 transition-colors"
              >
                {submitting ? 'Submitting...' : 'Submit Request'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
