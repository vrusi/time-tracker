import { ipcMain, dialog, BrowserWindow } from 'electron'
import { copyFileSync } from 'fs'
import { getActiveProject, getProjectDbPath } from '../projects'
import { switchDatabase, db } from '../db'

export interface ExportContext {
  getMainWindow: () => BrowserWindow | null
}

export function setupExportHandlers(ctx: ExportContext) {
  const { getMainWindow } = ctx

  // Export database file to user-selected location
  ipcMain.handle('export-database', async (): Promise<boolean> => {
    const activeProject = getActiveProject()
    const dbPath = getProjectDbPath(activeProject)
    const mainWindow = getMainWindow()

    if (!mainWindow) return false

    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Export Database',
      defaultPath: `${activeProject.name.replace(/[^a-z0-9]/gi, '-')}-backup.db`,
      filters: [{ name: 'SQLite Database', extensions: ['db'] }]
    })

    if (result.canceled || !result.filePath) {
      return false
    }

    try {
      copyFileSync(dbPath, result.filePath)
      return true
    } catch (err) {
      console.error('Export failed:', err)
      return false
    }
  })

  // Import database file from user-selected location
  ipcMain.handle('import-database', async (): Promise<boolean> => {
    const mainWindow = getMainWindow()

    if (!mainWindow) return false

    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Import Database',
      filters: [{ name: 'SQLite Database', extensions: ['db'] }],
      properties: ['openFile']
    })

    if (result.canceled || result.filePaths.length === 0) {
      return false
    }

    const importPath = result.filePaths[0]
    const activeProject = getActiveProject()
    const dbPath = getProjectDbPath(activeProject)

    try {
      // Close current database connection
      db.close()

      // Copy imported file over current database
      copyFileSync(importPath, dbPath)

      // Reinitialize database connection
      switchDatabase(dbPath)

      return true
    } catch (err) {
      console.error('Import failed:', err)
      // Try to recover by reopening the original db
      switchDatabase(dbPath)
      return false
    }
  })

  // Export monthly report data
  ipcMain.handle('export-month', (_, year: number, month: number) => {
    const startDate = new Date(year, month - 1, 1).toISOString()
    const endDate = new Date(year, month, 0, 23, 59, 59).toISOString()

    const entries = db.prepare(`
      SELECT i.id, i.external_id, i.name, te.started_at, te.ended_at
      FROM time_entries te
      JOIN issues i ON te.issue_id = i.id
      WHERE te.started_at >= ? AND te.started_at <= ?
    `).all(startDate, endDate) as { id: number; external_id: string; name: string; started_at: string; ended_at: string | null }[]

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
      totalHours: Math.round(data.totalSeconds / 36) / 100 // Round to 2 decimal places
    }))
  })

  // Daily breakdown: returns rows of (date, externalId, name, hours)
  ipcMain.handle('get-daily-breakdown', (_, year: number, month: number) => {
    const startDate = new Date(year, month - 1, 1).toISOString()
    const endDate = new Date(year, month, 0, 23, 59, 59).toISOString()

    const entries = db.prepare(`
      SELECT i.external_id, i.name, te.started_at, te.ended_at
      FROM time_entries te
      JOIN issues i ON te.issue_id = i.id
      WHERE te.started_at >= ? AND te.started_at <= ?
    `).all(startDate, endDate) as { external_id: string; name: string; started_at: string; ended_at: string | null }[]

    // Aggregate by (localDate, externalId)
    const map = new Map<string, { date: string; externalId: string; name: string; hours: number }>()

    for (const entry of entries) {
      const start = new Date(entry.started_at)
      const end = entry.ended_at ? new Date(entry.ended_at) : new Date()
      const seconds = (end.getTime() - start.getTime()) / 1000
      // Use local-date YYYY-MM-DD to align with how users perceive workdays
      const y = start.getFullYear()
      const m = String(start.getMonth() + 1).padStart(2, '0')
      const d = String(start.getDate()).padStart(2, '0')
      const date = `${y}-${m}-${d}`
      const key = `${date}|${entry.external_id}`
      const hours = seconds / 3600

      if (map.has(key)) {
        map.get(key)!.hours += hours
      } else {
        map.set(key, {
          date,
          externalId: entry.external_id,
          name: entry.name,
          hours
        })
      }
    }

    return Array.from(map.values()).map(row => ({
      ...row,
      hours: Math.round(row.hours * 100) / 100
    }))
  })
}
