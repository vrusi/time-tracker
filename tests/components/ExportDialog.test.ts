import { describe, it, expect } from 'vitest'
import {
  formatTimeHM,
  roundToHalfHour,
  aggregateReport,
  generateCSV,
  generateExportFilename,
  type AggregatedReportItem
} from '../../src/utils/export'
import type { MonthlyReport } from '../../src/types'

/**
 * Tests for ExportDialog component logic.
 * These tests verify the real utility functions used by the component.
 */
describe('ExportDialog Logic', () => {
  describe('roundToHalfHour', () => {
    it('rounds to nearest half hour', () => {
      expect(roundToHalfHour(1.1)).toBe(1)
      expect(roundToHalfHour(1.3)).toBe(1.5)
      expect(roundToHalfHour(1.7)).toBe(1.5)
      expect(roundToHalfHour(1.8)).toBe(2)
    })

    it('keeps exact half hours unchanged', () => {
      expect(roundToHalfHour(0)).toBe(0)
      expect(roundToHalfHour(0.5)).toBe(0.5)
      expect(roundToHalfHour(1)).toBe(1)
      expect(roundToHalfHour(1.5)).toBe(1.5)
    })
  })

  describe('formatTimeHM', () => {
    it('formats whole hours', () => {
      expect(formatTimeHM(1)).toBe('1:00')
      expect(formatTimeHM(8)).toBe('8:00')
      expect(formatTimeHM(12)).toBe('12:00')
    })

    it('formats half hours', () => {
      expect(formatTimeHM(1.5)).toBe('1:30')
      expect(formatTimeHM(0.5)).toBe('0:30')
    })

    it('rounds to nearest half hour', () => {
      expect(formatTimeHM(1.2)).toBe('1:00')
      expect(formatTimeHM(1.3)).toBe('1:30')
      expect(formatTimeHM(1.7)).toBe('1:30')
      expect(formatTimeHM(1.8)).toBe('2:00')
    })

    it('handles zero', () => {
      expect(formatTimeHM(0)).toBe('0:00')
    })

    it('handles large values', () => {
      expect(formatTimeHM(24)).toBe('24:00')
      expect(formatTimeHM(100)).toBe('100:00')
    })
  })

  describe('aggregateReport', () => {
    it('combines entries with same externalId', () => {
      const report: MonthlyReport[] = [
        { issueId: 1, externalId: '#123', name: 'Issue A', totalHours: 2 },
        { issueId: 2, externalId: '#123', name: 'Issue A (copy)', totalHours: 3 }
      ]

      const aggregated = aggregateReport(report)

      expect(aggregated).toHaveLength(1)
      expect(aggregated[0].externalId).toBe('#123')
      expect(aggregated[0].totalHours).toBe(5)
    })

    it('keeps separate entries for different externalIds', () => {
      const report: MonthlyReport[] = [
        { issueId: 1, externalId: '#123', name: 'Issue A', totalHours: 2 },
        { issueId: 2, externalId: '#456', name: 'Issue B', totalHours: 3 }
      ]

      const aggregated = aggregateReport(report)

      expect(aggregated).toHaveLength(2)
    })

    it('returns empty array for empty report', () => {
      const aggregated = aggregateReport([])
      expect(aggregated).toHaveLength(0)
    })

    it('uses first name when combining duplicates', () => {
      const report: MonthlyReport[] = [
        { issueId: 1, externalId: '#123', name: 'First Name', totalHours: 2 },
        { issueId: 2, externalId: '#123', name: 'Second Name', totalHours: 3 }
      ]

      const aggregated = aggregateReport(report)

      expect(aggregated[0].name).toBe('First Name')
    })
  })

  describe('generateCSV', () => {
    it('produces valid CSV with correct headers', () => {
      const items: AggregatedReportItem[] = [
        { externalId: '#123', name: 'Issue A', totalHours: 2 }
      ]

      const csv = generateCSV(items)
      const lines = csv.split('\n')

      expect(lines[0]).toBe('Task,Time')
    })

    it('quotes names to handle commas', () => {
      const items: AggregatedReportItem[] = [
        { externalId: '#123', name: 'Issue with, comma', totalHours: 2 }
      ]

      const csv = generateCSV(items)

      expect(csv).toContain('"Issue with, comma"')
    })

    it('formats time as H:MM rounded to half hours', () => {
      const items: AggregatedReportItem[] = [
        { externalId: '#123', name: 'Issue', totalHours: 1.5 }
      ]

      const csv = generateCSV(items)

      expect(csv).toContain('1:30')
    })

    it('handles multiple rows', () => {
      const items: AggregatedReportItem[] = [
        { externalId: '#1', name: 'Issue 1', totalHours: 1 },
        { externalId: '#2', name: 'Issue 2', totalHours: 2 },
        { externalId: '#3', name: 'Issue 3', totalHours: 3 }
      ]

      const csv = generateCSV(items)
      const lines = csv.split('\n')

      expect(lines).toHaveLength(4) // Header + 3 rows
    })

    it('generates empty CSV (just headers) for no data', () => {
      const csv = generateCSV([])
      const lines = csv.split('\n')

      expect(lines).toHaveLength(1)
      expect(lines[0]).toBe('Task,Time')
    })
  })

  describe('generateExportFilename', () => {
    it('pads month with leading zero', () => {
      expect(generateExportFilename(2024, 1)).toBe('time-report-2024-01.csv')
      expect(generateExportFilename(2024, 9)).toBe('time-report-2024-09.csv')
    })

    it('does not pad two-digit months', () => {
      expect(generateExportFilename(2024, 10)).toBe('time-report-2024-10.csv')
      expect(generateExportFilename(2024, 12)).toBe('time-report-2024-12.csv')
    })
  })
})
