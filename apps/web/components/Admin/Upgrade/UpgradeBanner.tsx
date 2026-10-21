'use client'
import React from 'react'
import { useSWRConfig } from 'swr'
import toast from 'react-hot-toast'
import { Loader2, Sparkles, X } from 'lucide-react'
import { useOrg } from '@components/Contexts/OrgContext'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import RequestAccessButton from '@components/Admin/RequestAccessButton'
import { useFeatures } from '@components/Hooks/useFeatures'
import { startTrial } from '@services/plans/plan_requests'
import { cn } from '@/lib/utils'

// Only the org's admins (role 1) can start the trial or request a tier; staff see no upgrade prompts.
const OWNER_ADMIN_ROLE_ID = 1

export function useCanUpgrade() {
  const org = useOrg() as any
  const session = useLHSession() as any
  const membership = (session?.data?.roles || []).find((item: any) => String(item?.org?.id) === String(org?.id))
  const { access } = useFeatures()
  const admin = session?.data?.user?.is_superadmin === true || Number(membership?.role?.id) === OWNER_ADMIN_ROLE_ID
  return admin && !access.owner
}

/** A dismissed banner stays dismissed for this viewer in this browser. Dismissing is a convenience, so storage failures just show it again. */
export function useDismissed(key: string): [boolean, () => void] {
  const org = useOrg() as any
  const storageKey = `upgrade-banner:${org?.slug || ''}:${key}`
  const [dismissed, setDismissed] = React.useState(true)
  React.useEffect(() => {
    try { setDismissed(window.localStorage.getItem(storageKey) === '1') } catch { setDismissed(false) }
  }, [storageKey])
  const dismiss = () => {
    setDismissed(true)
    try { window.localStorage.setItem(storageKey, '1') } catch { /* shown again next visit */ }
  }
  return [dismissed, dismiss]
}

/** Start the Full trial when the org can, otherwise request Full. */
export function UpgradeAction({ className }: { className?: string }) {
  const org = useOrg() as any
  const session = useLHSession() as any
  const token = session?.data?.tokens?.access_token
  const { access } = useFeatures()
  const { mutate } = useSWRConfig()
  const [starting, setStarting] = React.useState(false)

  if (!access.trial_available) {
    return <RequestAccessButton request={{ type: 'tier_upgrade', value: 'full' }} className={cn('rounded-lg px-3.5 py-2 text-sm', className)} />
  }
  const begin = async () => {
    setStarting(true)
    try {
      await startTrial(org.slug, token)
      // The org (and its access) is cached under its slug URL; refetch it so every gate opens.
      await mutate((key) => Array.isArray(key) && String(key[0]).includes(`orgs/slug/${org.slug}`))
      toast.success('Your 30-day Full trial has started.')
    } catch (error: any) {
      toast.error(error?.message || 'Could not start the trial.')
    } finally {
      setStarting(false)
    }
  }
  return (
    <button type="button" onClick={begin} disabled={starting || !token}
      className={cn('inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-gray-900 px-3.5 py-2 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-60', className)}>
      {starting ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
      Try Full free for 30 days
    </button>
  )
}

/**
 * A prompt where a Free limit is felt: what Full adds here, and the one action that gets it.
 * Only admins see it, and it stays dismissed once closed.
 */
export default function UpgradeBanner({ id, title, children, action = <UpgradeAction />, className }: {
  id: string
  title: string
  children: React.ReactNode
  action?: React.ReactNode
  className?: string
}) {
  const canUpgrade = useCanUpgrade()
  const [dismissed, dismiss] = useDismissed(id)
  if (!canUpgrade || dismissed) return null
  return (
    <aside aria-label={title} className={cn('relative flex flex-wrap items-center gap-x-4 gap-y-3 rounded-xl border border-indigo-100 bg-indigo-50/70 py-3.5 pl-4 pr-10', className)}>
      <div className="min-w-0 flex-1 basis-64">
        <p className="text-sm font-semibold text-gray-900">{title}</p>
        <p className="mt-0.5 text-[13px] leading-5 text-gray-600">{children}</p>
      </div>
      {action}
      <button type="button" onClick={dismiss} aria-label={`Dismiss: ${title}`} title="Dismiss"
        className="absolute right-2 top-2 rounded-md p-1.5 text-gray-400 hover:bg-white hover:text-gray-700"><X size={15} /></button>
    </aside>
  )
}
