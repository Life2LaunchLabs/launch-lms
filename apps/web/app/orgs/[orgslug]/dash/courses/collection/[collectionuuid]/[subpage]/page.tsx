'use client'
import { Breadcrumbs } from '@components/Objects/Breadcrumbs/Breadcrumbs'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { LucideIcon, Settings, BookCopy, BookOpen } from 'lucide-react'
import Link from 'next/link'
import React, { use } from 'react'
import { motion } from 'motion/react'
import { CollectionProvider, useCollection } from '@components/Contexts/CollectionContext'
import CollectionEditAccess from '@components/Dashboard/Pages/Collection/CollectionEditAccess'
import CollectionEditContent from '@components/Dashboard/Pages/Collection/CollectionEditContent'
import CollectionEditorHeader from '@components/Dashboard/Pages/Collection/CollectionEditorHeader'

export type CollectionParams = {
  subpage: string
  orgslug: string
  collectionuuid: string
}

interface TabItem {
  id: string
  label: string
  icon: LucideIcon
}

const SETTING_TABS: TabItem[] = [
  { id: 'courses', label: 'Courses', icon: BookCopy },
  { id: 'settings', label: 'Settings', icon: Settings },
]

function TabLink({
  tab,
  isActive,
  orgslug,
  collectionuuid,
}: {
  tab: TabItem
  isActive: boolean
  orgslug: string
  collectionuuid: string
}) {
  return (
    <Link href={getUriWithOrg(orgslug, routePaths.org.dash.collectionSettings(collectionuuid, tab.id))} replace>
      <div
        className={`py-2 w-fit text-center border-black transition-all ease-linear ${
          isActive ? 'border-b-4' : 'opacity-50'
        } cursor-pointer`}
      >
        <div className="flex items-center space-x-2.5 mx-2.5">
          <tab.icon size={16} />
          <div className="flex items-center">{tab.label}</div>
        </div>
      </div>
    </Link>
  )
}

const SETTINGS_ALIASES = new Set(['settings', 'general', 'thumbnail', 'access'])

function CollectionSettingsContent({ params }: { params: CollectionParams }) {
  const collectionState = useCollection()
  const collection = collectionState?.collection

  const activeSubpage = params.subpage === 'content' ? 'courses' : SETTINGS_ALIASES.has(params.subpage) ? 'settings' : params.subpage

  if (!collection) return null

  return (
    <div className="min-h-full w-full bg-[#f8f8f8]">
      <div className="pl-10 pr-10 tracking-tight bg-[#fcfbfc] z-10 nice-shadow relative">
        <div className="pt-6 pb-4">
          <Breadcrumbs items={[
            { label: 'Courses', href: routePaths.org.dash.courses(), icon: <BookOpen size={14} /> },
            { label: 'Collections', href: routePaths.org.dash.courses(), icon: <BookCopy size={14} /> },
            { label: collection.name },
          ]} />
        </div>
        <CollectionEditorHeader />
        <div className="flex space-x-0.5 font-black text-sm">
          {SETTING_TABS.map((tab) => (
            <TabLink
              key={tab.id}
              tab={tab}
              isActive={activeSubpage === tab.id}
              orgslug={params.orgslug}
              collectionuuid={params.collectionuuid}
            />
          ))}
        </div>
      </div>
      <div className="h-6"></div>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.1, type: 'spring', stiffness: 80 }}
      >
        {activeSubpage === 'settings' && <CollectionEditAccess />}
        {activeSubpage === 'courses' && <CollectionEditContent />}
      </motion.div>
    </div>
  )
}

function CollectionSettingsPage(props: { params: Promise<CollectionParams> }) {
  const params = use(props.params)

  return (
    <CollectionProvider collectionuuid={params.collectionuuid}>
      <CollectionSettingsContent params={params} />
    </CollectionProvider>
  )
}

export default CollectionSettingsPage
