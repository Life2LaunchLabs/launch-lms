'use client'

import { useState } from 'react'
import { FileText, Lock, Plus } from 'lucide-react'
import toast from 'react-hot-toast'

import { useLHSession } from '@components/Contexts/LHSessionContext'
import MediaPickerDialog from '@components/Objects/Media/MediaPickerDialog'
import { Button } from '@components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@components/ui/dropdown-menu'
import { getUriWithOrg } from '@services/config/config'
import { normalizeMediaUrl } from '@services/media/media'
import { getMyPortfolio } from '@services/portfolio/portfolio'
import { documents as documentsApi } from '@services/portfolio/records'
import { DetailHeader, Row } from './PortfolioDetail'
import { EmptyAdd } from './parts'
import type { PortfolioDocument, Shell } from '../portfolioTypes'

// My documents: files kept for yourself, like a saved résumé or what came with an import. Never shown to visitors.

const SOURCES: Record<string, string> = { manual: 'Uploaded', cis: 'From Oregon CIS', linkedin: 'From LinkedIn', resume: 'From your résumé' }

export function PortfolioDocumentsPage({ initialShell, orgslug }: { initialShell: Shell; orgslug: string }) {
  const session = useLHSession() as any
  const token = session?.data?.tokens?.access_token
  const [shell, setShell] = useState(initialShell)
  const [picking, setPicking] = useState(false)
  const items = shell.documents || []

  async function run(change: () => Promise<unknown>, failure: string) {
    if (!token) return
    try { await change(); setShell(await getMyPortfolio(token)) } catch (error: any) { toast.error(error?.message || failure) }
  }
  const rename = (item: PortfolioDocument) => { const title = window.prompt('Name', item.title)?.trim(); if (title && title !== item.title) run(() => documentsApi.update(item.document_uuid, { title }, token), 'Could not rename this') }
  const remove = (item: PortfolioDocument) => { if (window.confirm(`Remove ${item.title}?`)) run(() => documentsApi.remove(item.document_uuid, token), 'Could not remove this') }

  return <main className="min-h-screen bg-background pb-20 text-foreground" data-portfolio-v2="documents">
    <div className="mx-auto max-w-[960px] px-4 pt-4 sm:px-6 sm:pt-6">
      <DetailHeader href={getUriWithOrg(orgslug, '/portfolio')} owner color="sky" icon={FileText} title="My documents"><Button type="button" variant="brand" className="h-10" onClick={() => setPicking(true)}><Plus className="h-4 w-4" />Add</Button></DetailHeader>
      <p className="mb-4 flex items-center gap-2 px-2 text-[15px] text-muted-foreground"><Lock className="h-4 w-4 shrink-0" />Only you can see these. Keep a résumé, a transcript or what came with an import.</p>
      {items.length ? <ul className="grid grid-cols-[minmax(0,1fr)] gap-1">{items.map((item) => <Row key={item.document_uuid} href={item.url ? normalizeMediaUrl(item.url) : undefined} controls={<DropdownMenu><DropdownMenuTrigger asChild><Button type="button" variant="ghost" size="sm" className="relative z-[1]">More</Button></DropdownMenuTrigger><DropdownMenuContent align="end" className="w-40 rounded-2xl p-2"><DropdownMenuItem onSelect={() => rename(item)} className="rounded-xl px-3 py-2">Rename</DropdownMenuItem><DropdownMenuItem onSelect={() => remove(item)} className="rounded-xl px-3 py-2 text-red-600 focus:text-red-600">Remove</DropdownMenuItem></DropdownMenuContent></DropdownMenu>}>
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground"><FileText className="h-5 w-5" /></span>
        <span className="min-w-0"><b className="block truncate text-[15px] font-extrabold">{item.title}</b><small className="block truncate text-[13px] font-semibold text-muted-foreground">{[SOURCES[item.source] || item.source, item.filename, item.creation_date ? new Date(item.creation_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : ''].filter(Boolean).join(' · ')}</small></span>
      </Row>)}</ul> : <EmptyAdd title="Add a document" hint="A résumé, a transcript, a letter. Only you see it." onClick={() => setPicking(true)} />}
    </div>
    <MediaPickerDialog open={picking} onOpenChange={setPicking} title="Add a document" description="Upload a file or choose one from your media library. It stays private." owner={{ type: 'user', id: Number(shell.portfolio.user_id) }} mediaType="document" accessToken={token} onSave={async (asset) => { setPicking(false); await run(() => documentsApi.create({ title: asset.title || asset.filename || 'Document', kind: 'upload', media_asset_uuid: asset.asset_uuid }, token), 'Could not add this') }} />
  </main>
}
