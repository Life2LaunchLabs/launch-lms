import { notFound, redirect } from 'next/navigation'
import { getUriWithOrg, routePaths } from '@services/config/config'

const JOURNAL_CANVAS_IDS = ['identity', 'lifestyle', 'navigation'] as const

const ProfileJournalCanvasPage = async (props: { params: Promise<{ orgslug: string, canvasid: string }> }) => {
  const params = await props.params

  if (!JOURNAL_CANVAS_IDS.includes(params.canvasid as typeof JOURNAL_CANVAS_IDS[number])) {
    notFound()
  }

  redirect(getUriWithOrg(params.orgslug, routePaths.org.journal(params.canvasid)))
}

export default ProfileJournalCanvasPage
