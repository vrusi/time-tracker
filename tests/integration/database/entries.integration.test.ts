import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import type Database from 'better-sqlite3'
import { createTestDatabase, seedIssue, seedTimeEntry, isSqliteAvailable } from './db-setup'
import {
  type TimeEntryRow,
  type TimeEntryWithIssueRow,
  mapTimeEntry,
  mapTimeEntries,
  mapTimeEntriesWithIssue
} from '../../../electron/mappers'

/**
 * Handler integration tests: Time entry operations with real SQLite.
 * Tests time calculations, date ranges, and merge operations.
 *
 * Note: These tests require better-sqlite3 native module.
 * They will be skipped in non-Electron test environments.
 */
describe.skipIf(!isSqliteAvailable)('Entry Handlers Integration', () => {
  let db: Database.Database

  beforeEach(() => {
    db = createTestDatabase()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('date range queries', () => {
    it('returns entries with joined issue data for date range', () => {
      const issueId = seedIssue(db, { externalId: '#100', name: 'Feature Work' })

      seedTimeEntry(db, {
        issueId,
        startedAt: '2024-01-15T09:00:00Z',
        endedAt: '2024-01-15T10:00:00Z',
        notes: 'Morning session'
      })
      seedTimeEntry(db, {
        issueId,
        startedAt: '2024-01-15T14:00:00Z',
        endedAt: '2024-01-15T16:00:00Z'
      })
      // Entry outside range
      seedTimeEntry(db, {
        issueId,
        startedAt: '2024-01-20T09:00:00Z',
        endedAt: '2024-01-20T10:00:00Z'
      })

      const rows = db.prepare(`
        SELECT te.*, i.external_id, i.name, i.link, i.notes as issue_notes, i.archived, i.created_at as issue_created_at
        FROM time_entries te
        JOIN issues i ON te.issue_id = i.id
        WHERE te.started_at >= ? AND te.started_at <= ?
        ORDER BY te.started_at DESC
      `).all('2024-01-15T00:00:00Z', '2024-01-15T23:59:59Z') as TimeEntryWithIssueRow[]

      const entries = mapTimeEntriesWithIssue(rows)

      expect(entries).toHaveLength(2)
      expect(entries[0].issue.externalId).toBe('#100')
      expect(entries[0].issue.name).toBe('Feature Work')
      expect(entries[1].notes).toBe('Morning session')
    })

    it('returns empty array for date range with no entries', () => {
      const issueId = seedIssue(db)
      seedTimeEntry(db, {
        issueId,
        startedAt: '2024-01-15T09:00:00Z',
        endedAt: '2024-01-15T10:00:00Z'
      })

      const rows = db.prepare(`
        SELECT te.*, i.external_id, i.name, i.link, i.notes as issue_notes, i.archived, i.created_at as issue_created_at
        FROM time_entries te
        JOIN issues i ON te.issue_id = i.id
        WHERE te.started_at >= ? AND te.started_at <= ?
      `).all('2024-02-01T00:00:00Z', '2024-02-28T23:59:59Z') as TimeEntryWithIssueRow[]

      expect(rows).toHaveLength(0)
    })
  })

  describe('time calculations', () => {
    it('calculates total time for completed entries', () => {
      const issueId = seedIssue(db)

      // 1 hour
      seedTimeEntry(db, {
        issueId,
        startedAt: '2024-01-01T09:00:00.000Z',
        endedAt: '2024-01-01T10:00:00.000Z'
      })
      // 2 hours
      seedTimeEntry(db, {
        issueId,
        startedAt: '2024-01-01T14:00:00.000Z',
        endedAt: '2024-01-01T16:00:00.000Z'
      })

      const entries = db.prepare(`
        SELECT started_at, ended_at FROM time_entries WHERE issue_id = ?
      `).all(issueId) as Pick<TimeEntryRow, 'started_at' | 'ended_at'>[]

      const totalSeconds = entries.reduce((total, entry) => {
        const start = new Date(entry.started_at).getTime()
        const end = entry.ended_at ? new Date(entry.ended_at).getTime() : Date.now()
        return total + (end - start) / 1000
      }, 0)

      expect(totalSeconds).toBe(10800) // 3 hours in seconds
    })

    it('includes active entry in time calculation using current time', () => {
      vi.setSystemTime(new Date('2024-01-01T11:30:00.000Z'))

      const issueId = seedIssue(db)

      // Completed: 1 hour
      seedTimeEntry(db, {
        issueId,
        startedAt: '2024-01-01T09:00:00.000Z',
        endedAt: '2024-01-01T10:00:00.000Z'
      })
      // Active: started 30 min ago
      seedTimeEntry(db, {
        issueId,
        startedAt: '2024-01-01T11:00:00.000Z',
        endedAt: null
      })

      const entries = db.prepare(`
        SELECT started_at, ended_at FROM time_entries WHERE issue_id = ?
      `).all(issueId) as Pick<TimeEntryRow, 'started_at' | 'ended_at'>[]

      const totalSeconds = entries.reduce((total, entry) => {
        const start = new Date(entry.started_at).getTime()
        const end = entry.ended_at ? new Date(entry.ended_at).getTime() : Date.now()
        return total + (end - start) / 1000
      }, 0)

      expect(totalSeconds).toBe(5400) // 1.5 hours (1h completed + 30m active)
    })
  })

  describe('entry CRUD', () => {
    it('creates manual time entry', () => {
      const issueId = seedIssue(db)

      const result = db.prepare(`
        INSERT INTO time_entries (issue_id, started_at, ended_at, paused_reason, notes)
        VALUES (?, ?, ?, 'manual', ?)
      `).run(issueId, '2024-01-01T09:00:00Z', '2024-01-01T10:00:00Z', 'Manual entry note')

      const row = db.prepare('SELECT * FROM time_entries WHERE id = ?').get(result.lastInsertRowid) as TimeEntryRow
      const entry = mapTimeEntry(row)

      expect(entry.issueId).toBe(issueId)
      expect(entry.startedAt).toBe('2024-01-01T09:00:00Z')
      expect(entry.endedAt).toBe('2024-01-01T10:00:00Z')
      expect(entry.pausedReason).toBe('manual')
      expect(entry.notes).toBe('Manual entry note')
    })

    it('updates entry fields selectively', () => {
      const issueId = seedIssue(db)
      const entryId = seedTimeEntry(db, {
        issueId,
        startedAt: '2024-01-01T09:00:00Z',
        endedAt: '2024-01-01T10:00:00Z'
      })

      // Update only endedAt and notes
      db.prepare(`
        UPDATE time_entries SET ended_at = ?, notes = ? WHERE id = ?
      `).run('2024-01-01T11:00:00Z', 'Extended session', entryId)

      const row = db.prepare('SELECT * FROM time_entries WHERE id = ?').get(entryId) as TimeEntryRow
      const entry = mapTimeEntry(row)

      expect(entry.endedAt).toBe('2024-01-01T11:00:00Z')
      expect(entry.notes).toBe('Extended session')
      expect(entry.startedAt).toBe('2024-01-01T09:00:00Z') // Unchanged
    })

    it('deletes single entry', () => {
      const issueId = seedIssue(db)
      const entryId = seedTimeEntry(db, { issueId })

      db.prepare('DELETE FROM time_entries WHERE id = ?').run(entryId)

      const row = db.prepare('SELECT * FROM time_entries WHERE id = ?').get(entryId)
      expect(row).toBeUndefined()
    })

    it('deletes multiple entries by ID list', () => {
      const issueId = seedIssue(db)
      const id1 = seedTimeEntry(db, { issueId, startedAt: '2024-01-01T09:00:00Z' })
      const id2 = seedTimeEntry(db, { issueId, startedAt: '2024-01-01T10:00:00Z' })
      const id3 = seedTimeEntry(db, { issueId, startedAt: '2024-01-01T11:00:00Z' })

      const idsToDelete = [id1, id3]
      const placeholders = idsToDelete.map(() => '?').join(',')

      db.prepare(`DELETE FROM time_entries WHERE id IN (${placeholders})`).run(...idsToDelete)

      const remaining = db.prepare('SELECT * FROM time_entries').all()
      expect(remaining).toHaveLength(1)
    })
  })

  describe('entry merge', () => {
    it('merge combines time span from multiple entries', () => {
      const issueId = seedIssue(db)

      const id1 = seedTimeEntry(db, {
        issueId,
        startedAt: '2024-01-01T09:00:00Z',
        endedAt: '2024-01-01T10:00:00Z'
      })
      const id2 = seedTimeEntry(db, {
        issueId,
        startedAt: '2024-01-01T14:00:00Z',
        endedAt: '2024-01-01T16:00:00Z'
      })
      const id3 = seedTimeEntry(db, {
        issueId,
        startedAt: '2024-01-01T11:00:00Z',
        endedAt: '2024-01-01T12:00:00Z'
      })

      const ids = [id1, id2, id3]
      const placeholders = ids.map(() => '?').join(',')
      const entries = db.prepare(`
        SELECT * FROM time_entries WHERE id IN (${placeholders})
      `).all(...ids) as TimeEntryRow[]

      // Calculate min start and max end
      const startTimes = entries.map(e => new Date(e.started_at).getTime())
      const endTimes = entries.filter(e => e.ended_at).map(e => new Date(e.ended_at!).getTime())

      const minStart = new Date(Math.min(...startTimes)).toISOString()
      const maxEnd = new Date(Math.max(...endTimes)).toISOString()

      // Create merged entry
      const result = db.prepare(`
        INSERT INTO time_entries (issue_id, started_at, ended_at, paused_reason)
        VALUES (?, ?, ?, 'merged')
      `).run(issueId, minStart, maxEnd)

      // Delete originals
      db.prepare(`DELETE FROM time_entries WHERE id IN (${placeholders})`).run(...ids)

      const merged = db.prepare('SELECT * FROM time_entries WHERE id = ?').get(result.lastInsertRowid) as TimeEntryRow

      expect(merged.started_at).toBe('2024-01-01T09:00:00.000Z') // Earliest
      expect(merged.ended_at).toBe('2024-01-01T16:00:00.000Z') // Latest
      expect(merged.paused_reason).toBe('merged')
    })

    it('merge combines notes from all entries', () => {
      const issueId = seedIssue(db)

      const id1 = seedTimeEntry(db, {
        issueId,
        startedAt: '2024-01-01T09:00:00Z',
        endedAt: '2024-01-01T10:00:00Z',
        notes: 'First note'
      })
      const id2 = seedTimeEntry(db, {
        issueId,
        startedAt: '2024-01-01T11:00:00Z',
        endedAt: '2024-01-01T12:00:00Z',
        notes: 'Second note'
      })
      const id3 = seedTimeEntry(db, {
        issueId,
        startedAt: '2024-01-01T13:00:00Z',
        endedAt: '2024-01-01T14:00:00Z',
        notes: null // No notes
      })

      const ids = [id1, id2, id3]
      const placeholders = ids.map(() => '?').join(',')
      const entries = db.prepare(`
        SELECT * FROM time_entries WHERE id IN (${placeholders})
      `).all(...ids) as TimeEntryRow[]

      const combinedNotes = entries
        .map(e => e.notes)
        .filter(n => n && n.trim())
        .join('\n---\n')

      const result = db.prepare(`
        INSERT INTO time_entries (issue_id, started_at, ended_at, paused_reason, notes)
        VALUES (?, ?, ?, 'merged', ?)
      `).run(issueId, '2024-01-01T09:00:00Z', '2024-01-01T14:00:00Z', combinedNotes)

      const merged = db.prepare('SELECT * FROM time_entries WHERE id = ?').get(result.lastInsertRowid) as TimeEntryRow

      expect(merged.notes).toBe('First note\n---\nSecond note')
    })

    it('merge uses first entry issue ID as target', () => {
      const issue1 = seedIssue(db, { name: 'Issue 1' })
      const issue2 = seedIssue(db, { name: 'Issue 2' })

      const id1 = seedTimeEntry(db, {
        issueId: issue1,
        startedAt: '2024-01-01T09:00:00Z',
        endedAt: '2024-01-01T10:00:00Z'
      })
      const id2 = seedTimeEntry(db, {
        issueId: issue2,
        startedAt: '2024-01-01T11:00:00Z',
        endedAt: '2024-01-01T12:00:00Z'
      })

      // Order matters: first ID determines target issue
      const ids = [id1, id2]
      const entries = db.prepare(`
        SELECT * FROM time_entries WHERE id IN (?, ?)
      `).all(...ids) as TimeEntryRow[]

      // Sort to match input order
      const sortedEntries = ids.map(id => entries.find(e => e.id === id)!)
      const targetIssueId = sortedEntries[0].issue_id

      const result = db.prepare(`
        INSERT INTO time_entries (issue_id, started_at, ended_at, paused_reason)
        VALUES (?, ?, ?, 'merged')
      `).run(targetIssueId, '2024-01-01T09:00:00Z', '2024-01-01T12:00:00Z')

      const merged = db.prepare('SELECT * FROM time_entries WHERE id = ?').get(result.lastInsertRowid) as TimeEntryRow

      expect(merged.issue_id).toBe(issue1) // First entry's issue
    })
  })

  describe('issue entries query', () => {
    it('returns all entries for specific issue ordered by started_at desc', () => {
      const issue1 = seedIssue(db)
      const issue2 = seedIssue(db)

      seedTimeEntry(db, { issueId: issue1, startedAt: '2024-01-01T09:00:00Z' })
      seedTimeEntry(db, { issueId: issue1, startedAt: '2024-01-03T09:00:00Z' })
      seedTimeEntry(db, { issueId: issue1, startedAt: '2024-01-02T09:00:00Z' })
      seedTimeEntry(db, { issueId: issue2, startedAt: '2024-01-01T09:00:00Z' }) // Different issue

      const rows = db.prepare(`
        SELECT * FROM time_entries WHERE issue_id = ? ORDER BY started_at DESC
      `).all(issue1) as TimeEntryRow[]
      const entries = mapTimeEntries(rows)

      expect(entries).toHaveLength(3)
      expect(entries[0].startedAt).toBe('2024-01-03T09:00:00Z')
      expect(entries[1].startedAt).toBe('2024-01-02T09:00:00Z')
      expect(entries[2].startedAt).toBe('2024-01-01T09:00:00Z')
    })
  })
})
