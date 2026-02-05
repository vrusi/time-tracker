import { describe, it, expect, beforeEach } from 'vitest'
import type Database from 'better-sqlite3'
import { createTestDatabase, seedIssue, seedTimeEntry, isSqliteAvailable } from './db-setup'
import { type IssueRow, mapIssue, mapIssues } from '../../../electron/mappers'

/**
 * Handler integration tests: Issue CRUD operations with real SQLite.
 * Tests actual SQL queries against in-memory database.
 *
 * Note: These tests require better-sqlite3 native module.
 * They will be skipped in non-Electron test environments.
 */
describe.skipIf(!isSqliteAvailable)('Issue Handlers Integration', () => {
  let db: Database.Database

  beforeEach(() => {
    db = createTestDatabase()
  })

  describe('CRUD operations', () => {
    it('creates issue with all fields persisted correctly', () => {
      const now = new Date().toISOString()
      const result = db.prepare(`
        INSERT INTO issues (external_id, name, link, notes, archived, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run('#456', 'New Feature', 'https://github.com/org/repo/issues/456', 'Some notes', 0, now)

      const row = db.prepare('SELECT * FROM issues WHERE id = ?').get(result.lastInsertRowid) as IssueRow
      const issue = mapIssue(row)

      expect(issue.id).toBe(result.lastInsertRowid)
      expect(issue.externalId).toBe('#456')
      expect(issue.name).toBe('New Feature')
      expect(issue.link).toBe('https://github.com/org/repo/issues/456')
      expect(issue.notes).toBe('Some notes')
      expect(issue.archived).toBe(false)
      expect(issue.createdAt).toBe(now)
    })

    it('reads issue by ID', () => {
      const issueId = seedIssue(db, { externalId: '#789', name: 'Read Test' })

      const row = db.prepare('SELECT * FROM issues WHERE id = ?').get(issueId) as IssueRow
      const issue = mapIssue(row)

      expect(issue.id).toBe(issueId)
      expect(issue.externalId).toBe('#789')
      expect(issue.name).toBe('Read Test')
    })

    it('updates issue fields selectively', () => {
      const issueId = seedIssue(db, {
        externalId: '#100',
        name: 'Original',
        link: 'https://original.com'
      })

      // Update only name and notes
      db.prepare(`
        UPDATE issues SET name = ?, notes = ? WHERE id = ?
      `).run('Updated Name', 'Added notes', issueId)

      const row = db.prepare('SELECT * FROM issues WHERE id = ?').get(issueId) as IssueRow
      const issue = mapIssue(row)

      expect(issue.name).toBe('Updated Name')
      expect(issue.notes).toBe('Added notes')
      expect(issue.link).toBe('https://original.com') // Unchanged
      expect(issue.externalId).toBe('#100') // Unchanged
    })

    it('deletes issue', () => {
      const issueId = seedIssue(db)

      db.prepare('DELETE FROM issues WHERE id = ?').run(issueId)

      const row = db.prepare('SELECT * FROM issues WHERE id = ?').get(issueId)
      expect(row).toBeUndefined()
    })

    it('deletes issue along with its time entries', () => {
      const issueId = seedIssue(db)
      seedTimeEntry(db, { issueId, startedAt: '2024-01-01T09:00:00Z', endedAt: '2024-01-01T10:00:00Z' })
      seedTimeEntry(db, { issueId, startedAt: '2024-01-01T11:00:00Z', endedAt: '2024-01-01T12:00:00Z' })

      // Delete entries first (FK constraint)
      db.prepare('DELETE FROM time_entries WHERE issue_id = ?').run(issueId)
      db.prepare('DELETE FROM issues WHERE id = ?').run(issueId)

      const entries = db.prepare('SELECT * FROM time_entries WHERE issue_id = ?').all(issueId)
      expect(entries).toHaveLength(0)
    })
  })

  describe('filtering', () => {
    it('filters archived issues when includeArchived is false', () => {
      seedIssue(db, { externalId: '#1', name: 'Active 1', archived: false })
      seedIssue(db, { externalId: '#2', name: 'Active 2', archived: false })
      seedIssue(db, { externalId: '#3', name: 'Archived', archived: true })

      const activeRows = db.prepare(
        'SELECT * FROM issues WHERE archived = 0 ORDER BY created_at DESC'
      ).all() as IssueRow[]

      expect(mapIssues(activeRows)).toHaveLength(2)
      expect(activeRows.every(r => r.archived === 0)).toBe(true)
    })

    it('includes all issues when includeArchived is true', () => {
      seedIssue(db, { externalId: '#1', archived: false })
      seedIssue(db, { externalId: '#2', archived: true })

      const allRows = db.prepare(
        'SELECT * FROM issues ORDER BY created_at DESC'
      ).all() as IssueRow[]

      expect(mapIssues(allRows)).toHaveLength(2)
    })

    it('orders issues by created_at descending', () => {
      seedIssue(db, { externalId: '#1', createdAt: '2024-01-01T00:00:00Z' })
      seedIssue(db, { externalId: '#2', createdAt: '2024-01-03T00:00:00Z' })
      seedIssue(db, { externalId: '#3', createdAt: '2024-01-02T00:00:00Z' })

      const rows = db.prepare(
        'SELECT * FROM issues ORDER BY created_at DESC'
      ).all() as IssueRow[]
      const issues = mapIssues(rows)

      expect(issues[0].externalId).toBe('#2') // Most recent
      expect(issues[1].externalId).toBe('#3')
      expect(issues[2].externalId).toBe('#1') // Oldest
    })
  })

  describe('archive operations', () => {
    it('archives issue by setting archived = 1', () => {
      const issueId = seedIssue(db, { archived: false })

      db.prepare('UPDATE issues SET archived = 1 WHERE id = ?').run(issueId)

      const row = db.prepare('SELECT * FROM issues WHERE id = ?').get(issueId) as IssueRow
      expect(mapIssue(row).archived).toBe(true)
    })

    it('unarchives issue by setting archived = 0', () => {
      const issueId = seedIssue(db, { archived: true })

      db.prepare('UPDATE issues SET archived = 0 WHERE id = ?').run(issueId)

      const row = db.prepare('SELECT * FROM issues WHERE id = ?').get(issueId) as IssueRow
      expect(mapIssue(row).archived).toBe(false)
    })
  })

  describe('merge operations', () => {
    it('merge moves all time entries from source to target', () => {
      const targetId = seedIssue(db, { externalId: '#target', name: 'Target Issue' })
      const sourceId = seedIssue(db, { externalId: '#source', name: 'Source Issue' })

      // Create entries on both issues
      seedTimeEntry(db, { issueId: targetId, startedAt: '2024-01-01T09:00:00Z', endedAt: '2024-01-01T10:00:00Z' })
      seedTimeEntry(db, { issueId: sourceId, startedAt: '2024-01-01T11:00:00Z', endedAt: '2024-01-01T12:00:00Z' })
      seedTimeEntry(db, { issueId: sourceId, startedAt: '2024-01-01T13:00:00Z', endedAt: '2024-01-01T14:00:00Z' })

      // Merge: move entries from source to target
      db.prepare('UPDATE time_entries SET issue_id = ? WHERE issue_id = ?').run(targetId, sourceId)
      // Delete source issue
      db.prepare('DELETE FROM issues WHERE id = ?').run(sourceId)

      // Verify all entries now belong to target
      const targetEntries = db.prepare('SELECT * FROM time_entries WHERE issue_id = ?').all(targetId)
      expect(targetEntries).toHaveLength(3)

      const sourceEntries = db.prepare('SELECT * FROM time_entries WHERE issue_id = ?').all(sourceId)
      expect(sourceEntries).toHaveLength(0)

      // Source issue should be deleted
      const sourceIssue = db.prepare('SELECT * FROM issues WHERE id = ?').get(sourceId)
      expect(sourceIssue).toBeUndefined()
    })

    it('merge preserves time entry data', () => {
      const targetId = seedIssue(db, { name: 'Target' })
      const sourceId = seedIssue(db, { name: 'Source' })

      const entryId = seedTimeEntry(db, {
        issueId: sourceId,
        startedAt: '2024-01-01T09:00:00Z',
        endedAt: '2024-01-01T10:00:00Z',
        notes: 'Important work'
      })

      db.prepare('UPDATE time_entries SET issue_id = ? WHERE issue_id = ?').run(targetId, sourceId)

      const row = db.prepare('SELECT * FROM time_entries WHERE id = ?').get(entryId) as any
      expect(row.issue_id).toBe(targetId)
      expect(row.notes).toBe('Important work')
      expect(row.started_at).toBe('2024-01-01T09:00:00Z')
      expect(row.ended_at).toBe('2024-01-01T10:00:00Z')
    })
  })

  describe('bulk operations', () => {
    it('deletes multiple issues by ID list', () => {
      const id1 = seedIssue(db, { externalId: '#1' })
      const id2 = seedIssue(db, { externalId: '#2' })
      const id3 = seedIssue(db, { externalId: '#3' })

      const idsToDelete = [id1, id3]
      const placeholders = idsToDelete.map(() => '?').join(',')

      db.prepare(`DELETE FROM issues WHERE id IN (${placeholders})`).run(...idsToDelete)

      const remaining = db.prepare('SELECT * FROM issues').all() as IssueRow[]
      expect(remaining).toHaveLength(1)
      expect(remaining[0].id).toBe(id2)
    })
  })
})
