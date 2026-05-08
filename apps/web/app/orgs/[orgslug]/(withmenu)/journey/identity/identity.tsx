'use client'

import Link from 'next/link'
import useSWR from 'swr'
import { ArrowRight } from 'lucide-react'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { useOrg } from '@components/Contexts/OrgContext'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { FrameworkNode, getIdentityFramework } from '@services/identity/identity'

function stateLabel(state: string) {
  return state.split('_').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ')
}

function NodeCard({ node, orgslug }: { node: FrameworkNode; orgslug: string }) {
  return (
    <Link
      href={getUriWithOrg(orgslug, routePaths.org.journeyIdentityNode(node.key))}
      className="group block rounded-2xl border border-gray-200 bg-white p-4 shadow-sm transition hover:border-gray-300 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-gray-950">{node.title}</h3>
          {node.description ? (
            <p className="mt-2 line-clamp-2 text-sm leading-6 text-gray-500">{node.description}</p>
          ) : null}
        </div>
        <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-gray-400 transition group-hover:translate-x-0.5 group-hover:text-gray-700" />
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2 text-xs font-medium text-gray-500">
        <span className="rounded-full bg-gray-100 px-2.5 py-1">{stateLabel(node.development_state)}</span>
        <span>{node.evidence_count} evidence</span>
        <span>{node.insight_count} insights</span>
      </div>
    </Link>
  )
}

function NodeGroup({ node, orgslug }: { node: FrameworkNode; orgslug: string }) {
  if (['driver', 'system', 'skill'].includes(node.node_type)) {
    return <NodeCard node={node} orgslug={orgslug} />
  }

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-gray-500">{node.title}</h3>
        {node.description ? <p className="mt-1 text-sm leading-6 text-gray-500">{node.description}</p> : null}
      </div>
      <div className="space-y-3">
        {(node.children || []).map((child) => (
          <NodeGroup key={child.key} node={child} orgslug={orgslug} />
        ))}
      </div>
    </div>
  )
}

export default function IdentityClient({ orgslug }: { orgslug: string }) {
  const session = useLHSession() as any
  const org = useOrg() as any
  const accessToken = session?.data?.tokens?.access_token
  const orgId = org?.id
  const { data: roots = [], isLoading } = useSWR(
    orgId && accessToken ? ['identity-framework', orgId, accessToken] : null,
    () => getIdentityFramework(orgId, accessToken),
    { revalidateOnFocus: false }
  )
  const inner = roots.find((node) => node.key === 'inner_world')
  const outer = roots.find((node) => node.key === 'outer_world')
  const innerNodes = inner?.children || []
  const outerNodes = outer?.children || []

  return (
    <main className="min-h-screen bg-gray-50 px-5 py-8 md:px-8">
      <div className="mx-auto w-full max-w-(--breakpoint-xl)">
        <div className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Journey</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-gray-950">My Identity</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-gray-600">
            A working map of what you are learning about yourself through courses, resources, notes, and outcomes.
          </p>
        </div>

        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2">
            {[1, 2, 3, 4].map((item) => (
              <div key={item} className="h-40 animate-pulse rounded-2xl bg-white" />
            ))}
          </div>
        ) : (
          <div className="grid gap-8 lg:grid-cols-2">
            <section>
              <h2 className="mb-4 text-xl font-semibold text-gray-950">Inner World</h2>
              <div className="space-y-3">
                {(innerNodes.length ? innerNodes : inner ? [inner] : []).map((node) => (
                  <NodeGroup key={node.key} node={node} orgslug={orgslug} />
                ))}
              </div>
            </section>
            <section>
              <h2 className="mb-4 text-xl font-semibold text-gray-950">Outer World</h2>
              <div className="space-y-3">
                {(outerNodes.length ? outerNodes : outer ? [outer] : []).map((node) => (
                  <NodeGroup key={node.key} node={node} orgslug={orgslug} />
                ))}
              </div>
            </section>
          </div>
        )}
      </div>
    </main>
  )
}
