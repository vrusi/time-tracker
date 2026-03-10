import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  getWorkdaysInMonth,
  getWeekStart,
  getWeekEnd,
  calculateProgress,
  aggregateEntrySeconds,
  getTargetWorkdays,
  getWorkedDays,
  getFreeDays
} from '../../src/utils/workdays'
import { createMockIssue, createMockTimeEntry } from '../fixtures'
import type { Issue, TimeEntry } from '../../src/types'

/**
 * Progress Bar Logic - calculates work targets and progress.
 * Critical for accurate daily/weekly/monthly progress reporting.
 */
describe('Progress Bar Logic', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-01-15T12:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('getWorkdaysInMonth', () => {
    it('counts only Monday-Friday for various months', () => {
      // January 2024: 31 days, starts Monday. Weekends: 6-7, 13-14, 20-21, 27-28 = 8 days
      expect(getWorkdaysInMonth(2024, 0)).toBe(23)

      // February 2024 (leap year): 29 days, starts Thursday. 8 weekend days
      expect(getWorkdaysInMonth(2024, 1)).toBe(21)

      // February 2023 (non-leap): 28 days
      expect(getWorkdaysInMonth(2023, 1)).toBe(20)

      // December 2024: starts Sunday, 31 days, 9 weekend days
      expect(getWorkdaysInMonth(2024, 11)).toBe(22)
    })
  })

  describe('week boundaries', () => {
    it('getWeekStart returns Monday at midnight', () => {
      const wednesday = new Date('2024-01-17T14:30:00.000Z')
      const weekStart = getWeekStart(wednesday)

      expect(weekStart.getDate()).toBe(15) // Monday
      expect(weekStart.getHours()).toBe(0)
      expect(weekStart.getMinutes()).toBe(0)
    })

    it('getWeekEnd returns Sunday at 23:59:59', () => {
      const wednesday = new Date('2024-01-17T14:30:00.000Z')
      const weekEnd = getWeekEnd(wednesday)

      expect(weekEnd.getDate()).toBe(21) // Sunday
      expect(weekEnd.getHours()).toBe(23)
      expect(weekEnd.getMinutes()).toBe(59)
    })

    it('handles week crossing month boundary', () => {
      // Thursday Feb 1 - week started in January
      const weekStart = getWeekStart(new Date('2024-02-01T10:00:00.000Z'))
      expect(weekStart.getMonth()).toBe(0) // January
      expect(weekStart.getDate()).toBe(29)

      // Monday Jan 29 - week ends in February
      const weekEnd = getWeekEnd(new Date('2024-01-29T10:00:00.000Z'))
      expect(weekEnd.getMonth()).toBe(1) // February
      expect(weekEnd.getDate()).toBe(4)
    })
  })

  describe('calculateProgress', () => {
    it('calculates percentage of target hours completed', () => {
      expect(calculateProgress(0, 8)).toBe(0)       // 0h of 8h
      expect(calculateProgress(14400, 8)).toBe(50)  // 4h of 8h
      expect(calculateProgress(28800, 8)).toBe(100) // 8h of 8h
    })

    it('caps at 100% when exceeding target', () => {
      expect(calculateProgress(36000, 8)).toBe(100) // 10h of 8h = 125%, capped
    })

    it('works for weekly and monthly targets', () => {
      expect(calculateProgress(72000, 40)).toBe(50)   // 20h of 40h weekly
      expect(calculateProgress(288000, 160)).toBe(50) // 80h of 160h monthly
    })
  })

  describe('aggregateEntrySeconds', () => {
    it('sums duration of all entries', () => {
      const entries = [
        { startedAt: '2024-01-15T09:00:00.000Z', endedAt: '2024-01-15T10:00:00.000Z' },
        { startedAt: '2024-01-15T11:00:00.000Z', endedAt: '2024-01-15T12:00:00.000Z' }
      ]

      expect(aggregateEntrySeconds(entries)).toBe(7200) // 2 hours
    })

    it('uses provided timestamp for active entries', () => {
      const now = new Date('2024-01-15T10:00:00.000Z').getTime()
      const entries = [
        { startedAt: '2024-01-15T09:00:00.000Z', endedAt: null }
      ]

      expect(aggregateEntrySeconds(entries, now)).toBe(3600) // 1 hour
    })

    it('returns zero for empty array', () => {
      expect(aggregateEntrySeconds([])).toBe(0)
    })
  })

  describe('getTargetWorkdays', () => {
    it('calculates target workdays from monthly and daily hours', () => {
      expect(getTargetWorkdays(160, 8)).toBe(20)
      expect(getTargetWorkdays(120, 8)).toBe(15)
    })

    it('rounds up partial days', () => {
      expect(getTargetWorkdays(100, 8)).toBe(13) // 12.5 → 13
    })

    it('returns zero when daily target is zero', () => {
      expect(getTargetWorkdays(160, 0)).toBe(0)
    })
  })

  describe('getWorkedDays', () => {
    it('calculates completed workdays from tracked seconds', () => {
      // 8h * 3600 = 28800 seconds per day
      expect(getWorkedDays(28800, 8)).toBe(1)
      expect(getWorkedDays(57600, 8)).toBe(2)
    })

    it('floors partial days', () => {
      // 7.5 hours tracked = 0 full days
      expect(getWorkedDays(27000, 8)).toBe(0)
    })

    it('returns zero when daily target is zero', () => {
      expect(getWorkedDays(28800, 0)).toBe(0)
    })
  })

  describe('getFreeDays', () => {
    it('calculates surplus workdays in the month', () => {
      expect(getFreeDays(23, 20)).toBe(3)
      expect(getFreeDays(20, 20)).toBe(0)
    })

    it('returns zero when target exceeds workdays', () => {
      expect(getFreeDays(18, 20)).toBe(0)
    })
  })

  describe('archived issue filtering', () => {
    const activeIssue = createMockIssue({ id: 1, archived: false })
    const archivedIssue = createMockIssue({ id: 2, archived: true })

    function createEntryWithIssue(issue: Issue, overrides: Partial<TimeEntry> = {}) {
      return { ...createMockTimeEntry(overrides), issue }
    }

    it('excludes archived issues from totals', () => {
      const entries = [
        createEntryWithIssue(activeIssue, {
          id: 1, startedAt: '2024-01-15T09:00:00.000Z', endedAt: '2024-01-15T10:00:00.000Z'
        }),
        createEntryWithIssue(archivedIssue, {
          id: 2, startedAt: '2024-01-15T10:00:00.000Z', endedAt: '2024-01-15T12:00:00.000Z'
        })
      ]

      const activeEntries = entries.filter(e => !e.issue.archived)
      const total = aggregateEntrySeconds(activeEntries)

      // Only the active issue's 1 hour counts, not the archived issue's 2 hours
      expect(total).toBe(3600)
    })

    it('includes all entries when none are archived', () => {
      const entries = [
        createEntryWithIssue(activeIssue, {
          id: 1, startedAt: '2024-01-15T09:00:00.000Z', endedAt: '2024-01-15T10:00:00.000Z'
        }),
        createEntryWithIssue(activeIssue, {
          id: 2, startedAt: '2024-01-15T11:00:00.000Z', endedAt: '2024-01-15T12:00:00.000Z'
        })
      ]

      const activeEntries = entries.filter(e => !e.issue.archived)
      const total = aggregateEntrySeconds(activeEntries)

      expect(total).toBe(7200) // 2 hours
    })

    it('returns zero when all entries are archived', () => {
      const entries = [
        createEntryWithIssue(archivedIssue, {
          id: 1, startedAt: '2024-01-15T09:00:00.000Z', endedAt: '2024-01-15T11:00:00.000Z'
        })
      ]

      const activeEntries = entries.filter(e => !e.issue.archived)
      const total = aggregateEntrySeconds(activeEntries)

      expect(total).toBe(0)
    })
  })
})
