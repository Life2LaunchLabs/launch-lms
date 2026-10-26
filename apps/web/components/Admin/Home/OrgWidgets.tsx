'use client'
import React from 'react'
import { ListChecks } from 'lucide-react'
import { getUriWithOrg } from '@services/config/config'
import type { HomeRequirements } from '@services/goals/adminHome'
import { homeLinks } from './links'
import { WidgetCard, WidgetList, WidgetRow, plural } from './WidgetCard'

/** Each requirement framework: learners tracked, how much they've met, and who met it all; each opens its Insights dashboard. */
export function RequirementsWidget({ data, orgslug }: { data: HomeRequirements; orgslug: string }) {
  return (
    <WidgetCard title="Requirements" more={{ href: getUriWithOrg(orgslug, homeLinks.insightsFramework()), label: 'Open Insights' }}>
      <WidgetList>
        {data.frameworks.map((framework) => {
          const percent = framework.progress === null ? null : Math.round(framework.progress * 100)
          return <WidgetRow key={framework.framework_uuid} href={getUriWithOrg(orgslug, homeLinks.insightsFramework(framework.framework_uuid))}
            lead={<span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-[#C9501E]"><ListChecks size={16} /></span>}
            title={framework.name}
            detail={framework.learners ? `${plural(framework.learners, 'learner')} tracked${framework.completed ? ` · ${framework.completed} met every requirement` : ''}` : 'No learners tracked yet. They’re tracked once a plan of theirs counts toward it.'}
            trailing={percent === null ? null : <span className="flex items-center gap-2">
              <span className="h-1.5 w-16 overflow-hidden rounded-full bg-gray-100"><i className="block h-full rounded-full bg-[#C9501E]" style={{ width: `${percent}%` }} /></span>
              <span className="w-9 text-right text-gray-700">{percent}%</span>
            </span>} />
        })}
      </WidgetList>
      {data.total > data.frameworks.length ? <p className="border-t border-gray-100 px-5 py-2.5 text-xs text-gray-500">{data.total - data.frameworks.length} more in Insights</p> : null}
    </WidgetCard>
  )
}
