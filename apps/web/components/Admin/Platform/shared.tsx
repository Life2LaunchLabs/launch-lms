'use client'
import React, { useCallback, useEffect, useState } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import {
  CaretDown,
  CaretLeft,
  CaretRight,
  CaretUp,
  MagnifyingGlass,
  User,
  Buildings,
} from '@phosphor-icons/react'
import { getUserAvatarMediaDirectory, getOrgLogoMediaDirectory } from '@services/media/media'

// ============================================================================
// Media helpers
// ============================================================================

export function avatarUrl(userUuid: string, avatarImage: string): string {
  if (avatarImage.startsWith('http')) return avatarImage
  return getUserAvatarMediaDirectory(userUuid, avatarImage)
}

export function orgLogoUrl(orgUuid: string, logoImage: string): string {
  if (logoImage.startsWith('http')) return logoImage
  return getOrgLogoMediaDirectory(orgUuid, logoImage)
}

export function UserAvatar({
  userUuid,
  avatarImage,
  size = 32,
}: {
  userUuid: string
  avatarImage?: string | null
  size?: number
}) {
  if (avatarImage) {
    return (
      <img
        src={avatarUrl(userUuid, avatarImage)}
        alt=""
        className="rounded-full object-cover bg-gray-100 shrink-0"
        style={{ width: size, height: size }}
        onError={(e) => {
          ;(e.target as HTMLImageElement).style.display = 'none'
        }}
      />
    )
  }
  return (
    <div
      className="rounded-full bg-gray-100 flex items-center justify-center shrink-0"
      style={{ width: size, height: size }}
    >
      <User size={size * 0.45} weight="fill" className="text-gray-400" />
    </div>
  )
}

export function OrgLogo({
  orgUuid,
  logoImage,
  size = 32,
}: {
  orgUuid: string
  logoImage?: string | null
  size?: number
}) {
  if (logoImage) {
    return (
      <img
        src={orgLogoUrl(orgUuid, logoImage)}
        alt=""
        className="rounded-lg object-contain bg-gray-50 shrink-0"
        style={{ width: size, height: size }}
        onError={(e) => {
          ;(e.target as HTMLImageElement).style.display = 'none'
        }}
      />
    )
  }
  return (
    <div
      className="rounded-lg bg-gray-100 flex items-center justify-center shrink-0"
      style={{ width: size, height: size }}
    >
      <Buildings size={size * 0.5} weight="fill" className="text-gray-400" />
    </div>
  )
}

// ============================================================================
// URL-synced list state (search / sort / filters / page)
// ============================================================================

export function useListParams(defaults: Record<string, string>) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  const get = (key: string) => searchParams.get(key) ?? defaults[key] ?? ''

  const update = useCallback(
    (updates: Record<string, string | number>) => {
      const params = new URLSearchParams(searchParams.toString())
      for (const [key, value] of Object.entries(updates)) {
        const strVal = String(value)
        if (strVal === (defaults[key] ?? '') || strVal === '') {
          params.delete(key)
        } else {
          params.set(key, strVal)
        }
      }
      const qs = params.toString()
      router.replace(`${pathname}${qs ? `?${qs}` : ''}`, { scroll: false })
    },
    [searchParams, router, pathname, defaults]
  )

  return { get, update }
}

export function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

// ============================================================================
// Formatting
// ============================================================================

export function formatDate(value?: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  if (isNaN(date.getTime())) return '—'
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export function formatDateTime(value?: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  if (isNaN(date.getTime())) return '—'
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// ============================================================================
// Badges
// ============================================================================

const PLAN_STYLES: Record<string, string> = {
  free: 'bg-gray-100 text-gray-600',
  personal: 'bg-sky-50 text-sky-700',
  standard: 'bg-blue-50 text-blue-700',
  pro: 'bg-violet-50 text-violet-700',
  enterprise: 'bg-amber-50 text-amber-700',
}

export function PlanBadge({ plan }: { plan: string }) {
  return (
    <span
      className={`inline-flex text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded ${
        PLAN_STYLES[plan] || 'bg-gray-100 text-gray-600'
      }`}
    >
      {plan}
    </span>
  )
}

export function StatusBadge({
  children,
  tone = 'gray',
}: {
  children: React.ReactNode
  tone?: 'gray' | 'amber' | 'red' | 'green' | 'blue'
}) {
  const tones: Record<string, string> = {
    gray: 'bg-gray-100 text-gray-600',
    amber: 'bg-amber-50 text-amber-700',
    red: 'bg-red-50 text-red-700',
    green: 'bg-emerald-50 text-emerald-700',
    blue: 'bg-blue-50 text-blue-700',
  }
  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded ${tones[tone]}`}
    >
      {children}
    </span>
  )
}

// ============================================================================
// Table primitives
// ============================================================================

export function SortableTh({
  label,
  sortKey,
  currentSort,
  ascKey,
  descKey,
  onSort,
  className = '',
}: {
  label: string
  sortKey?: string // simple: one key toggles between asc/desc variants
  currentSort: string
  ascKey?: string
  descKey?: string
  onSort: (sort: string) => void
  className?: string
}) {
  const isSortable = Boolean(ascKey || descKey || sortKey)
  const activeAsc = currentSort === (ascKey ?? sortKey)
  const activeDesc = currentSort === descKey
  const isActive = activeAsc || activeDesc

  const handleClick = () => {
    if (!isSortable) return
    // Toggle: descKey first (most common intent), then ascKey
    if (descKey && ascKey) {
      onSort(activeDesc ? ascKey : descKey)
    } else if (sortKey) {
      onSort(sortKey)
    } else if (descKey) {
      onSort(descKey)
    } else if (ascKey) {
      onSort(ascKey)
    }
  }

  return (
    <th
      className={`px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider select-none ${
        isSortable ? 'cursor-pointer hover:text-gray-600' : ''
      } ${isActive ? 'text-gray-700' : ''} ${className}`}
      onClick={handleClick}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {isActive &&
          (activeDesc ? (
            <CaretDown size={10} weight="bold" />
          ) : (
            <CaretUp size={10} weight="bold" />
          ))}
      </span>
    </th>
  )
}

export function SearchInput({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (value: string) => void
  placeholder: string
}) {
  return (
    <div className="relative">
      <MagnifyingGlass
        size={14}
        className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400"
      />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="bg-white border border-gray-200 rounded-lg pl-8 pr-3 py-1.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-gray-400 w-64"
      />
    </div>
  )
}

export function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: { value: string; label: string }[]
  onChange: (value: string) => void
}) {
  return (
    <label className="inline-flex items-center gap-1.5 text-xs text-gray-500">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-white border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-800 focus:outline-none focus:border-gray-400"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}

export function Pagination({
  page,
  totalPages,
  onPageChange,
}: {
  page: number
  totalPages: number
  onPageChange: (page: number) => void
}) {
  if (totalPages <= 1) return null
  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
      <span className="text-xs text-gray-400">
        Page {page} of {totalPages}
      </span>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page === 1}
          className="p-1.5 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <CaretLeft size={14} weight="bold" />
        </button>
        {Array.from({ length: totalPages }, (_, i) => i + 1)
          .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
          .map((p, idx, arr) => (
            <React.Fragment key={p}>
              {idx > 0 && arr[idx - 1] !== p - 1 && (
                <span className="text-gray-300 text-xs px-1">...</span>
              )}
              <button
                onClick={() => onPageChange(p)}
                className={`text-xs min-w-[28px] h-7 rounded transition-colors ${
                  p === page
                    ? 'bg-gray-900 text-white'
                    : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
                }`}
              >
                {p}
              </button>
            </React.Fragment>
          ))}
        <button
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page === totalPages}
          className="p-1.5 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <CaretRight size={14} weight="bold" />
        </button>
      </div>
    </div>
  )
}

export function EmptyState({
  icon,
  message,
}: {
  icon: React.ReactNode
  message: string
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-gray-300">
      {icon}
      <p className="mt-3 text-sm text-gray-400">{message}</p>
    </div>
  )
}

export function LoadingRows() {
  return (
    <div className="flex items-center justify-center py-16">
      <div className="h-6 w-6 border-2 border-gray-200 border-t-gray-500 rounded-full animate-spin" />
    </div>
  )
}

export function StatCard({
  label,
  value,
  hint,
}: {
  label: string
  value: React.ReactNode
  hint?: string
}) {
  return (
    <div className="bg-white border border-gray-100 rounded-xl p-5 nice-shadow">
      <p className="text-[11px] text-gray-400 uppercase tracking-wider font-semibold">
        {label}
      </p>
      <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
      {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
    </div>
  )
}

export function Card({
  title,
  action,
  children,
  className = '',
}: {
  title?: string
  action?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={`bg-white border border-gray-100 rounded-xl nice-shadow ${className}`}>
      {(title || action) && (
        <div className="flex items-center justify-between px-5 pt-4 pb-1">
          {title && (
            <h3 className="text-sm font-semibold text-gray-700">{title}</h3>
          )}
          {action}
        </div>
      )}
      <div className="p-5 pt-3">{children}</div>
    </div>
  )
}
