import type { TimeEntry, Issue } from '../types'

/**
 * Format a Date as local YYYY-MM-DD string
 */
export function toLocalDateStr(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export interface CalendarDay {
  date: Date
  day: number
  isCurrentMonth: boolean
  dateStr: string
}

export interface IssueBreakdown {
  issue: Issue
  totalSeconds: number
}

export interface TimeEntryWithIssue extends TimeEntry {
  issue: Issue
}

/**
 * Calculate daily totals from time entries
 */
export function calculateDailyTotals(
  entries: TimeEntryWithIssue[],
  now: number = Date.now()
): Map<string, number> {
  const totals = new Map<string, number>()

  entries.forEach(entry => {
    const date = toLocalDateStr(new Date(entry.startedAt))
    const start = new Date(entry.startedAt).getTime()
    const end = entry.endedAt ? new Date(entry.endedAt).getTime() : now
    const seconds = (end - start) / 1000

    totals.set(date, (totals.get(date) || 0) + seconds)
  })

  return totals
}

/**
 * Calculate per-issue breakdown for each day
 */
export function calculateDailyIssueBreakdown(
  entries: TimeEntryWithIssue[],
  now: number = Date.now()
): Map<string, IssueBreakdown[]> {
  const breakdown = new Map<string, Map<number, IssueBreakdown>>()

  entries.forEach(entry => {
    const date = toLocalDateStr(new Date(entry.startedAt))
    const start = new Date(entry.startedAt).getTime()
    const end = entry.endedAt ? new Date(entry.endedAt).getTime() : now
    const seconds = (end - start) / 1000

    if (!breakdown.has(date)) {
      breakdown.set(date, new Map())
    }
    const dayMap = breakdown.get(date)!

    if (dayMap.has(entry.issueId)) {
      dayMap.get(entry.issueId)!.totalSeconds += seconds
    } else {
      dayMap.set(entry.issueId, {
        issue: entry.issue,
        totalSeconds: seconds
      })
    }
  })

  // Convert to array format sorted by total time
  const result = new Map<string, IssueBreakdown[]>()
  breakdown.forEach((dayMap, date) => {
    const issues = Array.from(dayMap.values()).sort((a, b) => b.totalSeconds - a.totalSeconds)
    result.set(date, issues)
  })

  return result
}

/**
 * Generate calendar weeks grid for a given month
 */
export function generateCalendarWeeks(year: number, month: number): CalendarDay[][] {
  const weeks: CalendarDay[][] = []
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)

  // Get the Monday of the week containing the first day
  const startDate = new Date(firstDay)
  const dayOfWeek = startDate.getDay()
  const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek // Adjust to Monday
  startDate.setDate(startDate.getDate() + diff)

  // Build weeks until we pass the last day of the month
  let currentWeek: CalendarDay[] = []

  while (startDate <= lastDay || currentWeek.length > 0) {
    const dateStr = toLocalDateStr(startDate)
    currentWeek.push({
      date: new Date(startDate),
      day: startDate.getDate(),
      isCurrentMonth: startDate.getMonth() === month,
      dateStr
    })

    if (currentWeek.length === 7) {
      weeks.push(currentWeek)
      currentWeek = []

      // Stop if we've completed a week that ends after the month
      if (startDate > lastDay) break
    }

    startDate.setDate(startDate.getDate() + 1)
  }

  return weeks
}

/**
 * Get CSS class for hours worked
 */
export function getHoursClass(seconds: number): string {
  if (seconds === 0) return ''
  const hours = seconds / 3600
  if (hours >= 8) return 'hours-great'
  if (hours >= 6) return 'hours-good'
  if (hours >= 4) return 'hours-ok'
  return 'hours-low'
}

/**
 * Check if a date string is today
 */
export function isToday(dateStr: string, now: Date = new Date()): boolean {
  return dateStr === toLocalDateStr(now)
}

/**
 * Check if a date is a weekend (Saturday or Sunday)
 */
export function isWeekend(date: Date): boolean {
  const day = date.getDay()
  return day === 0 || day === 6
}
