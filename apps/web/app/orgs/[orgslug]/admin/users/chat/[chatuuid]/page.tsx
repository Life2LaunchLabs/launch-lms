import { redirect } from 'next/navigation'
import { routePaths } from '@services/config/config'

/** Chats in People became threads. */
export default function PeopleChatPage() {
  redirect(routePaths.org.admin.threads.root())
}
