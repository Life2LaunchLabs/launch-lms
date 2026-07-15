import { redirect } from 'next/navigation'
import { getServerSession } from '@/lib/auth/server'
import { OwnerProfilePageClient } from '@components/Objects/Portfolio/ProfilePageClient'
import { getUser } from '@services/users/users'
import { getUriWithOrg } from '@services/config/config'

export default async function LegacyPortfolioPage({ params }: { params: Promise<{ orgslug: string }> }) { const { orgslug } = await params; const session = await getServerSession(); const token = session?.tokens?.access_token; const userId = session?.user?.id; if (!token || !userId) redirect(getUriWithOrg(orgslug, '/')); return <div><div className="border-b border-border bg-amber-50 px-4 py-3 text-center text-sm font-medium text-amber-950 dark:bg-amber-950 dark:text-amber-50">Legacy portfolio reference. New portfolio content is managed from the Portfolio builder.</div><div className="pointer-events-none"><OwnerProfilePageClient initialUser={await getUser(String(userId), token)} orgslug={orgslug} orgConfig={{}} orgId={0} collections={[]} /></div></div> }
