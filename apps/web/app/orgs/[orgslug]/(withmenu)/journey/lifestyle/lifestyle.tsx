'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { ArrowLeft, Check, ImageIcon, Plus, X } from 'lucide-react'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { useOrg } from '@components/Contexts/OrgContext'
import { getUriWithOrg, routePaths } from '@services/config/config'
import {
  FrameworkNode,
  IdentityNodeDetail,
  getIdentityFramework,
  getIdentityNodeDetail,
  updateFrameworkProfile,
} from '@services/identity/identity'
import { Button } from '@components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@components/ui/tabs'
import { CompactEvidenceList, CompactInsightList, SuggestedCarousel } from '../identity/identity'

const CARD_ROTATIONS = ['-rotate-2', 'rotate-1', '-rotate-1', 'rotate-2', '-rotate-2']

type LifestyleOption = {
  key: string
  title: string
  description: string
  image: string
}

type PanelMode = 'about' | 'select' | 'standard'

const LIFESTYLE_OPTIONS: Record<string, LifestyleOption[]> = {
  'target_lifestyle.rhythms': [
    { key: 'structured', title: 'Structured & Predictable', description: 'You thrive with clear routines, known expectations, and dependable anchors for your days.', image: '/lifestyle_options/rhythms/structured.png' },
    { key: 'flexible', title: 'Flexible & Grounded', description: 'You like a steady center with room to adjust based on energy, context, and opportunity.', image: '/lifestyle_options/rhythms/flexible.png' },
    { key: 'dynamic', title: 'Dynamic & Fast-Moving', description: 'You feel alive with momentum, variety, quick turns, and a pace that keeps you engaged.', image: '/lifestyle_options/rhythms/dynamic.png' },
    { key: 'freeform', title: 'Freeform & Self-Directed', description: 'You prefer spacious autonomy, self-led flow, and fewer externally imposed routines.', image: '/lifestyle_options/rhythms/freeform.png' },
  ],
  'target_lifestyle.relationships': [
    { key: 'close-knit', title: 'Deep & Close-Knit', description: 'A smaller circle of high-trust relationships feels most nourishing and real.', image: '/lifestyle_options/relational/close-knit.png' },
    { key: 'community', title: 'Community Centered', description: 'You want belonging, shared spaces, mutual support, and people moving together.', image: '/lifestyle_options/relational/community.png' },
    { key: 'independent', title: 'Independent', description: 'You value strong connection without losing solitude, autonomy, and personal space.', image: '/lifestyle_options/relational/independent.png' },
    { key: 'expansive', title: 'Broad & Expansive', description: 'You enjoy a wide network, many perspectives, and a life full of different social worlds.', image: '/lifestyle_options/relational/expansive.png' },
  ],
  'target_lifestyle.environment': [
    { key: 'rooted', title: 'Rooted & Stable', description: 'A consistent home base, familiar places, and a strong sense of local grounding matter most.', image: '/lifestyle_options/environment/rooted.png' },
    { key: 'urban', title: 'Urban & Energetic', description: 'You are drawn to density, culture, movement, access, and the charge of city life.', image: '/lifestyle_options/environment/urban.png' },
    { key: 'nature', title: 'Grounded in Nature', description: 'Natural light, open air, land, water, and quiet help you feel regulated and connected.', image: '/lifestyle_options/environment/nature.png' },
    { key: 'mobile', title: 'Mobile & Exploratory', description: 'Movement, travel, new contexts, and flexible bases help your life stay fresh.', image: '/lifestyle_options/environment/mobile.png' },
  ],
  'target_lifestyle.purpose': [
    { key: 'mastery', title: 'Mastery & Achievement', description: 'Growth, excellence, skill, and meaningful progress give your life direction.', image: '/lifestyle_options/purpose/mastery.png' },
    { key: 'service', title: 'Service & Connection', description: 'Helping, caring, building trust, and making life better for others is central.', image: '/lifestyle_options/purpose/service.png' },
    { key: 'creativity', title: 'Creativity & Expression', description: 'Making, imagining, shaping ideas, and expressing what is inside you feels essential.', image: '/lifestyle_options/purpose/creativity.png' },
    { key: 'experience', title: 'Freedom & Experience', description: 'Choice, adventure, discovery, and lived richness are the heartbeat of purpose.', image: '/lifestyle_options/purpose/experience.png' },
  ],
  'target_lifestyle.health': [
    { key: 'performance', title: 'Performance & Optimization', description: 'You like measurable progress, high capacity, and habits that sharpen your edge.', image: '/lifestyle_options/health/performance.png' },
    { key: 'sustainability', title: 'Balance & Sustainability', description: 'You want wellbeing that is steady, realistic, and supportive across seasons.', image: '/lifestyle_options/health/sustainability.png' },
    { key: 'calm', title: 'Peace & Calm', description: 'A regulated nervous system, low friction, and emotional spaciousness are priorities.', image: '/lifestyle_options/health/calm.png' },
    { key: 'experiential', title: 'Embodied & Experiential', description: 'You connect to health through movement, sensation, play, and lived body awareness.', image: '/lifestyle_options/health/experiential.png' },
  ],
}

function lifestyleDetailKey(orgId?: number, nodeKey?: string | null, accessToken?: string) {
  return orgId && nodeKey && accessToken ? ['lifestyle-node-detail', orgId, nodeKey, accessToken] : null
}

function optionFor(nodeKey: string, optionKey?: string | null) {
  return LIFESTYLE_OPTIONS[nodeKey]?.find((option) => option.key === optionKey) || null
}

function flattenNodes(nodes: FrameworkNode[]) {
  const flat: FrameworkNode[] = []
  const visit = (node: FrameworkNode) => {
    flat.push(node)
    ;(node.children || []).forEach(visit)
  }
  nodes.forEach(visit)
  return flat
}

function LifestyleCard({
  node,
  index,
  orgId,
  accessToken,
  onSelect,
}: {
  node: FrameworkNode
  index: number
  orgId?: number
  accessToken?: string
  onSelect: (node: FrameworkNode, mode: PanelMode) => void
}) {
  const { data: detail } = useSWR(
    lifestyleDetailKey(orgId, node.key, accessToken),
    ([, targetOrgId, targetNodeKey, token]) => getIdentityNodeDetail(targetOrgId as number, targetNodeKey as string, token as string),
    { revalidateOnFocus: false }
  )
  const selectedOption = optionFor(node.key, detail?.profile?.selected_lifestyle_option_key)
  const isEmpty = !selectedOption

  return (
    <button
      type="button"
      onClick={() => onSelect(node, isEmpty ? 'about' : 'standard')}
      className="group aspect-square w-full p-3 text-left outline-hidden"
    >
      {isEmpty ? (
        <div className="flex h-full flex-col items-center justify-center rounded-lg border border-dashed border-gray-200 p-6 text-center transition group-hover:border-gray-300 group-hover:bg-white/60">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gray-100 text-gray-300">
            <ImageIcon className="h-7 w-7" />
          </div>
          <h2 className="mt-4 text-lg font-semibold tracking-tight text-gray-500">{node.title}</h2>
          <span className="mt-4 inline-flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-400 shadow-xs transition group-hover:text-gray-700">
            <Plus className="h-4 w-4" />
          </span>
        </div>
      ) : (
        <div
          className={`flex h-full flex-col rounded-sm border border-gray-200 bg-white p-3 shadow-lg transition duration-200 group-hover:-translate-y-1 group-hover:rotate-0 group-hover:shadow-xl ${CARD_ROTATIONS[index % CARD_ROTATIONS.length]}`}
        >
          <img src={selectedOption.image} alt="" className="min-h-0 flex-1 rounded-sm object-cover" />
          <div className="px-1 pb-1 pt-4">
            <h2 className="text-lg font-semibold tracking-tight text-gray-950">{selectedOption.title}</h2>
            <p className="mt-1 text-sm font-medium text-gray-500">{node.title}</p>
          </div>
        </div>
      )}
    </button>
  )
}

function LifestylePanel({
  node,
  detail,
  isLoading,
  mode,
  orgId,
  accessToken,
  onModeChange,
  onClose,
  onSaved,
  className,
  orgslug,
  orgUUID,
}: {
  node: FrameworkNode
  detail?: IdentityNodeDetail
  isLoading: boolean
  mode: PanelMode
  orgId?: number
  accessToken?: string
  onModeChange: (mode: PanelMode) => void
  onClose: () => void
  onSaved: () => void
  className?: string
  orgslug: string
  orgUUID?: string
}) {
  const options = LIFESTYLE_OPTIONS[node.key] || []
  const currentOption = optionFor(node.key, detail?.profile?.selected_lifestyle_option_key)
  const [pendingKey, setPendingKey] = useState(currentOption?.key || options[0]?.key || '')
  const pendingOption = optionFor(node.key, pendingKey)
  const [isSaving, setIsSaving] = useState(false)

  const saveSelection = async () => {
    if (!orgId || !accessToken || !pendingKey || isSaving) return
    setIsSaving(true)
    try {
      await updateFrameworkProfile(orgId, node.key, { selected_lifestyle_option_key: pendingKey }, accessToken)
      onSaved()
      onModeChange('standard')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <aside className={`pointer-events-auto z-max flex h-full min-h-0 flex-col rounded-t-xl border border-gray-200 bg-white shadow-[0_28px_80px_rgba(15,23,42,0.28)] ring-1 ring-black/5 lg:rounded-lg ${className || ''}`}>
      <div className="flex items-start justify-between gap-3 border-b border-gray-100 p-4">
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-400">Target Lifestyle</div>
          <h2 className="mt-1 truncate text-xl font-semibold tracking-tight text-gray-950">{node.title}</h2>
        </div>
        <button type="button" onClick={onClose} className="rounded-md p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700" aria-label="Close lifestyle details">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {isLoading ? (
          <div className="h-40 animate-pulse rounded-lg bg-gray-100" />
        ) : mode === 'about' ? (
          <div className="flex h-full flex-col">
            <div className="space-y-4">
              <p className="text-sm leading-6 text-gray-600">{node.description}</p>
              <p className="text-sm leading-6 text-gray-600">
                Choose the option that best represents what you are aiming for here. It is not a permanent label, just a useful snapshot of the lifestyle you want to design around.
              </p>
            </div>
            <Button type="button" className="mt-auto w-full" onClick={() => onModeChange('select')}>
              Next
            </Button>
          </div>
        ) : mode === 'select' ? (
          <div className="space-y-4">
            <p className="text-sm leading-6 text-gray-600">Pick the one that feels closest right now.</p>
            <div className="grid grid-cols-2 gap-3">
              {options.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => setPendingKey(option.key)}
                  className={`rounded-sm border bg-white p-2 text-left shadow-sm transition ${pendingKey === option.key ? 'border-gray-950 ring-2 ring-gray-950/10' : 'border-gray-200 hover:border-gray-300'}`}
                >
                  <img src={option.image} alt="" className="aspect-square w-full rounded-sm object-cover" />
                  <div className="mt-2 flex items-start gap-2">
                    <div className="min-w-0 flex-1 text-sm font-semibold leading-5 text-gray-950">{option.title}</div>
                    {pendingKey === option.key ? <Check className="h-4 w-4 shrink-0 text-gray-950" /> : null}
                  </div>
                </button>
              ))}
            </div>
            <Button type="button" className="w-full" onClick={saveSelection} disabled={!pendingKey || isSaving}>
              {isSaving ? 'Saving...' : 'Confirm choice'}
            </Button>
          </div>
        ) : (
          <div className="space-y-5">
            {currentOption ? (
              <section>
                <img src={currentOption.image} alt="" className="aspect-[4/3] w-full rounded-lg object-cover" />
                <div className="mt-3">
                  <h3 className="text-lg font-semibold tracking-tight text-gray-950">{currentOption.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-gray-600">{node.description}</p>
                  <p className="mt-3 text-sm leading-6 text-gray-600">{currentOption.description}</p>
                  <Button type="button" variant="outline" size="sm" className="mt-4" onClick={() => onModeChange('select')}>
                    Change
                  </Button>
                </div>
              </section>
            ) : null}

            <section>
              <div className="mb-2 flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-gray-950">Dive deeper</h3>
                <Button asChild variant="outline" size="sm" className="h-7 px-2 text-xs">
                  <Link href={getUriWithOrg(orgslug, `${routePaths.org.resources()}?q=${encodeURIComponent(node.title)}`)}>
                    Resources
                  </Link>
                </Button>
              </div>
              <SuggestedCarousel detail={detail} orgslug={orgslug} orgUUID={orgUUID} />
            </section>

            <Tabs defaultValue="insights" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="insights">Insights</TabsTrigger>
                <TabsTrigger value="evidence">Evidence</TabsTrigger>
              </TabsList>
              <TabsContent value="insights" className="mt-3">
                <CompactInsightList detail={detail} />
              </TabsContent>
              <TabsContent value="evidence" className="mt-3">
                <CompactEvidenceList detail={detail} />
              </TabsContent>
            </Tabs>
          </div>
        )}
      </div>
    </aside>
  )
}

export default function LifestyleClient({ orgslug }: { orgslug: string }) {
  const session = useLHSession() as any
  const org = useOrg() as any
  const accessToken = session?.data?.tokens?.access_token
  const orgId = org?.id
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [panelMode, setPanelMode] = useState<PanelMode>('about')
  const { data: roots = [], isLoading } = useSWR(
    orgId && accessToken ? ['life-framework-lifestyle', orgId, accessToken] : null,
    () => getIdentityFramework(orgId, accessToken),
    { revalidateOnFocus: false }
  )
  const nodes = useMemo(() => flattenNodes(roots), [roots])
  const lifestyleRoot = nodes.find((node) => node.key === 'target_lifestyle')
  const lifestyleNodes = lifestyleRoot?.children || []
  const selectedNode = nodes.find((node) => node.key === selectedKey)
  const { data: selectedDetail, isLoading: detailLoading, mutate: mutateSelectedDetail } = useSWR(
    lifestyleDetailKey(orgId, selectedKey, accessToken),
    ([, targetOrgId, targetNodeKey, token]) => getIdentityNodeDetail(targetOrgId as number, targetNodeKey as string, token as string),
    { revalidateOnFocus: false }
  )

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-6 text-gray-950 md:px-8 md:py-8">
      <div className="mx-auto max-w-5xl">
        <Link
          href={getUriWithOrg(orgslug, routePaths.org.journey())}
          className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-gray-500 transition hover:text-gray-950"
        >
          <ArrowLeft className="h-4 w-4" />
          Journey
        </Link>

        {isLoading ? (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="aspect-square animate-pulse rounded-lg bg-gray-100" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <section className="aspect-square rounded-lg border border-gray-200 bg-gray-950 p-6 text-white shadow-lg">
              <div className="flex h-full flex-col justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/50">Journey</p>
                  <h1 className="mt-2 text-3xl font-semibold tracking-tight">Target Lifestyle</h1>
                </div>
                <p className="text-sm leading-6 text-white/70">
                  Map the life you are designing toward, from your spaces and relationships to the rhythms that keep it sustainable.
                </p>
              </div>
            </section>

            {lifestyleNodes.map((node, index) => (
              <LifestyleCard
                key={node.key}
                node={node}
                index={index}
                orgId={orgId}
                accessToken={accessToken}
                onSelect={(item, mode) => {
                  setSelectedKey(item.key)
                  setPanelMode(mode)
                }}
              />
            ))}

            {!lifestyleRoot ? (
              <div className="aspect-square rounded-lg border border-dashed border-gray-200 bg-white p-6 text-sm text-gray-500">
                Target lifestyle is not available in the framework yet.
              </div>
            ) : null}
          </div>
        )}
      </div>

      {selectedNode ? (
        <div className="pointer-events-none fixed inset-0 z-max hidden lg:block">
          <LifestylePanel
            key={selectedNode.key}
            node={selectedNode}
            detail={selectedDetail}
            isLoading={detailLoading}
            mode={panelMode}
            orgId={orgId}
            accessToken={accessToken}
            onModeChange={setPanelMode}
            onClose={() => setSelectedKey(null)}
            onSaved={() => mutateSelectedDetail()}
            className="absolute bottom-8 right-8 top-8 w-[420px]"
            orgslug={orgslug}
            orgUUID={org?.org_uuid}
          />
        </div>
      ) : null}

      {selectedNode ? (
        <div className="fixed inset-0 z-max lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/10"
            aria-label="Close lifestyle details"
            onClick={() => setSelectedKey(null)}
          />
          <LifestylePanel
            key={selectedNode.key}
            node={selectedNode}
            detail={selectedDetail}
            isLoading={detailLoading}
            mode={panelMode}
            orgId={orgId}
            accessToken={accessToken}
            onModeChange={setPanelMode}
            onClose={() => setSelectedKey(null)}
            onSaved={() => mutateSelectedDetail()}
            className="absolute inset-x-3 bottom-3 h-[78vh] max-h-[78vh]"
            orgslug={orgslug}
            orgUUID={org?.org_uuid}
          />
        </div>
      ) : null}
    </main>
  )
}
