'use client'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown, Clock, Flame, TrendingUp } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@components/ui/dropdown-menu"
import { DiscussionSortBy } from '@services/communities/discussions'

interface SortDropdownProps {
  value: DiscussionSortBy
  onChange: (value: DiscussionSortBy) => void
}

export function SortDropdown({ value, onChange }: SortDropdownProps) {
  const { t } = useTranslation()

  const sortOptions = [
    { value: 'recent' as DiscussionSortBy, label: t('communities.discussion_list.latest_activity'), icon: Clock },
    { value: 'upvotes' as DiscussionSortBy, label: t('communities.discussion_list.top'), icon: TrendingUp },
    { value: 'hot' as DiscussionSortBy, label: t('communities.discussion_list.hot'), icon: Flame },
  ]

  const currentOption = sortOptions.find(opt => opt.value === value) || sortOptions[0]
  const CurrentIcon = currentOption.icon

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-1.5 px-3 py-2 h-8 text-xs bg-muted border border-border rounded-md hover:bg-muted transition-colors">
          <span className="text-muted-foreground">{t('communities.discussion_list.sort_by')}</span>
          <span className="font-medium text-muted-foreground">{currentOption.label}</span>
          <ChevronDown size={12} className="text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-40">
        {sortOptions.map((option) => {
          const Icon = option.icon
          return (
            <DropdownMenuItem
              key={option.value}
              onClick={() => onChange(option.value)}
              className={`flex items-center gap-2 text-sm ${value === option.value ? 'bg-muted text-foreground' : 'text-muted-foreground'}`}
            >
              <Icon size={14} />
              <span>{option.label}</span>
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export default SortDropdown
