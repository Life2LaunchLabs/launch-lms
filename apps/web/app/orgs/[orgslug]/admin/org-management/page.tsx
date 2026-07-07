import { redirect } from 'next/navigation'

// Host-relative path: the proxy rewrites external paths per-host, and building
// an absolute URL server-side falls back to 'localhost' when no env is set.
export default function LegacyOrgManagementPage() {
  redirect('/admin/platform/orgs')
}
