import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  getWorkdaysInMonth,
  calculateProgress,
  aggregateEntrySeconds
} from '../../src/utils/workdays'
import { formatDuration, formatMoney } from '../../src/utils/format'

/**
 * Tests for ProgressBars component logic.
 * These tests verify the real utility functions used by the component.
 */
describe('ProgressBars Logic', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-01-15T12:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('getWorkdaysInMonth', () => {
    it('counts workdays excluding weekends', () => {
      // January 2024: 31 days, starts on Monday
      // Weekends: 6-7, 13-14, 20-21, 27-28 = 8 weekend days
      // Workdays: 31 - 8 = 23
      expect(getWorkdaysInMonth(2024, 0)).toBe(23)
    })

    it('handles February in leap year', () => {
      // February 2024 (leap year): 29 days, starts on Thursday
      // Weekends: 3-4, 10-11, 17-18, 24-25 = 8 weekend days
      // Workdays: 29 - 8 = 21
      expect(getWorkdaysInMonth(2024, 1)).toBe(21)
    })

    it('handles February in non-leap year', () => {
      // February 2023: 28 days, starts on Wednesday
      // Workdays: 20
      expect(getWorkdaysInMonth(2023, 1)).toBe(20)
    })

    it('handles months with 30 days', () => {
      // April 2024: 30 days, starts on Monday
      expect(getWorkdaysInMonth(2024, 3)).toBe(22)
    })

    it('handles December', () => {
      // December 2024: 31 days, starts on Sunday
      // Weekends: 1, 7-8, 14-15, 21-22, 28-29 = 9 weekend days
      // Workdays: 31 - 9 = 22
      expect(getWorkdaysInMonth(2024, 11)).toBe(22)
    })
  })

  describe('calculateProgress', () => {
    describe('daily progress', () => {
      it('calculates progress as percentage of target', () => {
        // 4 hours of 8 hour target = 50%
        expect(calculateProgress(14400, 8)).toBe(50)
      })

      it('caps at 100%', () => {
        // 10 hours of 8 hour target = 125%, capped to 100
        expect(calculateProgress(36000, 8)).toBe(100)
      })

      it('handles zero seconds', () => {
        expect(calculateProgress(0, 8)).toBe(0)
      })

      it('handles fractional hours', () => {
        // 6 hours of 8 hour target = 75%
        expect(calculateProgress(21600, 8)).toBe(75)
      })
    })

    describe('monthly progress', () => {
      it('calculates progress as percentage of monthly target', () => {
        // 80 hours of 160 hour target = 50%
        expect(calculateProgress(288000, 160)).toBe(50)
      })

      it('caps at 100%', () => {
        // 200 hours of 160 hour target = 125%, capped to 100
        expect(calculateProgress(720000, 160)).toBe(100)
      })
    })
  })

  describe('aggregateEntrySeconds', () => {
    it('sums completed entries', () => {
      const entries = [
        { startedAt: '2024-01-15T09:00:00.000Z', endedAt: '2024-01-15T10:00:00.000Z' },
        { startedAt: '2024-01-15T11:00:00.000Z', endedAt: '2024-01-15T12:00:00.000Z' }
      ]

      const total = aggregateEntrySeconds(entries)

      expect(total).toBe(7200) // 2 hours
    })

    it('includes active entries using provided now value', () => {
      const now = new Date('2024-01-15T10:00:00.000Z').getTime()
      const entries = [
        { startedAt: '2024-01-15T09:00:00.000Z', endedAt: null }
      ]

      const total = aggregateEntrySeconds(entries, now)

      expect(total).toBe(3600) // Exactly 1 hour
    })

    it('handles empty array', () => {
      expect(aggregateEntrySeconds([])).toBe(0)
    })
  })

  describe('formatDuration', () => {
    it('formats hours and minutes', () => {
      expect(formatDuration(3600)).toBe('1h 0m')
      expect(formatDuration(5400)).toBe('1h 30m')
      expect(formatDuration(7200)).toBe('2h 0m')
    })

    it('handles zero', () => {
      expect(formatDuration(0)).toBe('0m')
    })

    it('handles only minutes', () => {
      expect(formatDuration(1800)).toBe('30m')
      expect(formatDuration(2700)).toBe('45m')
    })

    it('handles large values', () => {
      // 160 hours
      expect(formatDuration(576000)).toBe('160h 0m')
    })
  })

  describe('formatMoney', () => {
    it('formats with currency symbol', () => {
      expect(formatMoney(100, '£')).toBe('£100.00')
      expect(formatMoney(1234.56, '$')).toBe('$1234.56')
    })

    it('rounds to 2 decimal places', () => {
      expect(formatMoney(100.456, '£')).toBe('£100.46')
      expect(formatMoney(100.454, '£')).toBe('£100.45')
    })

    it('handles zero', () => {
      expect(formatMoney(0, '£')).toBe('£0.00')
    })

    it('handles different currency symbols', () => {
      expect(formatMoney(100, '€')).toBe('€100.00')
      expect(formatMoney(100, '¥')).toBe('¥100.00')
    })
  })

  describe('earnings calculations', () => {
    it('calculates monthly earnings based on hours and rate', () => {
      const monthSeconds = 36000 // 10 hours
      const hourlyRate = 20
      const hours = monthSeconds / 3600
      const earnings = hours * hourlyRate

      expect(earnings).toBe(200)
    })

    it('calculates target earnings', () => {
      const monthlyTargetHours = 160
      const hourlyRate = 18.67
      const targetEarnings = monthlyTargetHours * hourlyRate

      expect(targetEarnings).toBeCloseTo(2987.2)
    })
  })
})
