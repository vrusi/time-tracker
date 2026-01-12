import { describe, it, expect } from 'vitest'
import {
  formatDuration,
  formatHours,
  formatMoney,
  formatTimer,
  formatIdleTime,
  calculateIdleProgress
} from '../src/utils/format'

describe('Format Utilities', () => {
  describe('formatDuration', () => {
    it('formats seconds to hours and minutes', () => {
      expect(formatDuration(3600)).toBe('1h 0m')
      expect(formatDuration(3660)).toBe('1h 1m')
      expect(formatDuration(7200)).toBe('2h 0m')
      expect(formatDuration(5400)).toBe('1h 30m')
    })

    it('formats minutes only when less than an hour', () => {
      expect(formatDuration(0)).toBe('0m')
      expect(formatDuration(60)).toBe('1m')
      expect(formatDuration(300)).toBe('5m')
      expect(formatDuration(3599)).toBe('59m')
    })

    it('handles large values', () => {
      expect(formatDuration(36000)).toBe('10h 0m')
      expect(formatDuration(86400)).toBe('24h 0m')
    })

    it('handles negative values (edge case)', () => {
      // Negative values shouldn't occur in normal usage
      // Documents current behavior: -60 seconds = -1m (hours check fails since -1 > 0 is false)
      expect(formatDuration(-60)).toBe('-1m')
    })
  })

  describe('formatHours', () => {
    it('returns empty string for zero', () => {
      expect(formatHours(0)).toBe('')
    })

    it('formats to hours with decimal when >= 1 hour', () => {
      expect(formatHours(3600)).toBe('1.0h')
      expect(formatHours(5400)).toBe('1.5h')
      expect(formatHours(9000)).toBe('2.5h')
    })

    it('formats to minutes when < 1 hour', () => {
      expect(formatHours(60)).toBe('1m')
      expect(formatHours(1800)).toBe('30m')
      expect(formatHours(2700)).toBe('45m')
    })
  })

  describe('formatMoney', () => {
    it('formats with currency symbol and 2 decimal places', () => {
      expect(formatMoney(100, '$')).toBe('$100.00')
      expect(formatMoney(99.9, '£')).toBe('£99.90')
      expect(formatMoney(0, '€')).toBe('€0.00')
    })

    it('rounds to 2 decimal places', () => {
      expect(formatMoney(10.556, '$')).toBe('$10.56')
      expect(formatMoney(10.554, '$')).toBe('$10.55')
    })
  })

  describe('formatTimer', () => {
    it('formats to HH:MM:SS with zero padding', () => {
      expect(formatTimer(0)).toBe('00:00:00')
      expect(formatTimer(1)).toBe('00:00:01')
      expect(formatTimer(59)).toBe('00:00:59')
      expect(formatTimer(60)).toBe('00:01:00')
      expect(formatTimer(61)).toBe('00:01:01')
    })

    it('handles hours correctly', () => {
      expect(formatTimer(3600)).toBe('01:00:00')
      expect(formatTimer(3661)).toBe('01:01:01')
      expect(formatTimer(36000)).toBe('10:00:00')
    })

    it('handles large values', () => {
      expect(formatTimer(86400)).toBe('24:00:00')
      expect(formatTimer(90061)).toBe('25:01:01')
    })
  })

  describe('formatIdleTime', () => {
    const threshold = 30 // 30 seconds threshold

    it('returns empty string when below threshold', () => {
      expect(formatIdleTime(0, threshold)).toBe('')
      expect(formatIdleTime(29, threshold)).toBe('')
    })

    it('formats seconds only when less than a minute', () => {
      expect(formatIdleTime(30, threshold)).toBe('30s')
      expect(formatIdleTime(45, threshold)).toBe('45s')
      expect(formatIdleTime(59, threshold)).toBe('59s')
    })

    it('formats minutes and seconds when >= 1 minute', () => {
      expect(formatIdleTime(60, threshold)).toBe('1m 0s')
      expect(formatIdleTime(90, threshold)).toBe('1m 30s')
      expect(formatIdleTime(150, threshold)).toBe('2m 30s')
    })
  })

  describe('calculateIdleProgress', () => {
    it('calculates percentage of idle time towards threshold', () => {
      expect(calculateIdleProgress(0, 600)).toBe(0)
      expect(calculateIdleProgress(300, 600)).toBe(50)
      expect(calculateIdleProgress(600, 600)).toBe(100)
    })

    it('caps at 100%', () => {
      expect(calculateIdleProgress(700, 600)).toBe(100)
      expect(calculateIdleProgress(1200, 600)).toBe(100)
    })

    it('handles zero threshold', () => {
      // Zero threshold would cause division by zero - returns Infinity capped to 100
      expect(calculateIdleProgress(100, 0)).toBe(100)
    })

    it('handles negative values (edge case)', () => {
      // Negative idle time shouldn't occur, but Math.min caps correctly
      // -100/600 * 100 = -16.67, Math.min(100, -16.67) = -16.67
      const result = calculateIdleProgress(-100, 600)
      expect(result).toBeLessThan(0)
    })
  })
})
