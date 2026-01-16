import { describe, it, expect } from 'vitest'

/**
 * Tests for Export Handler Logic.
 * These tests verify the business logic without requiring
 * the native better-sqlite3 module (which is compiled for Electron).
 */
describe('Export Handler Logic', () => {
  describe('export-month (getMonthlyReport)', () => {
    interface EntryRow {
      id: number
      external_id: string
      name: string
      started_at: string
      ended_at: string | null
    }

    /**
     * Replicates the aggregation logic from the handler
     */
    function aggregateMonthlyReport(entries: EntryRow[]) {
      const issueMap = new Map<number, { externalId: string; name: string; totalSeconds: number }>()

      entries.forEach(entry => {
        const start = new Date(entry.started_at).getTime()
        const end = entry.ended_at ? new Date(entry.ended_at).getTime() : Date.now()
        const seconds = (end - start) / 1000

        if (issueMap.has(entry.id)) {
          issueMap.get(entry.id)!.totalSeconds += seconds
        } else {
          issueMap.set(entry.id, {
            externalId: entry.external_id,
            name: entry.name,
            totalSeconds: seconds
          })
        }
      })

      return Array.from(issueMap.entries()).map(([id, data]) => ({
        issueId: id,
        externalId: data.externalId,
        name: data.name,
        totalHours: Math.round(data.totalSeconds / 36) / 100
      }))
    }

    it('aggregates time by issue for a given month', () => {
      const entries: EntryRow[] = [
        // Issue 1: 2 hours
        { id: 1, external_id: '#1', name: 'Issue 1', started_at: '2024-01-15T09:00:00.000Z', ended_at: '2024-01-15T10:00:00.000Z' },
        { id: 1, external_id: '#1', name: 'Issue 1', started_at: '2024-01-16T09:00:00.000Z', ended_at: '2024-01-16T10:00:00.000Z' },
        // Issue 2: 30 minutes
        { id: 2, external_id: '#2', name: 'Issue 2', started_at: '2024-01-17T09:00:00.000Z', ended_at: '2024-01-17T09:30:00.000Z' }
      ]

      const report = aggregateMonthlyReport(entries)

      expect(report).toHaveLength(2)

      const issue1 = report.find(r => r.externalId === '#1')
      expect(issue1).toBeDefined()
      expect(issue1!.totalHours).toBe(2)

      const issue2 = report.find(r => r.externalId === '#2')
      expect(issue2).toBeDefined()
      expect(issue2!.totalHours).toBe(0.5)
    })

    it('converts seconds to hours with expected precision', () => {
      const entries: EntryRow[] = [
        { id: 1, external_id: '#1', name: 'Test', started_at: '2024-01-15T09:00:00.000Z', ended_at: '2024-01-15T10:30:00.000Z' }
      ]

      const report = aggregateMonthlyReport(entries)

      expect(report[0].totalHours).toBe(1.5)
    })

    it('handles fractional hours correctly', () => {
      const entries: EntryRow[] = [
        { id: 1, external_id: '#1', name: 'Test', started_at: '2024-01-15T09:00:00.000Z', ended_at: '2024-01-15T10:15:00.000Z' }
      ]

      const report = aggregateMonthlyReport(entries)

      expect(report[0].totalHours).toBe(1.25)
    })

    it('returns empty array for months with no entries', () => {
      const report = aggregateMonthlyReport([])

      expect(report).toHaveLength(0)
    })

    it('combines multiple entries for the same issue', () => {
      const entries: EntryRow[] = [
        { id: 1, external_id: '#1', name: 'Test', started_at: '2024-01-10T09:00:00.000Z', ended_at: '2024-01-10T10:00:00.000Z' },
        { id: 1, external_id: '#1', name: 'Test', started_at: '2024-01-15T09:00:00.000Z', ended_at: '2024-01-15T10:00:00.000Z' },
        { id: 1, external_id: '#1', name: 'Test', started_at: '2024-01-20T09:00:00.000Z', ended_at: '2024-01-20T10:00:00.000Z' }
      ]

      const report = aggregateMonthlyReport(entries)

      expect(report).toHaveLength(1)
      expect(report[0].totalHours).toBe(3)
    })

    it('handles rounding to 2 decimal places', () => {
      // 7.33 hours = 26388 seconds
      // Math.round(26388 / 36) / 100 = Math.round(733) / 100 = 7.33
      const entries: EntryRow[] = [
        { id: 1, external_id: '#1', name: 'Test', started_at: '2024-01-15T09:00:00.000Z', ended_at: '2024-01-15T16:20:00.000Z' }
      ]

      const report = aggregateMonthlyReport(entries)

      expect(report[0].totalHours).toBe(7.33)
    })
  })

  describe('date range calculation', () => {
    it('generates first day of month at midnight', () => {
      const year = 2024
      const month = 1 // January

      const startDate = new Date(year, month - 1, 1)

      expect(startDate.getFullYear()).toBe(2024)
      expect(startDate.getMonth()).toBe(0) // January = 0
      expect(startDate.getDate()).toBe(1)
    })

    it('generates last day of month', () => {
      const year = 2024
      const month = 1 // January

      // Day 0 of next month = last day of current month
      const endDate = new Date(year, month, 0)

      expect(endDate.getFullYear()).toBe(2024)
      expect(endDate.getMonth()).toBe(0) // January = 0
      expect(endDate.getDate()).toBe(31) // January has 31 days
    })

    it('handles February in leap year', () => {
      const year = 2024
      const month = 2 // February

      const endDate = new Date(year, month, 0)

      expect(endDate.getMonth()).toBe(1) // February = 1
      expect(endDate.getDate()).toBe(29) // Leap year has 29 days
    })

    it('handles February in non-leap year', () => {
      const year = 2023
      const month = 2 // February

      const endDate = new Date(year, month, 0)

      expect(endDate.getMonth()).toBe(1) // February = 1
      expect(endDate.getDate()).toBe(28) // Non-leap year has 28 days
    })
  })
})
