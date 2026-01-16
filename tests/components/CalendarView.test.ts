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
import { formatHours } from '../../src/utils/format'

/**
 * Tests for CalendarView component logic.
 * These tests verify the real utility functions used by the component.
 */
describe('CalendarView Logic', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-01-15T12:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('calculateDailyTotals', () => {
    it('aggregates entries by date', () => {
      const entries: TimeEntryWithIssue[] = [
        {
          id: 1, issueId: 1, startedAt: '2024-01-15T09:00:00.000Z', endedAt: '2024-01-15T10:00:00.000Z',
          pausedReason: null, notes: null,
          issue: { id: 1, externalId: '#1', name: 'Issue 1', link: null, notes: null, archived: false, createdAt: '2024-01-01' }
        },
        {
          id: 2, issueId: 1, startedAt: '2024-01-15T11:00:00.000Z', endedAt: '2024-01-15T12:00:00.000Z',
          pausedReason: null, notes: null,
          issue: { id: 1, externalId: '#1', name: 'Issue 1', link: null, notes: null, archived: false, createdAt: '2024-01-01' }
        },
        {
          id: 3, issueId: 1, startedAt: '2024-01-16T09:00:00.000Z', endedAt: '2024-01-16T10:00:00.000Z',
          pausedReason: null, notes: null,
          issue: { id: 1, externalId: '#1', name: 'Issue 1', link: null, notes: null, archived: false, createdAt: '2024-01-01' }
        }
      ]

      const totals = calculateDailyTotals(entries)

      expect(totals.get('2024-01-15')).toBe(7200) // 2 hours
      expect(totals.get('2024-01-16')).toBe(3600) // 1 hour
    })

    it('handles entries with no end time using provided now value', () => {
      const now = new Date('2024-01-15T10:00:00.000Z').getTime()
      const entries: TimeEntryWithIssue[] = [
        {
          id: 1, issueId: 1, startedAt: '2024-01-15T09:00:00.000Z', endedAt: null,
          pausedReason: null, notes: null,
          issue: { id: 1, externalId: '#1', name: 'Issue 1', link: null, notes: null, archived: false, createdAt: '2024-01-01' }
        }
      ]

      const totals = calculateDailyTotals(entries, now)

      expect(totals.get('2024-01-15')).toBe(3600) // Exactly 1 hour
    })

    it('handles entries spanning multiple hours', () => {
      const entries: TimeEntryWithIssue[] = [
        {
          id: 1, issueId: 1, startedAt: '2024-01-15T08:00:00.000Z', endedAt: '2024-01-15T17:00:00.000Z',
          pausedReason: null, notes: null,
          issue: { id: 1, externalId: '#1', name: 'Issue 1', link: null, notes: null, archived: false, createdAt: '2024-01-01' }
        }
      ]

      const totals = calculateDailyTotals(entries)

      expect(totals.get('2024-01-15')).toBe(32400) // 9 hours
    })

    it('returns empty map for empty entries', () => {
      const totals = calculateDailyTotals([])
      expect(totals.size).toBe(0)
    })
  })

  describe('generateCalendarWeeks', () => {
    it('generates correct week grid for months starting on Monday', () => {
      // January 2024 starts on Monday
      const weeks = generateCalendarWeeks(2024, 0) // January 2024

      expect(weeks.length).toBeGreaterThanOrEqual(4)
      expect(weeks[0][0].day).toBe(1) // First day is the 1st
      expect(weeks[0][0].isCurrentMonth).toBe(true)
    })

    it('generates correct week grid for months starting on Sunday', () => {
      // September 2024 starts on Sunday
      const weeks = generateCalendarWeeks(2024, 8) // September 2024

      expect(weeks.length).toBeGreaterThanOrEqual(4)
      // First row should include days from August (previous month)
      expect(weeks[0][0].isCurrentMonth).toBe(false)
      // The Sunday (September 1st) should be at the end of the first week
      expect(weeks[0][6].day).toBe(1)
      expect(weeks[0][6].isCurrentMonth).toBe(true)
    })

    it('includes days from adjacent months to fill weeks', () => {
      // March 2024 starts on Friday
      const weeks = generateCalendarWeeks(2024, 2) // March 2024

      // First week should have some February days
      const firstWeek = weeks[0]
      const prevMonthDays = firstWeek.filter(d => !d.isCurrentMonth)
      expect(prevMonthDays.length).toBeGreaterThan(0)
    })

    it('each week has exactly 7 days', () => {
      const weeks = generateCalendarWeeks(2024, 0) // January 2024

      weeks.forEach(week => {
        expect(week).toHaveLength(7)
      })
    })
  })

  describe('formatHours', () => {
    it('returns empty string for 0 seconds', () => {
      expect(formatHours(0)).toBe('')
    })

    it('formats hours with one decimal', () => {
      expect(formatHours(3600)).toBe('1.0h')
      expect(formatHours(5400)).toBe('1.5h')
      expect(formatHours(7200)).toBe('2.0h')
    })

    it('formats minutes for less than 1 hour', () => {
      expect(formatHours(1800)).toBe('30m')
      expect(formatHours(2700)).toBe('45m')
    })
  })

  describe('getHoursClass', () => {
    it('returns empty for 0 seconds', () => {
      expect(getHoursClass(0)).toBe('')
    })

    it('returns hours-great for 8+ hours', () => {
      expect(getHoursClass(28800)).toBe('hours-great') // 8 hours
      expect(getHoursClass(36000)).toBe('hours-great') // 10 hours
    })

    it('returns hours-good for 6-8 hours', () => {
      expect(getHoursClass(21600)).toBe('hours-good') // 6 hours
      expect(getHoursClass(25200)).toBe('hours-good') // 7 hours
    })

    it('returns hours-ok for 4-6 hours', () => {
      expect(getHoursClass(14400)).toBe('hours-ok') // 4 hours
      expect(getHoursClass(18000)).toBe('hours-ok') // 5 hours
    })

    it('returns hours-low for less than 4 hours', () => {
      expect(getHoursClass(3600)).toBe('hours-low')  // 1 hour
      expect(getHoursClass(10800)).toBe('hours-low') // 3 hours
    })

    it('correctly classifies boundary values', () => {
      // Just under 4 hours
      expect(getHoursClass(14399)).toBe('hours-low')
      // Exactly 4 hours
      expect(getHoursClass(14400)).toBe('hours-ok')
      // Just under 6 hours
      expect(getHoursClass(21599)).toBe('hours-ok')
      // Exactly 6 hours
      expect(getHoursClass(21600)).toBe('hours-good')
    })
  })

  describe('isToday', () => {
    it('returns true for today', () => {
      const today = new Date()
      expect(isToday('2024-01-15', today)).toBe(true)
    })

    it('returns false for other days', () => {
      const today = new Date()
      expect(isToday('2020-01-01', today)).toBe(false)
      expect(isToday('2030-12-31', today)).toBe(false)
    })
  })

  describe('isWeekend', () => {
    it('returns true for Saturday', () => {
      // January 6, 2024 is Saturday
      expect(isWeekend(new Date(2024, 0, 6))).toBe(true)
    })

    it('returns true for Sunday', () => {
      // January 7, 2024 is Sunday
      expect(isWeekend(new Date(2024, 0, 7))).toBe(true)
    })

    it('returns false for weekdays', () => {
      // January 8, 2024 is Monday
      expect(isWeekend(new Date(2024, 0, 8))).toBe(false)
      // January 10, 2024 is Wednesday
      expect(isWeekend(new Date(2024, 0, 10))).toBe(false)
      // January 12, 2024 is Friday
      expect(isWeekend(new Date(2024, 0, 12))).toBe(false)
    })
  })

  describe('calculateDailyIssueBreakdown', () => {
    it('groups entries by issue within each day', () => {
      const entries: TimeEntryWithIssue[] = [
        {
          id: 1, issueId: 1, startedAt: '2024-01-15T09:00:00.000Z', endedAt: '2024-01-15T10:00:00.000Z',
          pausedReason: null, notes: null,
          issue: { id: 1, externalId: '#1', name: 'Issue 1', link: null, notes: null, archived: false, createdAt: '2024-01-01' }
        },
        {
          id: 2, issueId: 1, startedAt: '2024-01-15T11:00:00.000Z', endedAt: '2024-01-15T12:00:00.000Z',
          pausedReason: null, notes: null,
          issue: { id: 1, externalId: '#1', name: 'Issue 1', link: null, notes: null, archived: false, createdAt: '2024-01-01' }
        },
        {
          id: 3, issueId: 2, startedAt: '2024-01-15T13:00:00.000Z', endedAt: '2024-01-15T14:00:00.000Z',
          pausedReason: null, notes: null,
          issue: { id: 2, externalId: '#2', name: 'Issue 2', link: null, notes: null, archived: false, createdAt: '2024-01-01' }
        }
      ]

      const breakdown = calculateDailyIssueBreakdown(entries)
      const dayBreakdown = breakdown.get('2024-01-15')!

      expect(dayBreakdown).toHaveLength(2)
      expect(dayBreakdown[0].totalSeconds).toBe(7200) // Issue 1: 2 hours
      expect(dayBreakdown[1].totalSeconds).toBe(3600) // Issue 2: 1 hour
    })

    it('sorts issues by total time descending', () => {
      const entries: TimeEntryWithIssue[] = [
        {
          id: 1, issueId: 1, startedAt: '2024-01-15T09:00:00.000Z', endedAt: '2024-01-15T10:00:00.000Z',
          pausedReason: null, notes: null,
          issue: { id: 1, externalId: '#1', name: 'Issue 1', link: null, notes: null, archived: false, createdAt: '2024-01-01' }
        },
        {
          id: 2, issueId: 2, startedAt: '2024-01-15T09:00:00.000Z', endedAt: '2024-01-15T12:00:00.000Z',
          pausedReason: null, notes: null,
          issue: { id: 2, externalId: '#2', name: 'Issue 2', link: null, notes: null, archived: false, createdAt: '2024-01-01' }
        }
      ]

      const breakdown = calculateDailyIssueBreakdown(entries)
      const dayBreakdown = breakdown.get('2024-01-15')!

      expect(dayBreakdown[0].issue.externalId).toBe('#2') // 3 hours - first
      expect(dayBreakdown[1].issue.externalId).toBe('#1') // 1 hour - second
    })
  })
})
