import { expect, test } from 'bun:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ShelfSkeleton, channelShelves } from '@components/Discover/ResourceShelves'
import { CareersSkeleton, careersLoading } from '@components/Careers/DiscoverCareers'
import type { Resource, ResourceChannel } from '@services/resources/resources'

// FEED-697 / DEV-223: Discover flashed while it loaded. Shelves drew before the channel list arrived (unordered,
// with rows for channels the learner can't see), then re-sorted and dropped rows; careers inserted above them later.

const channel = (uuid: string, name = uuid) => ({ channel_uuid: uuid, name }) as ResourceChannel
const resource = (uuid: string, channels: ResourceChannel[]) => ({ resource_uuid: uuid, title: uuid, channels }) as unknown as Resource

const money = channel('money', 'Paying for school')
const jobs = channel('jobs', 'Finding work')
const hidden = channel('staff', 'Staff only')
const resources = [resource('a', [hidden, money]), resource('b', [jobs]), resource('c', [money, jobs])]

test('no shelves are drawn until the channel list is in, so nothing shows unordered and then re-sorts', () => {
  expect(channelShelves(resources, undefined)).toBe(null)
  expect(channelShelves(undefined, [money, jobs])).toBe(null)
})

test('once both lists are in, rows follow the organization order and skip channels the learner cannot see', () => {
  const shelves = channelShelves(resources, [jobs, money])!
  expect(shelves.map((row) => row.channel.channel_uuid)).toEqual(['jobs', 'money'])
  expect(shelves[0].items.map((item) => item.resource_uuid)).toEqual(['b', 'c'])
  expect(shelves[1].items.map((item) => item.resource_uuid)).toEqual(['a', 'c'])
})

test('careers hold their place only while a signed-in learner’s deck is on its way', () => {
  expect(careersLoading(true, undefined, undefined)).toBe(true)
  expect(careersLoading(true, { cards: [] }, undefined)).toBe(false)
  expect(careersLoading(true, undefined, new Error('down'))).toBe(false)
  expect(careersLoading(false, undefined, undefined)).toBe(false)
})

test('the placeholders are busy regions that take up room', () => {
  const shelf = renderToStaticMarkup(<ShelfSkeleton label="Loading resources" />)
  expect(shelf).toContain('aria-busy="true"')
  expect(shelf).toContain('width:256px')
  const careers = renderToStaticMarkup(<CareersSkeleton />)
  expect(careers).toContain('aria-busy="true"')
  expect(careers).toContain('h-[152px]')
  expect(careers).toContain('width:150px')
})
