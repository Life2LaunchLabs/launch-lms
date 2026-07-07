'use client'
import React from 'react'
import { PenLine, Lock } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import PlanBadge from '@components/Dashboard/Shared/PlanRestricted/PlanBadge'
import { PlanLevel } from '@services/plans/plans'
import Image from 'next/image'
import lrnaiIcon from 'public/ai_icon.svg'
import { useOrg } from '@components/Contexts/OrgContext'

interface CourseCreationTypeSelectorProps {
  onSelectType: (type: 'scratch' | 'ai') => void
  currentPlan: PlanLevel
}

function CourseCreationTypeSelector({ onSelectType, currentPlan }: CourseCreationTypeSelectorProps) {
  const { t } = useTranslation()
  const org = useOrg() as any
  const rf = org?.config?.config?.resolved_features
  const canUseAI = rf?.ai?.enabled === true

  return (
    <div className="min-w-[450px] py-2">
      <div className="grid grid-cols-2 gap-4">
        {/* Start from scratch option */}
        <button
          onClick={() => onSelectType('scratch')}
          className="group flex flex-col items-center p-6 rounded-xl border-2 border-border bg-card hover:border-black hover:shadow-lg transition-all duration-200"
        >
          <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mb-4 group-hover:bg-muted transition-colors">
            <PenLine size={28} className="text-muted-foreground" />
          </div>
          <h3 className="font-semibold text-foreground mb-1">
            {t('courses.create.from_scratch')}
          </h3>
          <p className="text-sm text-muted-foreground text-center">
            {t('courses.create.from_scratch_description')}
          </p>
        </button>

        {/* Start with AI option */}
        <button
          onClick={() => canUseAI && onSelectType('ai')}
          disabled={!canUseAI}
          className={`group flex flex-col items-center p-6 rounded-xl border-2 transition-all duration-200 ${
            canUseAI
              ? 'border-border bg-card hover:border-purple-500 hover:shadow-lg cursor-pointer'
              : 'border-border bg-muted cursor-not-allowed opacity-60'
          }`}
        >
          <div className={`w-14 h-14 rounded-full flex items-center justify-center mb-4 transition-colors ${
            canUseAI
              ? 'rotating-gradient-bg'
              : 'bg-muted'
          }`}>
            {canUseAI ? (
              <Image
                src={lrnaiIcon}
                alt="AI"
                width={28}
                height={28}
                className="drop-shadow-md"
              />
            ) : (
              <Lock size={28} className="text-muted-foreground" />
            )}
          </div>
          <div className="flex items-center gap-2 mb-1">
            <h3 className={`font-semibold ${canUseAI ? 'text-foreground' : 'text-muted-foreground'}`}>
              {t('courses.create.with_ai')}
            </h3>
            <PlanBadge currentPlan={currentPlan} requiredPlan={(rf?.ai?.required_plan || 'full') as PlanLevel} size="sm" />
          </div>
          <p className={`text-sm text-center ${canUseAI ? 'text-muted-foreground' : 'text-muted-foreground'}`}>
            {t('courses.create.with_ai_description')}
          </p>
        </button>
      </div>
    </div>
  )
}

export default CourseCreationTypeSelector
