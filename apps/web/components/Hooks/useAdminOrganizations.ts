'use client'
import useSWR from 'swr'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { getAPIUrl } from '@services/config/config'
import { swrFetcher } from '@services/utils/ts/requests'

export type AdminOrganization = { id: number; org_uuid: string; slug: string; name: string; logo_image?: string | null }

/** Every org whose dashboard the viewer can open (all orgs for superadmins). Shares its cache key with the profile menu. */
export function useAdminOrganizations(): { orgs: AdminOrganization[]; isLoading: boolean } {
  const session = useLHSession() as any
  const token = session?.data?.tokens?.access_token
  const { data, isLoading } = useSWR(
    token ? `${getAPIUrl()}orgs/user_admin/page/1/limit/100` : null,
    (url) => swrFetcher(url, token),
    { revalidateOnFocus: false }
  )
  return { orgs: Array.isArray(data) ? data : [], isLoading }
}
