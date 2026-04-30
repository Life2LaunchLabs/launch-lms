import dayjs from 'dayjs'
import type { Dayjs } from 'dayjs'

const TIMEZONE_PATTERN = /(Z|[+-]\d{2}:?\d{2})$/

export function parseAPIDate(date: string | null | undefined): Dayjs {
  if (!date) {
    return dayjs(date)
  }

  const normalizedDate = date.trim()
  const hasExplicitTimezone = TIMEZONE_PATTERN.test(normalizedDate)

  return dayjs(hasExplicitTimezone ? normalizedDate : `${normalizedDate}Z`)
}
