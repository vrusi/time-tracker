import { describe, it, expect } from 'vitest'

/**
 * Export Logic - aggregates time entries for monthly reporting.
 * These business rules determine how hours are calculated and reported.
 */
describe('Export Logic', () => {
  interface EntryRow {
    id: number
    external_id: string
    name: string
    started_at: string
    ended_at: string | null
  }

  /**
   * Replicates the aggregation logic from the export handler.
   * Groups entries by issue and calculates total hours.
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

  describe('time aggregation by issue', () => {
    it('combines multiple entries for the same issue', () => {
      const entries: EntryRow[] = [
        { id: 1, external_id: '#1', name: 'Issue 1', started_at: '2024-01-10T09:00:00.000Z', ended_at: '2024-01-10T10:00:00.000Z' },
        { id: 1, external_id: '#1', name: 'Issue 1', started_at: '2024-01-15T09:00:00.000Z', ended_at: '2024-01-15T10:00:00.000Z' },
        { id: 1, external_id: '#1', name: 'Issue 1', started_at: '2024-01-20T09:00:00.000Z', ended_at: '2024-01-20T10:00:00.000Z' }
      ]

      const report = aggregateMonthlyReport(entries)

      expect(report).toHaveLength(1)
      expect(report[0].totalHours).toBe(3) // 3 hours total
    })

    it('keeps entries for different issues separate', () => {
      const entries: EntryRow[] = [
        { id: 1, external_id: '#1', name: 'Issue 1', started_at: '2024-01-15T09:00:00.000Z', ended_at: '2024-01-15T11:00:00.000Z' },
        { id: 2, external_id: '#2', name: 'Issue 2', started_at: '2024-01-17T09:00:00.000Z', ended_at: '2024-01-17T09:30:00.000Z' }
      ]

      const report = aggregateMonthlyReport(entries)

      expect(report).toHaveLength(2)
      expect(report.find(r => r.externalId === '#1')!.totalHours).toBe(2)
      expect(report.find(r => r.externalId === '#2')!.totalHours).toBe(0.5)
    })

    it('returns empty report for months with no entries', () => {
      expect(aggregateMonthlyReport([])).toHaveLength(0)
    })
  })

  describe('hours rounding', () => {
    it('rounds to 2 decimal places', () => {
      // 7h 20m = 26400 seconds
      // Math.round(26400 / 36) / 100 = Math.round(733.33) / 100 = 7.33
      const entries: EntryRow[] = [
        { id: 1, external_id: '#1', name: 'Test', started_at: '2024-01-15T09:00:00.000Z', ended_at: '2024-01-15T16:20:00.000Z' }
      ]

      const report = aggregateMonthlyReport(entries)

      expect(report[0].totalHours).toBe(7.33)
    })

    it('handles fractional hours', () => {
      // 1.5 hours = 5400 seconds
      const entries: EntryRow[] = [
        { id: 1, external_id: '#1', name: 'Test', started_at: '2024-01-15T09:00:00.000Z', ended_at: '2024-01-15T10:30:00.000Z' }
      ]

      const report = aggregateMonthlyReport(entries)

      expect(report[0].totalHours).toBe(1.5)
    })
  })
})
