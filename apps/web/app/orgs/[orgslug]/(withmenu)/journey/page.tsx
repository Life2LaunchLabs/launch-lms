export const dynamic = 'force-dynamic'

import { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getServerSession } from '@/lib/auth/server'
import JourneyClient from './journey'

export const metadata: Metadata = {
  title: 'Journey',
}

export default async function JourneyPage(props: {
  params: Promise<{ orgslug: string }>
}) {
  const { orgslug } = await props.params
  const session = await getServerSession()

  if (!session) {
    redirect('/welcome')
  }

  const displayName =
    session?.user?.first_name || session?.user?.username || 'there'

  return <JourneyClient displayName={displayName} orgslug={orgslug} />
}
