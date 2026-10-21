'use client'

import React from 'react'
import useSWR from 'swr'
import { Search } from 'lucide-react'
import { swrFetcher } from '@services/utils/ts/requests'
import { launchTemplatesUrl, type LaunchTemplate } from '@services/goals/launch'
import { findQuestionBlocks, questionAllowsNoAnswer } from '@components/Learning/schema'
import ChoiceOptions, { type ChoiceStyle } from './ChoiceOptions'

/**
 * What a player knows that option sources need: the goal the run belongs to. Players that
 * run inside a goal provide it; elsewhere sourced questions say they can't load.
 */
export const OptionSourceContext = React.createContext<{ goalUuid?: string; token?: string }>({})

const describe = (item: LaunchTemplate) => [
  item.stage_count ? `${item.stage_count} stage${item.stage_count === 1 ? '' : 's'}` : '', item.description,
].filter(Boolean).join(' · ')

/**
 * A choice question whose options come from a source. The first source is goal templates: the
 * top few ranked by the goal's wording, and "See more" to search the rest.
 */
export default function SourcedChoiceOptions({ source, selected, style, onToggle }: {
  source: { kind: string; limit?: number }; selected: string[]; style?: ChoiceStyle
  onToggle: (id: string) => void // eslint-disable-line no-unused-vars
}) {
  const { goalUuid, token } = React.useContext(OptionSourceContext)
  const limit = source.limit || 3
  const [searching, setSearching] = React.useState(false)
  const [query, setQuery] = React.useState('')
  const [picked, setPicked] = React.useState<LaunchTemplate[]>([])
  const top = useSWR(goalUuid && token ? launchTemplatesUrl(goalUuid, '', limit) : null, (url: string) => swrFetcher(url, token))
  const found = useSWR(searching && goalUuid && token ? launchTemplatesUrl(goalUuid, query.trim(), 20) : null, (url: string) => swrFetcher(url, token), { keepPreviousData: true })
  if (source.kind !== 'goal_templates' || !goalUuid) return <p className="mt-6 text-sm text-muted-foreground">These options aren&apos;t available here.</p>
  if (!top.data) return <div className="mt-6 h-24 animate-pulse rounded-2xl bg-muted" aria-label="Loading options" />

  const shown: LaunchTemplate[] = [...top.data.templates]
  for (const item of picked) if (!shown.some((option) => option.template_uuid === item.template_uuid)) shown.push(item)
  const options = shown.map((item) => ({ id: item.template_uuid, text: item.title, description: describe(item) }))
  if (!top.data.total) return <p className="mt-6 text-sm text-muted-foreground">No plans to start from yet. Start blank and shape it your way.</p>

  return <div>
    <ChoiceOptions options={options} selected={selected} multiple={false} style={style || 'cards'} onToggle={onToggle} />
    {top.data.total > limit && !searching ? <button type="button" onClick={() => setSearching(true)} className="mt-4 text-sm font-semibold text-[var(--org-primary-color)] hover:underline">See more</button> : null}
    {searching ? <div className="mt-5 space-y-2">
      <label className="flex items-center gap-2 rounded-xl border border-border bg-card px-3">
        <Search size={16} aria-hidden="true" className="text-muted-foreground" />
        <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search plans" aria-label="Search plans" className="h-11 min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none" />
      </label>
      <ul className="max-h-64 space-y-1 overflow-y-auto">
        {(found.data?.templates || []).filter((item: LaunchTemplate) => !shown.some((option) => option.template_uuid === item.template_uuid)).map((item: LaunchTemplate) => <li key={item.template_uuid}>
          <button type="button" onClick={() => { setPicked((current) => [...current, item]); if (!selected.includes(item.template_uuid)) onToggle(item.template_uuid) }}
            className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-muted">
            <span className="font-semibold text-foreground">{item.title}</span>
            {describe(item) ? <span className="block text-xs text-muted-foreground">{describe(item)}</span> : null}
          </button>
        </li>)}
        {found.data && !found.data.templates.length ? <li className="px-3 py-2 text-sm text-muted-foreground">No plans match that.</li> : null}
      </ul>
    </div> : null}
  </div>
}

/** A page whose questions can all be left blank, so Continue starts unlocked. */
export function allowsNoAnswer(page: any) {
  const blocks = page?.page_type === 'standard' ? findQuestionBlocks(page) : []
  return blocks.length > 0 && blocks.every(questionAllowsNoAnswer)
}
