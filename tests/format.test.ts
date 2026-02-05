import { describe, it, expect } from 'vitest'
import {
  formatDuration,
  formatTime,
  formatHours,
  formatMoney,
  formatTimer,
  formatIdleTime,
  calculateIdleProgress,
  formatDate,
  toLocalDateTimeInput
} from '../src/utils/format'

/**
 * Format utilities - core business logic for time display.
 * These functions are used throughout the app for consistent formatting.
 */
describe('Format Utilities', () => {
  describe('formatDuration', () => {
    it('formats time as Xh Ym for hours and minutes', () => {
      expect(formatDuration(0)).toBe('0m')
      expect(formatDuration(60)).toBe('1m')
      expect(formatDuration(1800)).toBe('30m')
      expect(formatDuration(3600)).toBe('1h 0m')
      expect(formatDuration(5400)).toBe('1h 30m')
      expect(formatDuration(86400)).toBe('24h 0m')
    })
  })

  describe('formatHours', () => {
    it('formats seconds as hours or minutes for display', () => {
      expect(formatHours(0)).toBe('')
      expect(formatHours(60)).toBe('1m')
      expect(formatHours(1800)).toBe('30m')
      expect(formatHours(3600)).toBe('1.0h')
      expect(formatHours(5400)).toBe('1.5h')
    })
  })

  describe('formatMoney', () => {
    it('formats currency with symbol and 2 decimal places', () => {
      expect(formatMoney(0, '£')).toBe('£0.00')
      expect(formatMoney(100, '$')).toBe('$100.00')
      expect(formatMoney(99.9, '€')).toBe('€99.90')
      expect(formatMoney(10.556, '£')).toBe('£10.56')
      expect(formatMoney(10.554, '£')).toBe('£10.55')
    })
  })

  describe('formatTimer', () => {
    it('formats seconds as HH:MM:SS timer display', () => {
      expect(formatTimer(0)).toBe('00:00:00')
      expect(formatTimer(59)).toBe('00:00:59')
      expect(formatTimer(60)).toBe('00:01:00')
      expect(formatTimer(3661)).toBe('01:01:01')
      expect(formatTimer(36000)).toBe('10:00:00')
    })
  })

  describe('formatIdleTime', () => {
    it('shows idle time only when above threshold', () => {
      const threshold = 30

      expect(formatIdleTime(0, threshold)).toBe('')
      expect(formatIdleTime(29, threshold)).toBe('')
      expect(formatIdleTime(30, threshold)).toBe('30s')
      expect(formatIdleTime(60, threshold)).toBe('1m 0s')
      expect(formatIdleTime(90, threshold)).toBe('1m 30s')
    })
  })

  describe('calculateIdleProgress', () => {
    it('calculates percentage towards auto-pause threshold', () => {
      const threshold = 600 // 10 minutes

      expect(calculateIdleProgress(0, threshold)).toBe(0)
      expect(calculateIdleProgress(300, threshold)).toBe(50)
      expect(calculateIdleProgress(600, threshold)).toBe(100)
      expect(calculateIdleProgress(900, threshold)).toBe(100) // capped
    })

    it('handles zero threshold gracefully', () => {
      expect(calculateIdleProgress(100, 0)).toBe(100)
    })
  })

  describe('toLocalDateTimeInput', () => {
    it('converts ISO string to datetime-local input format', () => {
      const jan15 = new Date(2024, 0, 15, 14, 30)
      expect(toLocalDateTimeInput(jan15.toISOString())).toBe('2024-01-15T14:30')

      const jan5 = new Date(2024, 0, 5, 9, 5)
      expect(toLocalDateTimeInput(jan5.toISOString())).toBe('2024-01-05T09:05')
    })
  })
})
