'use client'

import { useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'

import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@components/ui/dropdown-menu'

type EndMode = 'none' | 'current' | 'date'

const inputClass = 'h-11 w-full rounded-md border border-input bg-background px-3 text-sm font-normal outline-none focus:ring-2 focus:ring-ring'

const months = Array.from({ length: 12 }, (_, index) => ({
  value: String(index + 1).padStart(2, '0'),
  label: new Date(2020, index).toLocaleString(undefined, { month: 'long' }),
}))

function MonthYearInput({ name, value, label }: { name: string; value?: string | null; label: string }) {
  const [initialYear = '', initialMonth = ''] = (value || '').split('-')
  const [year, setYear] = useState(initialYear)
  const [month, setMonth] = useState(initialMonth)
  const dateValue = year ? (month ? `${year}-${month}` : year) : ''

  return <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-2">
    <input type="hidden" name={name} value={dateValue} />
    <select aria-label={`${label} month`} value={month} onChange={(event) => setMonth(event.target.value)} className={inputClass}>
      <option value="">Month (optional)</option>
      {months.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
    </select>
    <input aria-label={`${label} year`} inputMode="numeric" type="number" min="1900" max="2200" placeholder="Year" value={year} onChange={(event) => setYear(event.target.value)} className={inputClass} />
  </div>
}

export function MonthDateRangeField({
  startDate,
  endDate,
  isCurrent = false,
  currentFieldName = 'is_current',
}: {
  startDate?: string | null
  endDate?: string | null
  isCurrent?: boolean
  currentFieldName?: string
}) {
  const [endMode, setEndMode] = useState<EndMode>(isCurrent ? 'current' : endDate ? 'date' : 'none')

  const menu = (change = false) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="inline-flex items-center gap-1 text-sm font-semibold text-muted-foreground hover:text-foreground">
          {change ? 'Change' : 'Add end date'}<ChevronDown className="h-3.5 w-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" style={{ zIndex: 'var(--z-modal-content)' }}>
        {change && <DropdownMenuItem onSelect={() => setEndMode('none')}>Remove</DropdownMenuItem>}
        {endMode !== 'current' && <DropdownMenuItem onSelect={() => setEndMode('current')}>Current</DropdownMenuItem>}
        {endMode !== 'date' && <DropdownMenuItem onSelect={() => setEndMode('date')}>Select date</DropdownMenuItem>}
      </DropdownMenuContent>
    </DropdownMenu>
  )

  return <div className="grid grid-cols-2 gap-4">
    <label className={`grid content-start text-sm font-semibold ${endMode === 'none' ? '' : 'gap-2'}`}>
      {endMode === 'none' ? <span className="sr-only">Start</span> : <span>Start</span>}
      <MonthYearInput name="start_date" value={startDate} label="Start" />
    </label>
    <div className={`grid content-start ${endMode === 'none' ? '' : 'gap-2'}`}>
      {endMode === 'none' ? <div className="flex h-11 items-center justify-start">{menu(false)}</div> : <div className="flex min-h-5 items-center justify-between gap-2 text-sm font-semibold"><span>End</span>{menu(true)}</div>}
      <input type="hidden" name={currentFieldName} value={endMode === 'current' ? 'true' : 'false'} />
      {endMode === 'date' && <MonthYearInput name="end_date" value={endDate} label="End" />}
      {endMode === 'current' && <div className="flex h-11 items-center"><span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1.5 text-sm font-semibold text-foreground"><Check className="h-3.5 w-3.5" />Current</span></div>}
    </div>
  </div>
}
