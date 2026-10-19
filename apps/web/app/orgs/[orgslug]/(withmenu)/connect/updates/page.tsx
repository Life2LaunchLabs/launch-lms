import { redirect } from 'next/navigation'
import { getUriWithOrg, routePaths } from '@services/config/config'

/** Updates are now messages in the chat with whoever sent them. */
export default async function ConnectUpdatesPage({ params }: { params: Promise<{ orgslug: string }> }) {
  const { orgslug } = await params
  redirect(getUriWithOrg(orgslug, routePaths.org.connect()))
}
