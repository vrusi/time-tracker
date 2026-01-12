import { describe, it, expect } from 'vitest'
import { formatDuration, formatHours, formatMoney } from '../src/utils/format'

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
})
