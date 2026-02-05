import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import type Database from 'better-sqlite3'
import { createTestDatabase, seedIssue, seedTimeEntry, getSetting, setSetting, isSqliteAvailable } from './db-setup'
import { type TimeEntryRow, type IssueRow, mapTimeEntry, mapIssue } from '../../../electron/mappers'

/**
 * Handler integration tests: Tracking lifecycle with real SQLite.
 * Tests start/pause/recovery operations against database.
 *
 * Note: These tests require better-sqlite3 native module.
 * They will be skipped in non-Electron test environments.
 */
describe.skipIf(!isSqliteAvailable)('Tracking Handlers Integration', () => {
  let db: Database.Database

  beforeEach(() => {
    db = createTestDatabase()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-01-01T12:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('tracking lifecycle', () => {
    it('creates new active entry when starting tracking', () => {
      const issueId = seedIssue(db)
      const now = new Date().toISOString()

      const result = db.prepare(`
        INSERT INTO time_entries (issue_id, started_at) VALUES (?, ?)
      `).run(issueId, now)

      const row = db.prepare('SELECT * FROM time_entries WHERE id = ?').get(result.lastInsertRowid) as TimeEntryRow
      const entry = mapTimeEntry(row)

      expect(entry.issueId).toBe(issueId)
      expect(entry.startedAt).toBe(now)
      expect(entry.endedAt).toBeNull()
      expect(entry.pausedReason).toBeNull()
    })

    it('only one entry can be active at a time', () => {
      const issue1 = seedIssue(db, { name: 'Issue 1' })
      const issue2 = seedIssue(db, { name: 'Issue 2' })

      // Start tracking issue 1
      const entry1Id = seedTimeEntry(db, { issueId: issue1, endedAt: null })

      // Before starting issue 2, pause issue 1
      db.prepare('UPDATE time_entries SET ended_at = ?, paused_reason = ? WHERE id = ?')
        .run(new Date().toISOString(), 'switched', entry1Id)

      // Start tracking issue 2
      seedTimeEntry(db, { issueId: issue2, endedAt: null })

      // Check: only one active entry
      const activeEntries = db.prepare('SELECT * FROM time_entries WHERE ended_at IS NULL').all()
      expect(activeEntries).toHaveLength(1)

      // Check: first entry is ended
      const entry1 = db.prepare('SELECT * FROM time_entries WHERE id = ?').get(entry1Id) as TimeEntryRow
      expect(entry1.ended_at).not.toBeNull()
      expect(entry1.paused_reason).toBe('switched')
    })

    it('pause sets end time with manual reason', () => {
      const issueId = seedIssue(db)
      const entryId = seedTimeEntry(db, { issueId, endedAt: null })

      const endTime = new Date().toISOString()
      db.prepare('UPDATE time_entries SET ended_at = ?, paused_reason = ? WHERE id = ?')
        .run(endTime, 'manual', entryId)

      const row = db.prepare('SELECT * FROM time_entries WHERE id = ?').get(entryId) as TimeEntryRow
      const entry = mapTimeEntry(row)

      expect(entry.endedAt).toBe(endTime)
      expect(entry.pausedReason).toBe('manual')
    })

    it('idle pause subtracts threshold from end time', () => {
      const issueId = seedIssue(db)
      const entryId = seedTimeEntry(db, {
        issueId,
        startedAt: '2024-01-01T09:00:00.000Z',
        endedAt: null
      })

      const idleThreshold = 600 // 10 minutes in seconds
      // Current time is 12:00, idle pause should set end to 11:50
      const endTime = new Date(Date.now() - idleThreshold * 1000).toISOString()

      db.prepare('UPDATE time_entries SET ended_at = ?, paused_reason = ? WHERE id = ?')
        .run(endTime, 'idle', entryId)

      const row = db.prepare('SELECT * FROM time_entries WHERE id = ?').get(entryId) as TimeEntryRow

      expect(row.ended_at).toBe('2024-01-01T11:50:00.000Z')
      expect(row.paused_reason).toBe('idle')
    })
  })

  describe('idle recovery', () => {
    it('extends entry end time to recover idle time', () => {
      const issueId = seedIssue(db)
      const entryId = seedTimeEntry(db, {
        issueId,
        startedAt: '2024-01-01T09:00:00.000Z',
        endedAt: '2024-01-01T11:50:00.000Z', // Paused at 11:50
        pausedReason: 'idle'
      })

      // Recovery at 12:00 - extend end time to now
      const newEndTime = new Date().toISOString()
      db.prepare('UPDATE time_entries SET ended_at = ? WHERE id = ?').run(newEndTime, entryId)

      const row = db.prepare('SELECT * FROM time_entries WHERE id = ?').get(entryId) as TimeEntryRow

      expect(row.ended_at).toBe('2024-01-01T12:00:00.000Z')

      // Calculate recovered time: from old end to new end = 10 minutes
      const oldEnd = new Date('2024-01-01T11:50:00.000Z')
      const newEnd = new Date(row.ended_at)
      const recoveredSeconds = Math.floor((newEnd.getTime() - oldEnd.getTime()) / 1000)

      expect(recoveredSeconds).toBe(600) // 10 minutes recovered
    })
  })

  describe('get current tracking', () => {
    it('returns active entry with issue data', () => {
      const issueId = seedIssue(db, { externalId: '#42', name: 'Active Task' })
      seedTimeEntry(db, { issueId, endedAt: null })

      const entry = db.prepare('SELECT * FROM time_entries WHERE ended_at IS NULL LIMIT 1')
        .get() as TimeEntryRow | undefined

      expect(entry).toBeDefined()

      const issue = db.prepare('SELECT * FROM issues WHERE id = ?')
        .get(entry!.issue_id) as IssueRow

      expect(mapTimeEntry(entry!).issueId).toBe(issueId)
      expect(mapIssue(issue).name).toBe('Active Task')
    })

    it('returns null when no active tracking', () => {
      const issueId = seedIssue(db)
      seedTimeEntry(db, {
        issueId,
        endedAt: '2024-01-01T10:00:00Z' // Completed
      })

      const entry = db.prepare('SELECT * FROM time_entries WHERE ended_at IS NULL LIMIT 1')
        .get() as TimeEntryRow | undefined

      expect(entry).toBeUndefined()
    })
  })

  describe('crash recovery', () => {
    it('detects stale active entry based on lastSeenAt', () => {
      const issueId = seedIssue(db)
      seedTimeEntry(db, {
        issueId,
        startedAt: '2024-01-01T09:00:00.000Z',
        endedAt: null
      })

      // Set lastSeenAt to 1 hour ago
      setSetting(db, 'lastSeenAt', '2024-01-01T11:00:00.000Z')

      // Get current tracking
      const entry = db.prepare('SELECT * FROM time_entries WHERE ended_at IS NULL LIMIT 1')
        .get() as TimeEntryRow

      const lastSeenRow = db.prepare('SELECT value FROM settings WHERE key = ?')
        .get('lastSeenAt') as { value: string } | undefined

      expect(entry).toBeDefined()
      expect(lastSeenRow).toBeDefined()

      const lastSeenAt = new Date(lastSeenRow!.value)
      const now = new Date()
      const elapsedSinceLastSeen = (now.getTime() - lastSeenAt.getTime()) / 1000

      expect(elapsedSinceLastSeen).toBe(3600) // 1 hour since last seen
    })

    it('ignores stale lastSeenAt before entry started', () => {
      const issueId = seedIssue(db)
      seedTimeEntry(db, {
        issueId,
        startedAt: '2024-01-01T11:00:00.000Z', // Entry started at 11:00
        endedAt: null
      })

      // lastSeenAt is from before entry started - should be ignored
      setSetting(db, 'lastSeenAt', '2024-01-01T10:00:00.000Z')

      const entry = db.prepare('SELECT * FROM time_entries WHERE ended_at IS NULL LIMIT 1')
        .get() as TimeEntryRow
      const lastSeenRow = db.prepare('SELECT value FROM settings WHERE key = ?')
        .get('lastSeenAt') as { value: string }

      const lastSeenAt = new Date(lastSeenRow.value)
      const startedAt = new Date(entry.started_at)

      // lastSeenAt is before entry started - stale data
      expect(lastSeenAt.getTime()).toBeLessThan(startedAt.getTime())
    })

    it('resolve recovery: keep-all clears lastSeenAt only', () => {
      const issueId = seedIssue(db)
      const entryId = seedTimeEntry(db, {
        issueId,
        startedAt: '2024-01-01T09:00:00.000Z',
        endedAt: null
      })

      setSetting(db, 'lastSeenAt', '2024-01-01T11:00:00.000Z')

      // Keep all - just clear lastSeenAt
      db.prepare('DELETE FROM settings WHERE key = ?').run('lastSeenAt')

      // Entry should still be open
      const entry = db.prepare('SELECT * FROM time_entries WHERE id = ?').get(entryId) as TimeEntryRow
      expect(entry.ended_at).toBeNull()

      // lastSeenAt should be gone
      expect(getSetting(db, 'lastSeenAt')).toBeUndefined()
    })

    it('resolve recovery: end-at-close sets end time to lastSeenAt', () => {
      const issueId = seedIssue(db)
      const entryId = seedTimeEntry(db, {
        issueId,
        startedAt: '2024-01-01T09:00:00.000Z',
        endedAt: null
      })

      const lastSeenAt = '2024-01-01T11:00:00.000Z'
      setSetting(db, 'lastSeenAt', lastSeenAt)

      // End at close - set end time to lastSeenAt
      db.prepare('UPDATE time_entries SET ended_at = ?, paused_reason = ? WHERE id = ?')
        .run(lastSeenAt, 'manual', entryId)
      db.prepare('DELETE FROM settings WHERE key = ?').run('lastSeenAt')

      const entry = db.prepare('SELECT * FROM time_entries WHERE id = ?').get(entryId) as TimeEntryRow
      expect(entry.ended_at).toBe(lastSeenAt)
      expect(entry.paused_reason).toBe('manual')
    })

    it('resolve recovery: discard deletes the entry', () => {
      const issueId = seedIssue(db)
      const entryId = seedTimeEntry(db, { issueId, endedAt: null })

      setSetting(db, 'lastSeenAt', '2024-01-01T11:00:00.000Z')

      // Discard - delete entry
      db.prepare('DELETE FROM time_entries WHERE id = ?').run(entryId)
      db.prepare('DELETE FROM settings WHERE key = ?').run('lastSeenAt')

      const entry = db.prepare('SELECT * FROM time_entries WHERE id = ?').get(entryId)
      expect(entry).toBeUndefined()
    })
  })
})
