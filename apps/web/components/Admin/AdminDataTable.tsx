'use client'

import React from 'react'
import { FilterSelect, SearchInput } from '@components/Admin/Platform/shared'

export type AdminDataTableFilter = {
  id: string
  label: string
  value: string
  options: { value: string; label: string }[]
  // eslint-disable-next-line no-unused-vars
  onChange: (value: string) => void
}

export default function AdminDataTable({
  search,
  filters = [],
  resultLabel,
  actions,
  children,
  className = '',
}: {
  // eslint-disable-next-line no-unused-vars
  search?: { value: string; onChange: (value: string) => void; placeholder: string }
  filters?: AdminDataTableFilter[]
  resultLabel?: React.ReactNode
  actions?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <section className={className}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          {search ? <SearchInput {...search} /> : null}
          {filters.map((filter) => (
            <FilterSelect
              key={filter.id}
              label={filter.label}
              value={filter.value}
              options={filter.options}
              onChange={filter.onChange}
            />
          ))}
        </div>
        <div className="flex items-center gap-3">
          {resultLabel ? <span className="text-xs text-gray-400">{resultLabel}</span> : null}
          {actions}
        </div>
      </div>
      <div className="overflow-hidden rounded-xl border border-gray-100 bg-white nice-shadow [&_table]:w-full [&_table]:text-left [&_thead_tr]:border-b [&_thead_tr]:border-gray-100 [&_thead_tr]:bg-gray-50/50 [&_th]:px-4 [&_th]:py-2.5 [&_th]:text-[11px] [&_th]:font-semibold [&_th]:uppercase [&_th]:tracking-wider [&_th]:text-gray-400 [&_tbody_tr]:border-b [&_tbody_tr]:border-gray-50 [&_tbody_tr]:transition-colors [&_tbody_tr:hover]:bg-gray-50/60 [&_td]:px-4 [&_td]:py-3">
        {children}
      </div>
    </section>
  )
}
