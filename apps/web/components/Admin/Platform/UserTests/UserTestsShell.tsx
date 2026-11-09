'use client'
import PlatformShell from '@components/Admin/Platform/PlatformShell'
import { useOrg } from '@components/Contexts/OrgContext'
import { getUriWithOrg, routePaths } from '@services/config/config'

export function useUserTestsHref() {
  const org = useOrg() as { slug?: string } | undefined
  return (cohortUuid?: string) => {
    const path = cohortUuid ? routePaths.owner.platform.userTestCohort(cohortUuid) : routePaths.owner.platform.userTests()
    return org?.slug ? getUriWithOrg(org.slug, path) : path
  }
}

export function formatWhen(iso: string | null | undefined) {
  if (!iso) return 'Never'
  return new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
}

export function StatusPill({ status }: { status: string }) {
  const tone = status === 'open' ? 'bg-emerald-100 text-emerald-800' : 'bg-muted text-muted-foreground'
  const label = status === 'open' ? 'Open' : status === 'expired' ? 'Expired' : 'Closed'
  return <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${tone}`}>{label}</span>
}

export default function UserTestsShell({ children, actions }: { children: React.ReactNode; actions?: React.ReactNode }) {
  return <PlatformShell title="User tests" activeSection="userTests" actions={actions}>
    <div className="mx-auto max-w-6xl space-y-6">{children}</div>
  </PlatformShell>
}
