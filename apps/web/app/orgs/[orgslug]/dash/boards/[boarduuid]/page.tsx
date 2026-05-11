import { redirect } from 'next/navigation'
import { routePaths } from '@services/config/config.client'

async function BoardSettingsRedirectPage(props: any) {
  const params = await props.params
  redirect(routePaths.org.dash.boardSettings(params.boarduuid, 'general'))
}

export default BoardSettingsRedirectPage
