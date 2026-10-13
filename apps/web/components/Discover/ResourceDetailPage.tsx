'use client'

import React from 'react'
import useSWR from 'swr'
import { ExternalLink, Loader2, Sparkles } from 'lucide-react'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { useHub } from '@components/Hub/HubContext'
import { ActiveResourceWorkspace, asAdvisorResource } from '@components/Hub/resources/HubResourceContext'
import ContentPageHeader from '@components/Objects/StyledElements/Headers/ContentPageHeader'
import GeneralWrapper from '@components/Objects/StyledElements/Wrappers/GeneralWrapper'
import ResourceTypeVisual from '@components/Resources/ResourceTypeVisual'
import { Button } from '@components/ui/button'
import { routePaths } from '@services/config/config'
import { getResource, saveResource } from '@services/resources/resources'
import { resourceImage } from './ResourceShelves'

/** A resource's own page in Discover: its cover, opening it, asking Hub about it, notes and reviews. */
export default function ResourceDetailPage({ orgslug, resourceUuid }: { orgslug: string; resourceUuid: string }) {
  const session = useLHSession() as any
  const hub = useHub()
  const token = session?.data?.tokens?.access_token
  const uuid = resourceUuid.startsWith('resource_') ? resourceUuid : `resource_${resourceUuid}`
  const { data: resource, error } = useSWR(session?.status === 'loading' ? null : ['discover-resource', uuid, token || 'public'], () => getResource(uuid, token))

  const open = async () => {
    if (!resource) return
    // Counting the open never stands in the way of opening it.
    if (token) await saveResource(resource.resource_uuid, { open_count_increment: 1 }, token).catch(() => undefined)
    window.open(resource.external_url, '_blank', 'noopener,noreferrer')
  }

  return <GeneralWrapper>
    <main className="flex flex-col gap-6 pb-16">
      <ContentPageHeader orgslug={orgslug} backLabel="Discover" backHref={routePaths.org.discover({ type: 'resources' })} compactBottomMargin />
      {error ? <p role="alert" className="rounded-2xl border-2 border-border bg-card p-6 text-sm">This resource isn’t available. It may have been removed or made private.</p>
        : !resource ? <div className="flex min-h-[40vh] items-center justify-center"><Loader2 className="animate-spin text-muted-foreground" /></div>
        : <>
          <div className="aspect-[16/7] max-h-72 w-full overflow-hidden rounded-3xl shadow-[0_6px_0_hsl(var(--edge))]">
            <ResourceTypeVisual type={resource.resource_type} title="" imageSrc={resourceImage(resource)} iconClassName="h-16 w-16" />
          </div>
          <div className="flex flex-wrap gap-3">
            <Button type="button" variant="brand" size="tall" onClick={() => void open()}><ExternalLink size={16} />Open resource</Button>
            {hub ? <Button type="button" variant="surface" size="tall" onClick={() => hub.attach(resource)}><Sparkles size={16} />Ask Hub about this</Button> : null}
          </div>
          <ActiveResourceWorkspace resource={asAdvisorResource(resource)} orgslug={orgslug} />
        </>}
    </main>
  </GeneralWrapper>
}
