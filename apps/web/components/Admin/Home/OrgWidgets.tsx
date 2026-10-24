'use client'
import React from 'react'
import { Award, Layers3 } from 'lucide-react'
import { chatTime } from '@components/Connect/ConnectView'
import { PersonAvatar } from '@components/Goals/share/PersonAvatar'
import { getUriWithOrg } from '@services/config/config'
import type { AdminHome, HomeCreator } from '@services/goals/adminHome'
import { homeLinks } from './links'
import { Chip, WidgetCard, WidgetEmpty, WidgetList, WidgetRow, plural } from './WidgetCard'

/** The viewer's latest chats in this org, as Connect lists them. */
export function MessagesWidget({ data, orgslug, title }: { data: NonNullable<AdminHome['messages']>; orgslug: string; title: string }) {
  return (
    <WidgetCard title={title} count={data.unread} more={{ href: getUriWithOrg(orgslug, homeLinks.messages()), label: 'Open Connect' }}>
      {data.chats.length ? <WidgetList>
        {data.chats.map((chat) => {
          const last = chat.last_message
          const sender = last?.sender?.name && !last.mine ? `${last.sender.name}: ` : last?.mine ? 'You: ' : ''
          return <WidgetRow key={chat.conversation_uuid} href={getUriWithOrg(orgslug, homeLinks.chat(chat.conversation_uuid))}
            lead={<PersonAvatar user={chat.people[0] as any} size="md" />}
            title={chat.title}
            detail={last ? `${sender}${last.preview || last.body}` : 'No messages yet'}
            trailing={<>
              {chat.unread ? <Chip tone="blue">{chat.unread} new</Chip> : null}
              <span className="w-14 text-right font-normal text-gray-400">{chatTime(chat.last_message_at)}</span>
            </>} />
        })}
      </WidgetList> : <WidgetEmpty>No messages in this organization yet.</WidgetEmpty>}
    </WidgetCard>
  )
}

function Stat({ value, label }: { value: number; label: string }) {
  return <div className="min-w-[96px]"><p className="text-2xl font-black text-gray-900">{value.toLocaleString()}</p><p className="text-xs text-gray-500">{label}</p></div>
}

/** How what the org makes is doing: plan starts and completions, badges awarded, and the latest edits. */
export function CreatorWidget({ data, orgslug, title }: { data: HomeCreator; orgslug: string; title: string }) {
  const { templates, badges } = data
  return (
    <WidgetCard title={title} more={{ href: getUriWithOrg(orgslug, homeLinks.templates()), label: 'Templates' }}>
      <div className="space-y-5 px-5 py-4">
        {templates.count ? <div>
          <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-500"><Layers3 size={13} />{plural(templates.count, 'plan template')}</p>
          <div className="flex flex-wrap gap-x-6 gap-y-3">
            <Stat value={templates.starts} label="started" />
            <Stat value={templates.recent_starts} label={`started, last ${data.recent_days} days`} />
            <Stat value={templates.completions} label="finished" />
            {templates.orgs_using ? <Stat value={templates.orgs_using} label="other orgs use them" /> : null}
          </div>
        </div> : null}
        {badges.count ? <div>
          <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-500"><Award size={13} />{plural(badges.count, 'badge')}</p>
          <div className="flex flex-wrap gap-x-6 gap-y-3">
            <Stat value={badges.starts} label="started" />
            <Stat value={badges.awards} label="awarded" />
            <Stat value={badges.recent_awards} label={`awarded, last ${data.recent_days} days`} />
          </div>
        </div> : null}
      </div>
      {data.recent_edits.length ? <>
        <p className="border-t border-gray-100 px-5 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-gray-500">Recently edited</p>
        <WidgetList>
          {data.recent_edits.map((item) => <WidgetRow key={`${item.kind}:${item.uuid}`} href={getUriWithOrg(orgslug, homeLinks.edit(item))}
            title={item.title} detail="Plan template"
            trailing={<Chip tone={item.status === 'draft' ? 'amber' : 'green'}>{item.status}</Chip>} />)}
        </WidgetList>
      </> : null}
    </WidgetCard>
  )
}
