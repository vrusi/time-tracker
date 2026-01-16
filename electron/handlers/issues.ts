import { ipcMain } from 'electron'
import type Database from 'better-sqlite3'
import type { Issue } from '../../src/types'
import { type IssueRow, mapIssue, mapIssues } from '../mappers'

export function setupIssueHandlers(db: Database.Database) {
  ipcMain.handle('get-issues', (_, includeArchived = false) => {
    const query = includeArchived
      ? 'SELECT * FROM issues ORDER BY created_at DESC'
      : 'SELECT * FROM issues WHERE archived = 0 ORDER BY created_at DESC'

    return mapIssues(db.prepare(query).all() as IssueRow[])
  })

  ipcMain.handle('create-issue', (_, issue: Omit<Issue, 'id' | 'createdAt'>) => {
    const now = new Date().toISOString()
    const result = db.prepare(`
      INSERT INTO issues (external_id, name, link, notes, archived, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(issue.externalId, issue.name, issue.link, issue.notes || null, issue.archived ? 1 : 0, now)

    return {
      id: result.lastInsertRowid as number,
      ...issue,
      notes: issue.notes || null,
      createdAt: now
    }
  })

  ipcMain.handle('update-issue', (_, id: number, updates: { externalId?: string; name?: string; link?: string | null; notes?: string | null }) => {
    const fields: string[] = []
    const values: any[] = []

    if (updates.externalId !== undefined) {
      fields.push('external_id = ?')
      values.push(updates.externalId)
    }
    if (updates.name !== undefined) {
      fields.push('name = ?')
      values.push(updates.name)
    }
    if (updates.link !== undefined) {
      fields.push('link = ?')
      values.push(updates.link)
    }
    if (updates.notes !== undefined) {
      fields.push('notes = ?')
      values.push(updates.notes)
    }

    if (fields.length > 0) {
      values.push(id)
      db.prepare(`UPDATE issues SET ${fields.join(', ')} WHERE id = ?`).run(...values)
    }

    const row = db.prepare('SELECT * FROM issues WHERE id = ?').get(id) as IssueRow
    return mapIssue(row)
  })

  ipcMain.handle('archive-issue', (_, id: number) => {
    db.prepare('UPDATE issues SET archived = 1 WHERE id = ?').run(id)
  })

  ipcMain.handle('unarchive-issue', (_, id: number) => {
    db.prepare('UPDATE issues SET archived = 0 WHERE id = ?').run(id)
  })

  ipcMain.handle('delete-issue', (_, id: number) => {
    // Delete time entries first (foreign key constraint)
    db.prepare('DELETE FROM time_entries WHERE issue_id = ?').run(id)
    db.prepare('DELETE FROM issues WHERE id = ?').run(id)
  })

  ipcMain.handle('merge-issues', (_, sourceId: number, targetId: number) => {
    // Move all time entries from source to target
    db.prepare('UPDATE time_entries SET issue_id = ? WHERE issue_id = ?').run(targetId, sourceId)
    // Delete the source issue
    db.prepare('DELETE FROM issues WHERE id = ?').run(sourceId)
  })

  ipcMain.handle('delete-issues', (_, ids: number[]) => {
    if (ids.length === 0) return
    const placeholders = ids.map(() => '?').join(',')
    // Delete time entries first (foreign key constraint)
    db.prepare(`DELETE FROM time_entries WHERE issue_id IN (${placeholders})`).run(...ids)
    db.prepare(`DELETE FROM issues WHERE id IN (${placeholders})`).run(...ids)
  })
}
