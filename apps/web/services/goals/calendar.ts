import type { EventConfig } from './types'

/**
 * An event step as a calendar event: what "Add to calendar" hands to Google Calendar or a
 * downloaded .ics file today, and what a calendar sync would push later. Times are the
 * learner's local wall-clock times, as the step stores them.
 */
export interface CalendarEvent {
  uid: string
  title: string
  details: string
  location: string
  /** YYYY-MM-DD */
  date: string
  /** HH:MM, or none for an all-day event. */
  start?: string
  end?: string
}

export function calendarEvent(step: { step_uuid: string; title: string; description?: string | null; config: EventConfig }): CalendarEvent | null {
  const { date, start_time, end_time, place, url } = step.config
  if (!date) return null
  return {
    uid: step.step_uuid, title: step.title, location: place || '',
    details: [step.description || '', url || ''].filter(Boolean).join('\n\n'),
    date: date.slice(0, 10), start: start_time?.slice(0, 5) || undefined, end: end_time?.slice(0, 5) || undefined,
  }
}

const compact = (date: string) => date.replace(/-/g, '')

function nextDay(date: string) {
  const day = new Date(`${date}T12:00:00Z`)
  day.setUTCDate(day.getUTCDate() + 1)
  return day.toISOString().slice(0, 10)
}

/** The event's start and end in calendar form: dates for all day, local times otherwise (an hour long without an end). */
function span(event: CalendarEvent): [string, string, boolean] {
  if (!event.start) return [compact(event.date), compact(nextDay(event.date)), true]
  const [hours, minutes] = event.start.split(':').map(Number)
  const end = event.end && event.end > event.start ? event.end : `${String(Math.min(23, hours + 1)).padStart(2, '0')}:${String(hours >= 23 ? 59 : minutes).padStart(2, '0')}`
  const at = (time: string) => `${compact(event.date)}T${time.replace(':', '')}00`
  return [at(event.start), at(end), false]
}

export function googleCalendarUrl(event: CalendarEvent) {
  const [start, end] = span(event)
  const params = new URLSearchParams({ action: 'TEMPLATE', text: event.title, dates: `${start}/${end}` })
  if (event.details) params.set('details', event.details)
  if (event.location) params.set('location', event.location)
  return `https://calendar.google.com/calendar/render?${params.toString()}`
}

const escape = (text: string) => text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')

export function icsFile(event: CalendarEvent, now = new Date()) {
  const [start, end, allDay] = span(event)
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Launch LMS//Goals//EN', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT',
    `UID:${event.uid}@launch-lms`, `DTSTAMP:${stamp}`,
    allDay ? `DTSTART;VALUE=DATE:${start}` : `DTSTART:${start}`, allDay ? `DTEND;VALUE=DATE:${end}` : `DTEND:${end}`,
    `SUMMARY:${escape(event.title)}`,
    ...(event.details ? [`DESCRIPTION:${escape(event.details)}`] : []),
    ...(event.location ? [`LOCATION:${escape(event.location)}`] : []),
    'END:VEVENT', 'END:VCALENDAR', '',
  ].join('\r\n')
}
