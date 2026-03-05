import { describe, it, expect, vi } from 'vitest'

// Mock jsPDF before importing export utils (happy-dom lacks APIs jsPDF needs)
const mockSave = vi.fn()
const mockOutput = vi.fn(() => new ArrayBuffer(100))
const mockText = vi.fn()
const mockSetFontSize = vi.fn()
const mockJsPDFInstance = {
  save: mockSave,
  output: mockOutput,
  text: mockText,
  setFontSize: mockSetFontSize
}
vi.mock('jspdf', () => ({
  jsPDF: vi.fn().mockImplementation(function () { return mockJsPDFInstance })
}))
vi.mock('jspdf-autotable', () => ({
  default: vi.fn()
}))

import {
  formatTimeHMS,
  roundToHalfHour,
  aggregateReport,
  generateCSV,
  generatePDF,
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

  describe('formatTimeHMS', () => {
    it('formats whole hours', () => {
      expect(formatTimeHMS(1)).toBe('01:00:00')
      expect(formatTimeHMS(8)).toBe('08:00:00')
      expect(formatTimeHMS(12)).toBe('12:00:00')
    })

    it('formats half hours', () => {
      expect(formatTimeHMS(1.5)).toBe('01:30:00')
      expect(formatTimeHMS(0.5)).toBe('00:30:00')
    })

    it('rounds to nearest half hour', () => {
      expect(formatTimeHMS(1.2)).toBe('01:00:00')
      expect(formatTimeHMS(1.3)).toBe('01:30:00')
      expect(formatTimeHMS(1.7)).toBe('01:30:00')
      expect(formatTimeHMS(1.8)).toBe('02:00:00')
    })

    it('handles zero', () => {
      expect(formatTimeHMS(0)).toBe('00:00:00')
    })

    it('handles large values', () => {
      expect(formatTimeHMS(24)).toBe('24:00:00')
      expect(formatTimeHMS(100)).toBe('100:00:00')
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

    it('formats time as HH:MM:SS rounded to half hours', () => {
      const items: AggregatedReportItem[] = [
        { externalId: '#123', name: 'Issue', totalHours: 1.5 }
      ]

      const csv = generateCSV(items)

      expect(csv).toContain('01:30:00')
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

    it('appends total row when totalHours provided', () => {
      const items: AggregatedReportItem[] = [
        { externalId: '#1', name: 'Issue 1', totalHours: 2 },
        { externalId: '#2', name: 'Issue 2', totalHours: 3 }
      ]

      const csv = generateCSV(items, 5)
      const lines = csv.split('\n')

      expect(lines).toHaveLength(4) // Header + 2 rows + total
      expect(lines[3]).toBe('"Total",05:00:00')
    })

    it('does not append total row when totalHours not provided', () => {
      const items: AggregatedReportItem[] = [
        { externalId: '#1', name: 'Issue', totalHours: 2 }
      ]

      const csv = generateCSV(items)
      const lines = csv.split('\n')

      expect(lines).toHaveLength(2) // Header + 1 row
      expect(csv).not.toContain('Total')
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

    it('uses csv extension by default', () => {
      expect(generateExportFilename(2024, 3)).toBe('time-report-2024-03.csv')
    })

    it('uses pdf extension when specified', () => {
      expect(generateExportFilename(2024, 3, 'pdf')).toBe('time-report-2024-03.pdf')
    })
  })

  describe('generatePDF', () => {
    it('returns a jsPDF document with save and output methods', () => {
      const items: AggregatedReportItem[] = [
        { externalId: '#1', name: 'Issue 1', totalHours: 2 },
        { externalId: '#2', name: 'Issue 2', totalHours: 3 }
      ]

      const doc = generatePDF(items, 5, 'Test Report')

      expect(doc).toBeDefined()
      expect(typeof doc.save).toBe('function')
      expect(typeof doc.output).toBe('function')
    })

    it('sets the title text on the document', () => {
      const items: AggregatedReportItem[] = [
        { externalId: '#1', name: 'Issue 1', totalHours: 1.5 }
      ]

      generatePDF(items, 1.5, 'My Report Title')

      expect(mockText).toHaveBeenCalledWith('My Report Title', 14, 20)
    })
  })
})
