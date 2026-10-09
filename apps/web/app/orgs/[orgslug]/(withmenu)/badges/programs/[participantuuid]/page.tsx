import { redirect } from 'next/navigation'
import { getUriWithOrg } from '@services/config/config'
import { getServerSession } from '@/lib/auth/server'
import { planningApi } from '@services/planning/planning'

export default async function ProgramPage({ params }: { params: Promise<{ orgslug: string; participantuuid: string }> }) {
  const { orgslug, participantuuid } = await params
  const token = (await getServerSession())?.tokens?.access_token
  if (token) {
    try {
      const plan = await planningApi.resolveLegacy(decodeURIComponent(participantuuid), token)
      redirect(getUriWithOrg(orgslug, `/plans/${encodeURIComponent(plan.slug)}`))
    } catch (error: any) {
      if (String(error?.digest || '').startsWith('NEXT_REDIRECT')) throw error
    }
  }
  redirect(getUriWithOrg(orgslug, '/plans'))
}
