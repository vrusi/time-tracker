import { app, BrowserWindow, ipcMain, powerMonitor, Tray, Menu, nativeImage, Notification, dialog } from 'electron'
import { join, dirname, basename } from 'path'
import { copyFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { initDatabase, switchDatabase, db } from './db'
import {
  loadProjectsConfig,
  getActiveProject,
  setActiveProject,
  createProject,
  renameProject,
  deleteProject,
  getProjectDbPath,
  type Project,
  type ProjectsConfig
} from './projects'
import type { Issue, TimeEntry } from '../src/types'

// Database row types (snake_case from SQLite)
interface IssueRow {
  id: number
  external_id: string
  name: string
  link: string | null
  notes: string | null
  archived: number
  created_at: string
}

interface TimeEntryRow {
  id: number
  issue_id: number
  started_at: string
  ended_at: string | null
  paused_reason: 'manual' | 'idle' | 'switched' | null
  notes: string | null
}

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let idleCheckInterval: NodeJS.Timeout | null = null
let presenceMode = false
let idleResetTime: number | null = null
let idleThreshold = 600 // 10 minutes in seconds (loaded from settings)
let isQuitting = false

function getSettings() {
  const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[]
  const settings: Record<string, any> = {}
  for (const row of rows) {
    settings[row.key] = row.value
  }
  return {
    dailyTargetHours: parseFloat(settings.dailyTargetHours) || 8,
    monthlyTargetHours: parseFloat(settings.monthlyTargetHours) || 160,
    hourlyRate: parseFloat(settings.hourlyRate) || 18.67,
    currency: settings.currency || 'GBP',
    currencySymbol: settings.currencySymbol || '£',
    idleThresholdMinutes: parseFloat(settings.idleThresholdMinutes) || 10,
    idleIndicatorMinutes: parseFloat(settings.idleIndicatorMinutes) || 0.5,
    issueUrlPattern: settings.issueUrlPattern || 'gitlab',
    customIssuePattern: settings.customIssuePattern,
    theme: settings.theme || 'light',
    showEarnings: settings.showEarnings === 'true',
    notificationsEnabled: settings.notificationsEnabled !== 'false'
  }
}

function loadIdleThreshold() {
  const settings = getSettings()
  idleThreshold = settings.idleThresholdMinutes * 60
}

function getTodayTotalSeconds(): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayStart = today.toISOString()
  const todayEnd = new Date(today.getTime() + 24 * 60 * 60 * 1000).toISOString()

  const entries = db.prepare(`
    SELECT started_at, ended_at FROM time_entries
    WHERE started_at >= ? AND started_at < ?
  `).all(todayStart, todayEnd) as { started_at: string; ended_at: string | null }[]

  return entries.reduce((total, entry) => {
    const start = new Date(entry.started_at).getTime()
    const end = entry.ended_at ? new Date(entry.ended_at).getTime() : Date.now()
    return total + (end - start) / 1000
  }, 0)
}

let dailyTargetNotified = false

function checkDailyTargetNotification() {
  const settings = getSettings()
  if (!settings.notificationsEnabled) return

  const todaySeconds = getTodayTotalSeconds()
  const targetSeconds = settings.dailyTargetHours * 3600

  if (todaySeconds >= targetSeconds && !dailyTargetNotified) {
    dailyTargetNotified = true
    new Notification({
      title: 'Daily Target Reached!',
      body: `You've completed ${settings.dailyTargetHours} hours today`
    }).show()
  }
}

// Reset daily notification flag at midnight
function scheduleDailyReset() {
  const now = new Date()
  const tomorrow = new Date(now)
  tomorrow.setDate(tomorrow.getDate() + 1)
  tomorrow.setHours(0, 0, 0, 0)
  const msUntilMidnight = tomorrow.getTime() - now.getTime()

  setTimeout(() => {
    dailyTargetNotified = false
    scheduleDailyReset()
  }, msUntilMidnight)
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(join(__dirname, '../dist/index.html'))
  }

  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault()
      mainWindow?.hide()
    }
  })
}

function createTray() {
  // Create a simple 16x16 icon (you can replace with actual icon file)
  const icon = nativeImage.createEmpty()
  tray = new Tray(icon)

  updateTrayMenu()

  tray.on('click', () => {
    mainWindow?.show()
  })
}

function updateTrayMenu() {
  const current = getCurrentTracking()

  const contextMenu = Menu.buildFromTemplate([
    {
      label: current ? `Tracking: ${current.issue.name}` : 'Not tracking',
      enabled: false
    },
    {
      label: presenceMode ? '(Presence Mode ON)' : '',
      enabled: false,
      visible: presenceMode
    },
    { type: 'separator' },
    {
      label: current ? 'Pause' : 'Resume',
      click: () => {
        if (current) {
          pauseTracking('manual')
        }
        // Resume would need to know which issue - user should use main window
      }
    },
    {
      label: presenceMode ? 'Disable Presence Mode' : 'Enable Presence Mode',
      click: () => setPresenceMode(!presenceMode)
    },
    { type: 'separator' },
    {
      label: 'Open Time Tracker',
      click: () => mainWindow?.show()
    },
    {
      label: 'Quit',
      click: () => {
        isQuitting = true
        app.quit()
      }
    }
  ])

  tray?.setContextMenu(contextMenu)

  let tooltip = 'Time Tracker'
  if (current) tooltip = `Tracking: ${current.issue.name}`
  if (presenceMode) tooltip += ' (Presence)'
  tray?.setToolTip(tooltip)
}

function getEffectiveIdleTime(): number {
  const systemIdleTime = powerMonitor.getSystemIdleTime()

  // If we have a reset time and system idle is still counting from before reset,
  // return 0 (user manually indicated they're active)
  if (idleResetTime !== null) {
    const timeSinceReset = Math.floor((Date.now() - idleResetTime) / 1000)
    if (systemIdleTime > timeSinceReset) {
      // System still shows old idle time, use time since reset instead
      return timeSinceReset
    } else {
      // System idle reset naturally (user activity detected), clear our manual reset
      idleResetTime = null
    }
  }

  return systemIdleTime
}

function startIdleWatcher() {
  idleCheckInterval = setInterval(() => {
    const idleTime = getEffectiveIdleTime()
    const current = getCurrentTracking()

    // Send idle time to renderer
    mainWindow?.webContents.send('idle-update', idleTime)

    // Skip idle pause if presence mode is enabled
    if (presenceMode) return

    if (idleTime >= idleThreshold && current) {
      pauseTracking('idle')

      const settings = getSettings()
      if (settings.notificationsEnabled) {
        new Notification({
          title: 'Time Tracker',
          body: `Paused "${current.issue.name}" due to inactivity`
        }).show()
      }

      mainWindow?.webContents.send('idle-pause')
    }
  }, 5000) // Check every 5 seconds for smoother idle display
}

function setPresenceMode(enabled: boolean) {
  presenceMode = enabled
  updateTrayMenu()
  mainWindow?.webContents.send('presence-mode-change', enabled)
}

// Database operations
function getCurrentTracking(): { entry: TimeEntry; issue: Issue } | null {
  const entry = db.prepare(`
    SELECT * FROM time_entries WHERE ended_at IS NULL LIMIT 1
  `).get() as TimeEntryRow | undefined

  if (!entry) return null

  const issue = db.prepare('SELECT * FROM issues WHERE id = ?').get(entry.issue_id) as IssueRow

  return {
    entry: {
      id: entry.id,
      issueId: entry.issue_id,
      startedAt: entry.started_at,
      endedAt: entry.ended_at,
      pausedReason: entry.paused_reason,
      notes: entry.notes
    },
    issue: {
      id: issue.id,
      externalId: issue.external_id,
      name: issue.name,
      link: issue.link,
      notes: issue.notes,
      archived: !!issue.archived,
      createdAt: issue.created_at
    }
  }
}

function pauseTracking(reason: 'manual' | 'idle' | 'switched'): TimeEntry | null {
  const current = getCurrentTracking()
  if (!current) return null

  // When pausing due to idle, subtract the idle threshold to get actual stop time
  // (idle triggers after threshold, so user stopped working threshold seconds ago)
  const endTime = reason === 'idle'
    ? new Date(Date.now() - idleThreshold * 1000).toISOString()
    : new Date().toISOString()

  db.prepare(`
    UPDATE time_entries SET ended_at = ?, paused_reason = ? WHERE id = ?
  `).run(endTime, reason, current.entry.id)

  updateTrayMenu()
  mainWindow?.webContents.send('tracking-update', null)

  // Check if daily target was just reached
  checkDailyTargetNotification()

  return { ...current.entry, endedAt: endTime, pausedReason: reason }
}

function startTracking(issueId: number): TimeEntry {
  // Pause any current tracking first
  pauseTracking('switched')

  const now = new Date().toISOString()
  const result = db.prepare(`
    INSERT INTO time_entries (issue_id, started_at) VALUES (?, ?)
  `).run(issueId, now)

  const entry: TimeEntry = {
    id: result.lastInsertRowid as number,
    issueId,
    startedAt: now,
    endedAt: null,
    pausedReason: null,
    notes: null
  }

  updateTrayMenu()

  const issue = db.prepare('SELECT * FROM issues WHERE id = ?').get(issueId) as IssueRow
  mainWindow?.webContents.send('tracking-update', {
    entry,
    issue: {
      id: issue.id,
      externalId: issue.external_id,
      name: issue.name,
      link: issue.link,
      notes: issue.notes,
      archived: !!issue.archived,
      createdAt: issue.created_at
    }
  })

  return entry
}

// IPC handlers
function setupIpcHandlers() {
  // Issues
  ipcMain.handle('get-issues', (_, includeArchived = false) => {
    const query = includeArchived
      ? 'SELECT * FROM issues ORDER BY created_at DESC'
      : 'SELECT * FROM issues WHERE archived = 0 ORDER BY created_at DESC'

    return db.prepare(query).all().map((row: any) => ({
      id: row.id,
      externalId: row.external_id,
      name: row.name,
      link: row.link,
      notes: row.notes,
      archived: !!row.archived,
      createdAt: row.created_at
    }))
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
    return {
      id: row.id,
      externalId: row.external_id,
      name: row.name,
      link: row.link,
      notes: row.notes,
      archived: !!row.archived,
      createdAt: row.created_at
    }
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

  // Tracking
  ipcMain.handle('start-tracking', (_, issueId: number) => {
    return startTracking(issueId)
  })

  ipcMain.handle('pause-tracking', (_, reason?: 'manual' | 'switched') => {
    return pauseTracking(reason || 'manual')
  })

  ipcMain.handle('get-current-tracking', () => {
    return getCurrentTracking()
  })

  // Recovery check - detect if app was closed while tracking
  ipcMain.handle('check-tracking-recovery', () => {
    const current = getCurrentTracking()
    if (!current) return null

    const lastSeenRow = db.prepare('SELECT value FROM settings WHERE key = ?').get('lastSeenAt') as { value: string } | undefined
    if (!lastSeenRow) return null

    const lastSeenAt = new Date(lastSeenRow.value)
    const now = new Date()
    const elapsedSinceLastSeen = (now.getTime() - lastSeenAt.getTime()) / 1000

    const startedAt = new Date(current.entry.startedAt)
    const totalElapsed = (now.getTime() - startedAt.getTime()) / 1000

    return {
      entry: current.entry,
      issue: current.issue,
      lastSeenAt: lastSeenRow.value,
      totalElapsedSeconds: totalElapsed,
      elapsedSinceLastSeenSeconds: elapsedSinceLastSeen
    }
  })

  // Resolve tracking recovery - adjust or discard the entry
  ipcMain.handle('resolve-tracking-recovery', (_, action: 'keep-all' | 'end-at-close' | 'discard', customEndTime?: string) => {
    const current = getCurrentTracking()
    if (!current) return null

    const lastSeenRow = db.prepare('SELECT value FROM settings WHERE key = ?').get('lastSeenAt') as { value: string } | undefined

    if (action === 'discard') {
      // Delete the entry entirely
      db.prepare('DELETE FROM time_entries WHERE id = ?').run(current.entry.id)
      return null
    }

    if (action === 'end-at-close' && lastSeenRow) {
      // End the entry at the last-seen time
      db.prepare('UPDATE time_entries SET ended_at = ?, paused_reason = ? WHERE id = ?')
        .run(lastSeenRow.value, 'manual', current.entry.id)
    } else if (action === 'keep-all') {
      // Keep tracking - entry stays open, just clear last-seen to avoid re-prompting
    }

    // Clear last-seen timestamp
    db.prepare('DELETE FROM settings WHERE key = ?').run('lastSeenAt')

    return getCurrentTracking()
  })

  // History
  ipcMain.handle('get-time-entries', (_, startDate: string, endDate: string) => {
    const entries = db.prepare(`
      SELECT te.*, i.external_id, i.name, i.link, i.notes as issue_notes, i.archived, i.created_at as issue_created_at
      FROM time_entries te
      JOIN issues i ON te.issue_id = i.id
      WHERE te.started_at >= ? AND te.started_at <= ?
      ORDER BY te.started_at DESC
    `).all(startDate, endDate)

    return entries.map((row: any) => ({
      id: row.id,
      issueId: row.issue_id,
      startedAt: row.started_at,
      endedAt: row.ended_at,
      pausedReason: row.paused_reason,
      notes: row.notes,
      issue: {
        id: row.issue_id,
        externalId: row.external_id,
        name: row.name,
        link: row.link,
        notes: row.issue_notes,
        archived: !!row.archived,
        createdAt: row.issue_created_at
      }
    }))
  })

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

  ipcMain.handle('get-issue-entries', (_, issueId: number) => {
    const entries = db.prepare(`
      SELECT id, issue_id, started_at, ended_at, paused_reason, notes
      FROM time_entries
      WHERE issue_id = ?
      ORDER BY started_at DESC
    `).all(issueId)

    return entries.map((row: any) => ({
      id: row.id,
      issueId: row.issue_id,
      startedAt: row.started_at,
      endedAt: row.ended_at,
      pausedReason: row.paused_reason,
      notes: row.notes
    }))
  })

  // Time entry management
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
    }
  })

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
    return {
      id: row.id,
      issueId: row.issue_id,
      startedAt: row.started_at,
      endedAt: row.ended_at,
      pausedReason: row.paused_reason,
      notes: row.notes
    }
  })

  ipcMain.handle('delete-time-entry', (_, id: number) => {
    db.prepare('DELETE FROM time_entries WHERE id = ?').run(id)
  })

  ipcMain.handle('delete-time-entries', (_, ids: number[]) => {
    if (ids.length === 0) return
    const placeholders = ids.map(() => '?').join(',')
    db.prepare(`DELETE FROM time_entries WHERE id IN (${placeholders})`).run(...ids)
  })

  ipcMain.handle('delete-issues', (_, ids: number[]) => {
    if (ids.length === 0) return
    const placeholders = ids.map(() => '?').join(',')
    // Delete time entries first (foreign key constraint)
    db.prepare(`DELETE FROM time_entries WHERE issue_id IN (${placeholders})`).run(...ids)
    db.prepare(`DELETE FROM issues WHERE id IN (${placeholders})`).run(...ids)
  })

  ipcMain.handle('wipe-database', () => {
    db.exec('DELETE FROM time_entries; DELETE FROM issues;')
  })

  ipcMain.handle('export-database', async (): Promise<boolean> => {
    const activeProject = getActiveProject()
    const dbPath = getProjectDbPath(activeProject)

    const result = await dialog.showSaveDialog(mainWindow!, {
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

  ipcMain.handle('import-database', async (): Promise<boolean> => {
    const result = await dialog.showOpenDialog(mainWindow!, {
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

  // Export
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

  // Presence mode
  ipcMain.handle('get-presence-mode', () => presenceMode)

  ipcMain.handle('set-presence-mode', (_, enabled: boolean) => {
    setPresenceMode(enabled)
  })

  ipcMain.handle('get-idle-time', () => {
    return getEffectiveIdleTime()
  })

  ipcMain.handle('reset-idle-time', () => {
    idleResetTime = Date.now()
    mainWindow?.webContents.send('idle-update', 0)
  })

  // Settings
  ipcMain.handle('get-settings', () => {
    return getSettings()
  })

  ipcMain.handle('update-settings', (_, updates: Record<string, any>) => {
    const updateStmt = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')

    for (const [key, value] of Object.entries(updates)) {
      updateStmt.run(key, String(value))
    }

    // Reload idle threshold if it changed
    if ('idleThresholdMinutes' in updates) {
      loadIdleThreshold()
    }

    return getSettings()
  })

  // Projects
  ipcMain.handle('get-projects', (): ProjectsConfig => {
    return loadProjectsConfig()
  })

  ipcMain.handle('get-active-project', (): Project => {
    return getActiveProject()
  })

  ipcMain.handle('create-project', (_, name: string): Project => {
    const project = createProject(name)
    // Initialize the new database
    switchDatabase(getProjectDbPath(project))
    // Switch back to current project
    const activeProject = getActiveProject()
    switchDatabase(getProjectDbPath(activeProject))
    return project
  })

  ipcMain.handle('switch-project', (_, projectId: string): Project => {
    // Pause any active tracking first
    pauseTracking('switched')
    // Set new active project
    const project = setActiveProject(projectId)
    // Switch to new database
    switchDatabase(getProjectDbPath(project))
    // Reload idle threshold from new db settings
    loadIdleThreshold()
    // Update tray menu
    updateTrayMenu()
    return project
  })

  ipcMain.handle('rename-project', (_, projectId: string, newName: string): Project => {
    return renameProject(projectId, newName)
  })

  ipcMain.handle('delete-project', (_, projectId: string): void => {
    deleteProject(projectId)
  })
}

// App lifecycle
app.whenReady().then(() => {
  // Load projects config (migrates existing db on first run)
  const config = loadProjectsConfig()
  const activeProject = config.projects.find(p => p.id === config.activeProjectId)
  if (activeProject) {
    initDatabase(getProjectDbPath(activeProject))
  }
  loadIdleThreshold()
  createWindow()
  createTray()
  setupIpcHandlers()
  startIdleWatcher()
  scheduleDailyReset()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    } else {
      mainWindow?.show()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  if (idleCheckInterval) {
    clearInterval(idleCheckInterval)
  }
  // Save last-seen timestamp for recovery detection
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
    'lastSeenAt',
    new Date().toISOString()
  )
})

