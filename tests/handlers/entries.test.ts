import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  mapTimeEntry,
  mapTimeEntries,
  mapTimeEntriesWithIssue,
  type TimeEntryRow,
  type TimeEntryWithIssueRow
} from '../../electron/mappers/entry.mapper'

/**
 * Entry Mapper - transforms database rows to domain objects.
 * This is the testable boundary between SQLite and the app.
 */
describe('Entry Mapper', () => {
  describe('mapTimeEntry', () => {
    it('transforms database row to TimeEntry domain object', () => {
      const row: TimeEntryRow = {
        id: 1,
        issue_id: 42,
        started_at: '2024-01-15T09:00:00.000Z',
        ended_at: '2024-01-15T10:00:00.000Z',
        paused_reason: 'manual',
        notes: 'Some work notes'
      }

      const entry = mapTimeEntry(row)

      expect(entry).toEqual({
        id: 1,
        issueId: 42,
        startedAt: '2024-01-15T09:00:00.000Z',
        endedAt: '2024-01-15T10:00:00.000Z',
        pausedReason: 'manual',
        notes: 'Some work notes'
      })
    })

    it('preserves null values for active entries', () => {
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
      expect(entry.notes).toBeNull()
    })

    it('accepts all valid paused_reason values', () => {
      const reasons = ['manual', 'idle', 'switched', null] as const

      reasons.forEach(reason => {
        const row: TimeEntryRow = {
          id: 1, issue_id: 1,
          started_at: '2024-01-01T09:00:00.000Z',
          ended_at: '2024-01-01T10:00:00.000Z',
          paused_reason: reason,
          notes: null
        }

        expect(mapTimeEntry(row).pausedReason).toBe(reason)
      })
    })
  })

  describe('mapTimeEntries', () => {
    it('transforms array of database rows', () => {
      const rows: TimeEntryRow[] = [
        { id: 1, issue_id: 1, started_at: '2024-01-15T09:00:00.000Z', ended_at: '2024-01-15T10:00:00.000Z', paused_reason: null, notes: null },
        { id: 2, issue_id: 1, started_at: '2024-01-15T11:00:00.000Z', ended_at: null, paused_reason: null, notes: null }
      ]

      const entries = mapTimeEntries(rows)

      expect(entries).toHaveLength(2)
      expect(entries[0].id).toBe(1)
      expect(entries[1].id).toBe(2)
    })
  })

  describe('mapTimeEntriesWithIssue', () => {
    it('transforms joined entry+issue rows to nested objects', () => {
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

      const result = mapTimeEntriesWithIssue([row])

      expect(result).toHaveLength(1)
      expect(result[0].id).toBe(1)
      expect(result[0].issue.id).toBe(42)
      expect(result[0].issue.externalId).toBe('#123')
      expect(result[0].issue.name).toBe('Test Issue')
      expect(result[0].issue.archived).toBe(false)
    })
  })
})

/**
 * Time Calculation Logic - business rules for aggregating tracked time.
 */
describe('Time Calculation Logic', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-01-15T12:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('entry duration calculation', () => {
    function calculateDuration(entry: { started_at: string; ended_at: string | null }): number {
      const start = new Date(entry.started_at).getTime()
      const end = entry.ended_at ? new Date(entry.ended_at).getTime() : Date.now()
      return (end - start) / 1000
    }

    it('calculates duration from start to end for completed entries', () => {
      const entry = {
        started_at: '2024-01-15T09:00:00.000Z',
        ended_at: '2024-01-15T10:00:00.000Z'
      }

      expect(calculateDuration(entry)).toBe(3600) // 1 hour
    })

    it('uses current time for active (unended) entries', () => {
      const entry = {
        started_at: '2024-01-15T11:00:00.000Z',
        ended_at: null
      }

      // With fake timers at 12:00, should be 1 hour
      expect(calculateDuration(entry)).toBe(3600)
    })
  })

  describe('entry merging', () => {
    it('calculates merged time span from multiple entries', () => {
      const entries = [
        { started_at: '2024-01-15T09:00:00.000Z', ended_at: '2024-01-15T10:00:00.000Z' },
        { started_at: '2024-01-15T08:00:00.000Z', ended_at: '2024-01-15T08:30:00.000Z' },
        { started_at: '2024-01-15T10:30:00.000Z', ended_at: '2024-01-15T11:00:00.000Z' }
      ]

      const startTimes = entries.map(e => new Date(e.started_at).getTime())
      const endTimes = entries.map(e => new Date(e.ended_at!).getTime())

      const minStart = new Date(Math.min(...startTimes)).toISOString()
      const maxEnd = new Date(Math.max(...endTimes)).toISOString()

      expect(minStart).toBe('2024-01-15T08:00:00.000Z')
      expect(maxEnd).toBe('2024-01-15T11:00:00.000Z')
    })

    it('combines notes from merged entries', () => {
      const entries = [
        { notes: 'First task' },
        { notes: 'Second task' },
        { notes: null }
      ]

      const combinedNotes = entries
        .map(e => e.notes)
        .filter(n => n && n.trim())
        .join('\n---\n')

      expect(combinedNotes).toBe('First task\n---\nSecond task')
    })
  })
})
