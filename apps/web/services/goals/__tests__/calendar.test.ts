import assert from 'node:assert/strict'
import test from 'node:test'
import { calendarEvent, googleCalendarUrl, icsFile } from '../calendar.ts'

const step = (config: Record<string, string | boolean>) => ({ step_uuid: 'step_1', title: 'Open day, Hall A; bring ID', description: 'Bring questions', config })

test('an event step without a day is not a calendar event yet', () => {
  assert.equal(calendarEvent(step({ place: 'Gym' })), null)
})

test('a timed event goes to Google Calendar in local time, an hour long without an end', () => {
  const event = calendarEvent(step({ date: '2026-11-03', start_time: '18:30:00', place: 'Gym', url: 'https://example.com' }))!
  const url = new URL(googleCalendarUrl(event))
  assert.equal(url.searchParams.get('dates'), '20261103T183000/20261103T193000')
  assert.equal(url.searchParams.get('location'), 'Gym')
  assert.equal(url.searchParams.get('details'), 'Bring questions\n\nhttps://example.com')
})

test('an all-day event ends the next day, and the .ics escapes its text', () => {
  const event = calendarEvent(step({ date: '2026-12-31' }))!
  assert.equal(new URL(googleCalendarUrl(event)).searchParams.get('dates'), '20261231/20270101')
  const ics = icsFile(event, new Date('2026-10-17T00:00:00Z'))
  assert.match(ics, /DTSTART;VALUE=DATE:20261231\r\nDTEND;VALUE=DATE:20270101/)
  assert.match(ics, /SUMMARY:Open day\\, Hall A\\; bring ID\r\n/)
  assert.match(ics, /UID:step_1@launch-lms\r\nDTSTAMP:20261017T000000Z/)
})

test('a set end time is kept', () => {
  const event = calendarEvent(step({ date: '2026-11-03', start_time: '09:00', end_time: '12:15' }))!
  assert.match(icsFile(event), /DTSTART:20261103T090000\r\nDTEND:20261103T121500/)
})
