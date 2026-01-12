import { app, BrowserWindow, ipcMain, powerMonitor, Tray, Menu, nativeImage, Notification } from 'electron'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { initDatabase, db } from './db'
import type { Issue, TimeEntry } from '../src/types'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let idleCheckInterval: NodeJS.Timeout | null = null
let handsoffMode = false
let idleResetTime: number | null = null

const IDLE_THRESHOLD = 600 // 10 minutes in seconds

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
    if (app.isQuitting !== true) {
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
      label: handsoffMode ? '(Handsoff Mode ON)' : '',
      enabled: false,
      visible: handsoffMode
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
      label: handsoffMode ? 'Disable Handsoff Mode' : 'Enable Handsoff Mode',
      click: () => setHandsoffMode(!handsoffMode)
    },
    { type: 'separator' },
    {
      label: 'Open Time Tracker',
      click: () => mainWindow?.show()
    },
    {
      label: 'Quit',
      click: () => {
        app.isQuitting = true
        app.quit()
      }
    }
  ])

  tray?.setContextMenu(contextMenu)

  let tooltip = 'Time Tracker'
  if (current) tooltip = `Tracking: ${current.issue.name}`
  if (handsoffMode) tooltip += ' (Handsoff)'
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

    // Skip idle pause if handsoff mode is enabled
    if (handsoffMode) return

    if (idleTime >= IDLE_THRESHOLD && current) {
      pauseTracking('idle')

      new Notification({
        title: 'Time Tracker',
        body: `Paused "${current.issue.name}" due to inactivity`
      }).show()

      mainWindow?.webContents.send('idle-pause')
    }
  }, 5000) // Check every 5 seconds for smoother idle display
}

function setHandsoffMode(enabled: boolean) {
  handsoffMode = enabled
  updateTrayMenu()
  mainWindow?.webContents.send('handsoff-mode-change', enabled)
}

// Database operations
function getCurrentTracking(): { entry: TimeEntry; issue: Issue } | null {
  const entry = db.prepare(`
    SELECT * FROM time_entries WHERE ended_at IS NULL LIMIT 1
  `).get() as any

  if (!entry) return null

  const issue = db.prepare('SELECT * FROM issues WHERE id = ?').get(entry.issue_id) as any

  return {
    entry: {
      id: entry.id,
      issueId: entry.issue_id,
      startedAt: entry.started_at,
      endedAt: entry.ended_at,
      pausedReason: entry.paused_reason
    },
    issue: {
      id: issue.id,
      externalId: issue.external_id,
      name: issue.name,
      link: issue.link,
      archived: !!issue.archived,
      createdAt: issue.created_at
    }
  }
}

function pauseTracking(reason: 'manual' | 'idle' | 'switched'): TimeEntry | null {
  const current = getCurrentTracking()
  if (!current) return null

  const now = new Date().toISOString()
  db.prepare(`
    UPDATE time_entries SET ended_at = ?, paused_reason = ? WHERE id = ?
  `).run(now, reason, current.entry.id)

  updateTrayMenu()
  mainWindow?.webContents.send('tracking-update', null)

  return { ...current.entry, endedAt: now, pausedReason: reason }
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
    pausedReason: null
  }

  updateTrayMenu()

  const issue = db.prepare('SELECT * FROM issues WHERE id = ?').get(issueId) as any
  mainWindow?.webContents.send('tracking-update', {
    entry,
    issue: {
      id: issue.id,
      externalId: issue.external_id,
      name: issue.name,
      link: issue.link,
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
      archived: !!row.archived,
      createdAt: row.created_at
    }))
  })

  ipcMain.handle('create-issue', (_, issue: Omit<Issue, 'id' | 'createdAt'>) => {
    const now = new Date().toISOString()
    const result = db.prepare(`
      INSERT INTO issues (external_id, name, link, archived, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(issue.externalId, issue.name, issue.link, issue.archived ? 1 : 0, now)

    return {
      id: result.lastInsertRowid as number,
      ...issue,
      createdAt: now
    }
  })

  ipcMain.handle('update-issue', (_, id: number, updates: { externalId?: string; name?: string; link?: string | null }) => {
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

    if (fields.length > 0) {
      values.push(id)
      db.prepare(`UPDATE issues SET ${fields.join(', ')} WHERE id = ?`).run(...values)
    }

    const row = db.prepare('SELECT * FROM issues WHERE id = ?').get(id) as any
    return {
      id: row.id,
      externalId: row.external_id,
      name: row.name,
      link: row.link,
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

  // History
  ipcMain.handle('get-time-entries', (_, startDate: string, endDate: string) => {
    const entries = db.prepare(`
      SELECT te.*, i.external_id, i.name, i.link, i.archived, i.created_at as issue_created_at
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
      issue: {
        id: row.issue_id,
        externalId: row.external_id,
        name: row.name,
        link: row.link,
        archived: !!row.archived,
        createdAt: row.issue_created_at
      }
    }))
  })

  ipcMain.handle('get-issue-time', (_, issueId: number) => {
    const entries = db.prepare(`
      SELECT started_at, ended_at FROM time_entries WHERE issue_id = ?
    `).all(issueId) as any[]

    return entries.reduce((total, entry) => {
      const start = new Date(entry.started_at).getTime()
      const end = entry.ended_at ? new Date(entry.ended_at).getTime() : Date.now()
      return total + (end - start) / 1000
    }, 0)
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
    `).all(startDate, endDate) as any[]

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

  // Handsoff mode
  ipcMain.handle('get-handsoff-mode', () => handsoffMode)

  ipcMain.handle('set-handsoff-mode', (_, enabled: boolean) => {
    setHandsoffMode(enabled)
  })

  ipcMain.handle('get-idle-time', () => {
    return getEffectiveIdleTime()
  })

  ipcMain.handle('reset-idle-time', () => {
    idleResetTime = Date.now()
    mainWindow?.webContents.send('idle-update', 0)
  })
}

// App lifecycle
app.whenReady().then(() => {
  initDatabase()
  createWindow()
  createTray()
  setupIpcHandlers()
  startIdleWatcher()

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
})

// Extend app with isQuitting property
declare module 'electron' {
  interface App {
    isQuitting?: boolean
  }
}
