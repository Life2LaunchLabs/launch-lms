'use client'

import React from 'react'
import { useFeatures } from '@components/Hooks/useFeatures'
import RequestAccessButton from '@components/Admin/RequestAccessButton'
import { FEATURE_LABELS, accessRequestLabel, tierLabel } from '@services/plans/plans'

interface FeatureGateProps {
  /** The org access feature the page needs (e.g. "sso", "payments"). */
  feature: string
  /** Icon shown on the locked screen. */
  icon?: React.ComponentType<{ className?: string; size?: number }>
  /** What the feature does, shown on the locked screen. */
  description: string
  children: React.ReactNode
  fullScreen?: boolean
}

/**
 * Renders the page when the org's access includes the feature. Otherwise shows what would
 * unlock it (a tier, partner program or feature request) with a button that files the request.
 */
export default function FeatureGate({ feature, icon: Icon, description, children, fullScreen = false }: FeatureGateProps) {
  const features = useFeatures()
  if (features.has(feature)) return <>{children}</>

  const label = FEATURE_LABELS[feature] ?? feature
  const request = features.unlockFor(feature)

  return (
    <div className={fullScreen ? 'flex items-center justify-center h-screen w-full p-6 bg-[#f8f8f8]' : 'sm:mx-10 mx-0'}>
      <div className={`rounded-xl nice-shadow overflow-hidden ${fullScreen ? 'w-full max-w-lg' : ''}`}>
        <div className="flex flex-col items-center justify-center py-16 px-6 text-center bg-gradient-to-b from-gray-50/80 via-white to-white">
          {Icon && (
            <div className="bg-white p-4 rounded-xl nice-shadow mb-6">
              <Icon className="w-8 h-8 text-gray-400" />
            </div>
          )}
          <h2 className="text-lg font-semibold text-gray-800 mb-2">
            {request ? `${label} needs the ${accessRequestLabel(request)}` : `${label} isn't available`}
          </h2>
          <p className="text-gray-500 max-w-md mx-auto mb-8 leading-relaxed">{description}</p>
          {request && <RequestAccessButton request={request} className="px-4 py-2 text-sm" />}
          <p className="mt-6 text-xs text-gray-400">
            Current tier: <span className="font-medium text-gray-500">{tierLabel(features.tier)}</span>
          </p>
        </div>
      </div>
    </div>
  )
}
