import React from 'react'
import Link from 'next/link'
import { Check } from 'lucide-react'
import type { BadgeCard, BadgeCollectionPage } from '@services/learning/badgeDiscover'
import { collectionHref } from '@components/Badges/discover/BadgeArt'

/** The creator's credibility statement and endorsers for a set of badges, from the collection's Marketing. */
export function Endorsements({ collection, trustLine, creator, orgslug, linkToSet = true }: { collection: BadgeCollectionPage | null; trustLine?: string; creator: BadgeCard['creator']; orgslug: string; linkToSet?: boolean }) {
  const statement = collection?.credibility || trustLine || ''
  const endorsers = collection?.endorsers || []
  if (!statement && !endorsers.length) return null
  return <section aria-label="Endorsements" className="flex flex-wrap items-center gap-7 rounded-[28px] border border-border bg-card px-7 py-8 sm:px-9">
    <div className="flex flex-[1_1_300px] flex-col gap-2">
      {collection && linkToSet ? <Link href={collectionHref(orgslug, collection.collection_uuid)} className="self-start text-[13px] font-black text-foreground no-underline">Part of {collection.name} →</Link>
        : <span className="text-xs font-black uppercase tracking-[.08em] text-muted-foreground">From {collection?.creator?.name || creator?.name || 'the creator'}</span>}
      {statement ? <p className="m-0 text-2xl font-bold leading-tight">“{statement}”</p> : null}
    </div>
    <div className="flex flex-[1_1_320px] flex-col gap-3">
      {endorsers.length ? <>
        <span className="text-xs font-black uppercase tracking-[.08em] text-muted-foreground">Endorsed by</span>
        <div className="flex flex-wrap gap-3">
          {endorsers.map((endorser) => {
            const body = endorser.logo_url ? <img src={endorser.logo_url} alt={endorser.name} className="max-h-10 max-w-[140px] object-contain" /> : endorser.name
            return endorser.url
              ? <a key={endorser.name} href={endorser.url} target="_blank" rel="noreferrer" className="inline-flex h-14 items-center rounded-2xl bg-muted px-5 font-black text-muted-foreground no-underline">{body}</a>
              : <span key={endorser.name} className="inline-flex h-14 items-center rounded-2xl bg-muted px-5 font-black text-muted-foreground">{body}</span>
          })}
        </div>
      </> : null}
      <span className="inline-flex items-center gap-1.5 text-sm font-black text-foreground"><Check size={16} strokeWidth={3} aria-hidden="true" />Verified badge you can share to LinkedIn and your portfolio</span>
    </div>
  </section>
}
