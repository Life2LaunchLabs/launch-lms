'use client'
import Link from 'next/link'
import { useEffect } from 'react'
import useSWR from 'swr'
import PlatformShell from '@components/Admin/Platform/PlatformShell'
import { useOrg } from '@components/Contexts/OrgContext'
import { getConfig, getUriWithOrg } from '@services/config/config'
import { getUserAvatarMediaDirectory } from '@services/media/media'
import { demoRequest, type DemoMember, type DemoStatus } from '@services/demo/demo'

export function useDemoStudio() {
  const result = useSWR<DemoStatus>('demo-studio-status', () => demoRequest<DemoStatus>('status'), { revalidateOnFocus: true })
  const { mutate } = result
  useEffect(() => {
    const refresh = () => { void mutate() }
    window.addEventListener('demo-setup-changed', refresh)
    return () => window.removeEventListener('demo-setup-changed', refresh)
  }, [mutate])
  return result
}

export function useStudioHref() {
  const org = useOrg() as { slug?: string } | undefined
  return (path = '') => org?.slug ? getUriWithOrg(org.slug, `/admin/platform/demo${path}`) : `/admin/platform/demo${path}`
}

export function demoLink(handle?: string | null, tag?: string) {
  const host = getConfig('NEXT_PUBLIC_LAUNCHLMS_DEMO_HOST', 'demo.life2launch.app')
  const protocol = getConfig('NEXT_PUBLIC_LAUNCHLMS_HTTPS', 'true') === 'true' ? 'https' : 'http'
  const base = `${protocol}://${host}/demo${handle ? `/${handle}` : ''}`
  return tag ? `${base}?tag=${encodeURIComponent(tag)}` : base
}

export function MemberAvatar({ member, size = 36 }: { member: Pick<DemoMember, 'user_uuid' | 'avatar_image' | 'first_name' | 'last_name' | 'username'>; size?: number }) {
  const initials = `${member.first_name?.[0] || ''}${member.last_name?.[0] || ''}`.toUpperCase() || member.username[0]?.toUpperCase()
  const src = member.avatar_image ? getUserAvatarMediaDirectory(member.user_uuid, member.avatar_image) : null
  return src ? <img src={src} alt="" width={size} height={size} className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />
    : <span className="flex shrink-0 items-center justify-center rounded-full bg-indigo-100 font-semibold text-indigo-700" style={{ width: size, height: size, fontSize: size * 0.38 }}>{initials}</span>
}

const TABS = [['users', 'Demo users', ''], ['publish', 'Publish', '/publish'], ['settings', 'Limits & AI', '/settings']] as const

export default function StudioShell({ active, children, actions }: { active: 'users' | 'publish' | 'settings'; children: React.ReactNode; actions?: React.ReactNode }) {
  const { data, error } = useDemoStudio()
  const href = useStudioHref()
  let body = children
  if (error) body = <p role="alert" className="text-sm text-destructive">{(error as Error).message}</p>
  else if (!data) body = <p role="status" className="text-sm text-muted-foreground">Loading Demo Studio…</p>
  else if (data.mode !== 'operator') body = <p className="text-sm text-muted-foreground">{data.mode === 'admin' ? 'You are in setup mode. Use Back to Studio in the top bar to return.' : 'Platform admin access is required for Demo Studio.'}</p>
  return <PlatformShell title="Demo" activeSection="demo" actions={actions}>
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <nav aria-label="Demo Studio" className="flex gap-1 border-b">{TABS.map(([id, label, path]) => <Link key={id} href={href(path)} aria-current={active === id ? 'page' : undefined} className={`-mb-px border-b-2 px-3 py-2 text-sm font-semibold ${active === id ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>{label}</Link>)}</nav>
      {body}
    </div>
  </PlatformShell>
}

export function PublishStrip({ status, onPublishPage = false }: { status: DemoStatus; onPublishPage?: boolean }) {
  const href = useStudioHref()
  const changed = (status.members || []).filter((member) => member.changed).length
  const settings = status.settings
  return <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-card px-4 py-3 text-sm">
    {!status.checkpoint_id ? <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-800">Not published yet</span>
      : changed ? <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-800">{changed} set up since publishing</span>
        : <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-800">Up to date</span>}
    <span className="min-w-0">{status.published_at ? <>Visitors get the version published <b>{new Date(status.published_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</b>.</> : 'Visitors cannot start a demo until you publish.'}</span>
    {settings && !settings.enabled ? <span className="rounded-full border px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">New visits paused</span> : null}
    <span className="flex-1" />
    <span className="text-xs tabular-nums text-muted-foreground">{status.active_sessions ?? 0} of {settings?.capacity ?? 0} visitors</span>
    <a href={demoLink()} target="_blank" rel="noreferrer" className="text-xs font-semibold underline underline-offset-4">Open picker</a>
    {onPublishPage ? null : <Link href={href('/publish')} className="rounded-lg bg-foreground px-3 py-1.5 text-xs font-semibold text-background">Review & publish</Link>}
    {settings?.recapture_error ? <p role="alert" className="w-full text-xs text-destructive">The last automatic publish failed: {settings.recapture_error}</p> : null}
    {status.preparation_error ? <p role="alert" className="w-full text-xs text-destructive">Visitor workspaces for this version are failing to prepare: {status.preparation_error}</p> : null}
  </div>
}
