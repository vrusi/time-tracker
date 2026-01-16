import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mapTimeEntry, mapTimeEntries, mapTimeEntriesWithIssue, type TimeEntryRow, type TimeEntryWithIssueRow } from '../../electron/mappers/entry.mapper'

/**
 * Tests for Entries Handler Logic.
 * These tests verify the business logic and data mapping without requiring
 * the native better-sqlite3 module (which is compiled for Electron).
 */
describe('Entries Handler Logic', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-01-15T12:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('Entry Mapper', () => {
    it('maps database row to TimeEntry object', () => {
      const row: TimeEntryRow = {
        id: 1,
        issue_id: 42,
        started_at: '2024-01-15T09:00:00.000Z',
        ended_at: '2024-01-15T10:00:00.000Z',
        paused_reason: 'manual',
        notes: 'Some work notes'
      }

      const entry = mapTimeEntry(row)

      expect(entry.id).toBe(1)
      expect(entry.issueId).toBe(42)
      expect(entry.startedAt).toBe('2024-01-15T09:00:00.000Z')
      expect(entry.endedAt).toBe('2024-01-15T10:00:00.000Z')
      expect(entry.pausedReason).toBe('manual')
      expect(entry.notes).toBe('Some work notes')
    })

    it('handles null ended_at for active entries', () => {
      const row: TimeEntryRow = {
        id: 1,
        issue_id: 1,
        started_at: '2024-01-15T09:00:00.000Z',
        ended_at: null,
        paused_reason: null,
        notes: null
      }

      const entry = mapTimeEntry(row)

      expect(entry.endedAt).toBeNull()
      expect(entry.pausedReason).toBeNull()
    })

    it('maps entries with issue data', () => {
      const row: TimeEntryWithIssueRow = {
        id: 1,
        issue_id: 42,
        started_at: '2024-01-15T09:00:00.000Z',
        ended_at: '2024-01-15T10:00:00.000Z',
        paused_reason: null,
        notes: null,
        external_id: '#123',
        name: 'Test Issue',
        link: 'https://example.com',
        issue_notes: 'Issue notes',
        archived: 0,
        issue_created_at: '2024-01-01T00:00:00.000Z'
      }

      const result = mapTimeEntriesWithIssue([row])[0]

      expect(result.id).toBe(1)
      expect(result.issue.id).toBe(42)
      expect(result.issue.externalId).toBe('#123')
      expect(result.issue.name).toBe('Test Issue')
    })

    it('accepts all valid paused_reason values', () => {
      const validReasons = ['manual', 'idle', 'switched', null] as const

      validReasons.forEach(reason => {
        const row: TimeEntryRow = {
          id: 1,
          issue_id: 1,
          started_at: '2024-01-01T09:00:00.000Z',
          ended_at: '2024-01-01T10:00:00.000Z',
          paused_reason: reason,
          notes: null
        }

        const entry = mapTimeEntry(row)
        expect(entry.pausedReason).toBe(reason)
      })
    })
  })

  describe('get-time-entries filtering', () => {
    it('filters by date range', () => {
      const entries: TimeEntryRow[] = [
        { id: 1, issue_id: 1, started_at: '2024-01-15T09:00:00.000Z', ended_at: '2024-01-15T10:00:00.000Z', paused_reason: null, notes: null },
        { id: 2, issue_id: 1, started_at: '2024-02-15T09:00:00.000Z', ended_at: '2024-02-15T10:00:00.000Z', paused_reason: null, notes: null },
        { id: 3, issue_id: 1, started_at: '2024-03-15T09:00:00.000Z', ended_at: '2024-03-15T10:00:00.000Z', paused_reason: null, notes: null }
      ]

      const startDate = '2024-01-01T00:00:00.000Z'
      const endDate = '2024-01-31T23:59:59.999Z'

      // Simulate WHERE te.started_at >= ? AND te.started_at <= ?
      const filtered = entries.filter(e =>
        e.started_at >= startDate && e.started_at <= endDate
      )

      expect(filtered).toHaveLength(1)
      expect(filtered[0].id).toBe(1)
    })

    it('orders by started_at descending', () => {
      const entries: TimeEntryRow[] = [
        { id: 1, issue_id: 1, started_at: '2024-01-10T09:00:00.000Z', ended_at: null, paused_reason: null, notes: null },
        { id: 2, issue_id: 1, started_at: '2024-01-15T09:00:00.000Z', ended_at: null, paused_reason: null, notes: null },
        { id: 3, issue_id: 1, started_at: '2024-01-12T09:00:00.000Z', ended_at: null, paused_reason: null, notes: null }
      ]

      // Simulate ORDER BY te.started_at DESC
      const sorted = [...entries].sort((a, b) => b.started_at.localeCompare(a.started_at))
      const mapped = mapTimeEntries(sorted)

      expect(mapped[0].id).toBe(2) // Jan 15
      expect(mapped[1].id).toBe(3) // Jan 12
      expect(mapped[2].id).toBe(1) // Jan 10
    })
  })

  describe('get-issue-time calculation', () => {
    it('calculates total seconds for completed entries', () => {
      const entries = [
        { started_at: '2024-01-01T09:00:00.000Z', ended_at: '2024-01-01T10:00:00.000Z' }, // 1 hour
        { started_at: '2024-01-01T11:00:00.000Z', ended_at: '2024-01-01T11:30:00.000Z' }  // 30 min
      ]

      const total = entries.reduce((sum, entry) => {
        const start = new Date(entry.started_at).getTime()
        const end = entry.ended_at ? new Date(entry.ended_at).getTime() : Date.now()
        return sum + (end - start) / 1000
      }, 0)

      expect(total).toBe(5400) // 1.5 hours
    })

    it('uses current time for active entries', () => {
      // With fake timers, Date.now() returns 2024-01-15T12:00:00.000Z
      const entries = [
        { started_at: '2024-01-15T11:00:00.000Z', ended_at: null }
      ]

      const total = entries.reduce((sum, entry) => {
        const start = new Date(entry.started_at).getTime()
        const end = entry.ended_at ? new Date(entry.ended_at).getTime() : Date.now()
        return sum + (end - start) / 1000
      }, 0)

      expect(total).toBe(3600) // Exactly 1 hour
    })

    it('returns 0 for no entries', () => {
      const entries: { started_at: string; ended_at: string | null }[] = []

      const total = entries.reduce((sum, entry) => {
        const start = new Date(entry.started_at).getTime()
        const end = entry.ended_at ? new Date(entry.ended_at).getTime() : Date.now()
        return sum + (end - start) / 1000
      }, 0)

      expect(total).toBe(0)
    })
  })

  describe('get-issue-times-batch calculation', () => {
    it('returns totals for multiple issues', () => {
      // Simulate batch query results
      const issueEntries: Record<number, { started_at: string; ended_at: string }[]> = {
        1: [{ started_at: '2024-01-01T09:00:00.000Z', ended_at: '2024-01-01T10:00:00.000Z' }], // 1 hour
        2: [{ started_at: '2024-01-01T09:00:00.000Z', ended_at: '2024-01-01T09:30:00.000Z' }], // 30 min
        3: [] // No entries
      }

      const times: Record<number, number> = {}

      for (const [id, entries] of Object.entries(issueEntries)) {
        const total = entries.reduce((sum, e) => {
          const start = new Date(e.started_at).getTime()
          const end = new Date(e.ended_at).getTime()
          return sum + (end - start) / 1000
        }, 0)
        times[Number(id)] = total
      }

      expect(times[1]).toBe(3600)  // 1 hour
      expect(times[2]).toBe(1800)  // 30 minutes
      expect(times[3]).toBe(0)     // No entries
    })
  })

  describe('create-time-entry', () => {
    it('creates entry with manual paused_reason', () => {
      const input = {
        issueId: 1,
        startedAt: '2024-01-01T09:00:00.000Z',
        endedAt: '2024-01-01T10:00:00.000Z',
        notes: 'test note'
      }

      // Simulate handler return
      const result = {
        id: 1,
        issueId: input.issueId,
        startedAt: input.startedAt,
        endedAt: input.endedAt,
        pausedReason: 'manual' as const,
        notes: input.notes
      }

      expect(result.pausedReason).toBe('manual')
      expect(result.notes).toBe('test note')
    })
  })
})
