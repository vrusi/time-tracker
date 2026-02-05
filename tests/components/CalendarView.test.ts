import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  calculateDailyTotals,
  calculateDailyIssueBreakdown,
  generateCalendarWeeks,
  getHoursClass,
  isToday,
  isWeekend,
  type TimeEntryWithIssue
} from '../../src/utils/calendar'

/**
 * Calendar View Logic - aggregates entries by day for calendar display.
 * Critical for accurate daily time reporting.
 */
describe('Calendar View Logic', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-01-15T12:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  const createEntry = (overrides: Partial<TimeEntryWithIssue>): TimeEntryWithIssue => ({
    id: 1,
    issueId: 1,
    startedAt: '2024-01-15T09:00:00.000Z',
    endedAt: '2024-01-15T10:00:00.000Z',
    pausedReason: null,
    notes: null,
    issue: { id: 1, externalId: '#1', name: 'Issue 1', link: null, notes: null, archived: false, createdAt: '2024-01-01' },
    ...overrides
  })

  describe('calculateDailyTotals', () => {
    it('aggregates entries by calendar date', () => {
      const entries = [
        createEntry({ id: 1, startedAt: '2024-01-15T09:00:00.000Z', endedAt: '2024-01-15T10:00:00.000Z' }),
        createEntry({ id: 2, startedAt: '2024-01-15T11:00:00.000Z', endedAt: '2024-01-15T12:00:00.000Z' }),
        createEntry({ id: 3, startedAt: '2024-01-16T09:00:00.000Z', endedAt: '2024-01-16T10:00:00.000Z' })
      ]

      const totals = calculateDailyTotals(entries)

      expect(totals.get('2024-01-15')).toBe(7200) // 2 hours
      expect(totals.get('2024-01-16')).toBe(3600) // 1 hour
    })

    it('uses provided timestamp for active entries', () => {
      const now = new Date('2024-01-15T10:00:00.000Z').getTime()
      const entries = [
        createEntry({ id: 1, startedAt: '2024-01-15T09:00:00.000Z', endedAt: null })
      ]

      const totals = calculateDailyTotals(entries, now)

      expect(totals.get('2024-01-15')).toBe(3600) // Exactly 1 hour
    })

    it('returns empty map for no entries', () => {
      expect(calculateDailyTotals([]).size).toBe(0)
    })
  })

  describe('calculateDailyIssueBreakdown', () => {
    it('groups entries by issue within each day, sorted by time', () => {
      const entries = [
        createEntry({ id: 1, issueId: 1, startedAt: '2024-01-15T09:00:00.000Z', endedAt: '2024-01-15T10:00:00.000Z',
          issue: { id: 1, externalId: '#1', name: 'Issue 1', link: null, notes: null, archived: false, createdAt: '2024-01-01' } }),
        createEntry({ id: 2, issueId: 2, startedAt: '2024-01-15T09:00:00.000Z', endedAt: '2024-01-15T12:00:00.000Z',
          issue: { id: 2, externalId: '#2', name: 'Issue 2', link: null, notes: null, archived: false, createdAt: '2024-01-01' } })
      ]

      const breakdown = calculateDailyIssueBreakdown(entries)
      const dayBreakdown = breakdown.get('2024-01-15')!

      expect(dayBreakdown).toHaveLength(2)
      // Sorted by time descending - Issue 2 (3h) before Issue 1 (1h)
      expect(dayBreakdown[0].issue.externalId).toBe('#2')
      expect(dayBreakdown[0].totalSeconds).toBe(10800) // 3 hours
      expect(dayBreakdown[1].issue.externalId).toBe('#1')
      expect(dayBreakdown[1].totalSeconds).toBe(3600) // 1 hour
    })
  })

  describe('generateCalendarWeeks', () => {
    it('generates 7-day weeks with correct days from current and adjacent months', () => {
      const weeks = generateCalendarWeeks(2024, 0) // January 2024

      // Each week should have 7 days
      weeks.forEach(week => expect(week).toHaveLength(7))

      // January 2024 starts on Monday, so first day should be the 1st
      expect(weeks[0][0].day).toBe(1)
      expect(weeks[0][0].isCurrentMonth).toBe(true)
    })

    it('includes previous month days when month starts mid-week', () => {
      // March 2024 starts on Friday
      const weeks = generateCalendarWeeks(2024, 2)

      // First week should have February days
      const prevMonthDays = weeks[0].filter(d => !d.isCurrentMonth)
      expect(prevMonthDays.length).toBeGreaterThan(0)
    })
  })

  describe('getHoursClass', () => {
    it('returns CSS class based on hours worked thresholds', () => {
      expect(getHoursClass(0)).toBe('')
      expect(getHoursClass(3600)).toBe('hours-low')    // 1h < 4h
      expect(getHoursClass(14400)).toBe('hours-ok')    // 4h
      expect(getHoursClass(21600)).toBe('hours-good')  // 6h
      expect(getHoursClass(28800)).toBe('hours-great') // 8h
    })
  })

  describe('date utilities', () => {
    it('correctly identifies today', () => {
      const today = new Date()
      expect(isToday('2024-01-15', today)).toBe(true)
      expect(isToday('2024-01-14', today)).toBe(false)
    })

    it('correctly identifies weekends', () => {
      expect(isWeekend(new Date(2024, 0, 6))).toBe(true)  // Saturday
      expect(isWeekend(new Date(2024, 0, 7))).toBe(true)  // Sunday
      expect(isWeekend(new Date(2024, 0, 8))).toBe(false) // Monday
    })
  })
})
