import { ipcMain } from 'electron'
import type { TimeEntry } from '../../src/types'
import { type TimeEntryRow, type TimeEntryWithIssueRow, mapTimeEntry, mapTimeEntries, mapTimeEntriesWithIssue } from '../mappers'
import { db } from '../db'

export function setupEntryHandlers() {
  // Get time entries with issue data for a date range (used in History view)
  ipcMain.handle('get-time-entries', (_, startDate: string, endDate: string) => {
    const entries = db.prepare(`
      SELECT te.*, i.external_id, i.name, i.link, i.notes as issue_notes, i.archived, i.created_at as issue_created_at
      FROM time_entries te
      JOIN issues i ON te.issue_id = i.id
      WHERE te.started_at >= ? AND te.started_at <= ?
      ORDER BY te.started_at DESC
    `).all(startDate, endDate) as TimeEntryWithIssueRow[]

    return mapTimeEntriesWithIssue(entries)
  })

  // Get total time tracked for a specific issue
  ipcMain.handle('get-issue-time', (_, issueId: number) => {
    const entries = db.prepare(`
      SELECT started_at, ended_at FROM time_entries WHERE issue_id = ?
    `).all(issueId) as Pick<TimeEntryRow, 'started_at' | 'ended_at'>[]

    return entries.reduce((total, entry) => {
      const start = new Date(entry.started_at).getTime()
      const end = entry.ended_at ? new Date(entry.ended_at).getTime() : Date.now()
      return total + (end - start) / 1000
    }, 0)
  })

  // Get total time tracked for multiple issues in a single batch call
  ipcMain.handle('get-issue-times-batch', (_, issueIds: number[]) => {
    const times: Record<number, number> = {}
    for (const id of issueIds) {
      const result = db.prepare(`
        SELECT COALESCE(SUM(
          CASE
            WHEN ended_at IS NULL THEN (julianday('now') - julianday(started_at)) * 86400
            ELSE (julianday(ended_at) - julianday(started_at)) * 86400
          END
        ), 0) as total_seconds
        FROM time_entries WHERE issue_id = ?
      `).get(id) as { total_seconds: number }
      times[id] = Math.floor(result.total_seconds)
    }
    return times
  })

  // Get all entries for a specific issue
  ipcMain.handle('get-issue-entries', (_, issueId: number) => {
    const entries = db.prepare(`
      SELECT id, issue_id, started_at, ended_at, paused_reason, notes
      FROM time_entries
      WHERE issue_id = ?
      ORDER BY started_at DESC
    `).all(issueId) as TimeEntryRow[]

    return mapTimeEntries(entries)
  })

  // Create a new time entry (manual entry creation)
  ipcMain.handle('create-time-entry', (_, issueId: number, startedAt: string, endedAt: string, notes?: string) => {
    const result = db.prepare(`
      INSERT INTO time_entries (issue_id, started_at, ended_at, paused_reason, notes)
      VALUES (?, ?, ?, 'manual', ?)
    `).run(issueId, startedAt, endedAt, notes || null)

    return {
      id: result.lastInsertRowid as number,
      issueId,
      startedAt,
      endedAt,
      pausedReason: 'manual',
      notes: notes || null
    } as TimeEntry
  })

  // Update an existing time entry
  ipcMain.handle('update-time-entry', (_, id: number, updates: { startedAt?: string; endedAt?: string; notes?: string }) => {
    const fields: string[] = []
    const values: any[] = []

    if (updates.startedAt !== undefined) {
      fields.push('started_at = ?')
      values.push(updates.startedAt)
    }
    if (updates.endedAt !== undefined) {
      fields.push('ended_at = ?')
      values.push(updates.endedAt)
    }
    if (updates.notes !== undefined) {
      fields.push('notes = ?')
      values.push(updates.notes)
    }

    if (fields.length > 0) {
      values.push(id)
      db.prepare(`UPDATE time_entries SET ${fields.join(', ')} WHERE id = ?`).run(...values)
    }

    const row = db.prepare('SELECT * FROM time_entries WHERE id = ?').get(id) as TimeEntryRow
    return mapTimeEntry(row)
  })

  // Delete a single time entry
  ipcMain.handle('delete-time-entry', (_, id: number) => {
    db.prepare('DELETE FROM time_entries WHERE id = ?').run(id)
  })

  // Delete multiple time entries (bulk delete)
  ipcMain.handle('delete-time-entries', (_, ids: number[]) => {
    if (ids.length === 0) return
    const placeholders = ids.map(() => '?').join(',')
    db.prepare(`DELETE FROM time_entries WHERE id IN (${placeholders})`).run(...ids)
  })

  // Wipe all data from the database
  ipcMain.handle('wipe-database', () => {
    db.exec('DELETE FROM time_entries; DELETE FROM issues;')
  })
}
