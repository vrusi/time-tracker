import { app, BrowserWindow, Tray, Menu, nativeImage, Notification, powerMonitor } from 'electron'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { initDatabase, db } from './db'
import { loadProjectsConfig, getProjectDbPath } from './projects'
import type { TimeEntry } from '../src/types'
import {
  setupIssueHandlers,
  setupTrackingHandlers,
  setupEntryHandlers,
  setupSettingsHandlers,
  setupExportHandlers,
  getSettings,
  getEffectiveIdleTime,
  getCurrentTracking,
  pauseTracking
} from './handlers'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let idleCheckInterval: NodeJS.Timeout | null = null
let presenceMode = false
let idleResetTime: number | null = null
let idleThreshold = 600 // 10 minutes in seconds (loaded from settings)
let isQuitting = false
let suspendedAt: number | null = null

function loadIdleThreshold() {
  const settings = getSettings(db)
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

function getThisWeekTotalSeconds(): number {
  const now = new Date()
  const day = now.getDay()
  // Get Monday of this week
  const diff = day === 0 ? -6 : 1 - day
  const weekStart = new Date(now)
  weekStart.setDate(weekStart.getDate() + diff)
  weekStart.setHours(0, 0, 0, 0)

  // Get Sunday end of this week
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekEnd.getDate() + 6)
  weekEnd.setHours(23, 59, 59, 999)

  const entries = db.prepare(`
    SELECT started_at, ended_at FROM time_entries
    WHERE started_at >= ? AND started_at <= ?
  `).all(weekStart.toISOString(), weekEnd.toISOString()) as { started_at: string; ended_at: string | null }[]

  return entries.reduce((total, entry) => {
    const start = new Date(entry.started_at).getTime()
    const end = entry.ended_at ? new Date(entry.ended_at).getTime() : Date.now()
    return total + (end - start) / 1000
  }, 0)
}

let dailyTargetNotified = false
let weeklyTargetNotified = false

function checkDailyTargetNotification() {
  if (dailyTargetNotified) return
  const settings = getSettings(db)
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

function checkWeeklyTargetNotification() {
  if (weeklyTargetNotified) return
  const settings = getSettings(db)
  if (!settings.notificationsEnabled) return

  const weekSeconds = getThisWeekTotalSeconds()
  const targetSeconds = settings.weeklyTargetHours * 3600

  if (weekSeconds >= targetSeconds && !weeklyTargetNotified) {
    weeklyTargetNotified = true
    new Notification({
      title: 'Weekly Target Reached!',
      body: `You've completed ${settings.weeklyTargetHours} hours this week`
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

// Reset weekly notification flag on Monday 00:00
function scheduleWeeklyReset() {
  const now = new Date()
  const day = now.getDay()
  // Calculate days until next Monday
  const daysUntilMonday = day === 0 ? 1 : day === 1 ? 7 : 8 - day
  const nextMonday = new Date(now)
  nextMonday.setDate(nextMonday.getDate() + daysUntilMonday)
  nextMonday.setHours(0, 0, 0, 0)
  const msUntilMonday = nextMonday.getTime() - now.getTime()

  setTimeout(() => {
    weeklyTargetNotified = false
    scheduleWeeklyReset()
  }, msUntilMonday)
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
    // In production, use app.getAppPath() for reliable path resolution
    mainWindow.loadFile(join(app.getAppPath(), 'dist/index.html'))
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

// Helper to call the imported pauseTracking with all required parameters
function doPauseTracking(reason: 'manual' | 'idle' | 'switched'): TimeEntry | null {
  return pauseTracking(reason, idleThreshold, mainWindow, updateTrayMenu, checkDailyTargetNotification, checkWeeklyTargetNotification)
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
          doPauseTracking('manual')
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

function setPresenceMode(enabled: boolean) {
  presenceMode = enabled
  updateTrayMenu()
  mainWindow?.webContents.send('presence-mode-change', enabled)
}

function startIdleWatcher() {
  idleCheckInterval = setInterval(() => {
    const idleTime = getEffectiveIdleTime(idleResetTime, (value) => { idleResetTime = value })
    const current = getCurrentTracking()

    // Send idle time to renderer
    mainWindow?.webContents.send('idle-update', idleTime)

    // Check daily and weekly targets during active tracking
    if (current) {
      checkDailyTargetNotification()
      checkWeeklyTargetNotification()
    }

    // Skip idle pause if presence mode is enabled
    if (presenceMode) return

    if (idleTime >= idleThreshold && current) {
      doPauseTracking('idle')

      const settings = getSettings(db)
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

// IPC handlers setup using modular handlers
function setupIpcHandlers() {
  // Setup issue handlers
  setupIssueHandlers()

  // Setup tracking handlers
  setupTrackingHandlers({
    getMainWindow: () => mainWindow,
    getIdleThreshold: () => idleThreshold,
    updateTrayMenu,
    checkDailyTargetNotification,
    checkWeeklyTargetNotification
  })

  // Setup entry handlers
  setupEntryHandlers()

  // Setup settings handlers
  setupSettingsHandlers({
    getMainWindow: () => mainWindow,
    getIdleThreshold: () => idleThreshold,
    setIdleThreshold: (value: number) => { idleThreshold = value },
    updateTrayMenu,
    pauseTracking: doPauseTracking,
    getIdleResetTime: () => idleResetTime,
    setIdleResetTime: (value: number | null) => { idleResetTime = value },
    getPresenceMode: () => presenceMode,
    setPresenceMode
  })

  // Setup export handlers
  setupExportHandlers({
    getMainWindow: () => mainWindow
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
  scheduleWeeklyReset()

  // Handle system sleep/wake for idle detection
  powerMonitor.on('suspend', () => {
    suspendedAt = Date.now()
  })

  powerMonitor.on('resume', () => {
    if (suspendedAt && !presenceMode) {
      const sleepDuration = Math.floor((Date.now() - suspendedAt) / 1000)
      const current = getCurrentTracking()

      if (sleepDuration >= idleThreshold && current) {
        doPauseTracking('idle')

        const settings = getSettings(db)
        if (settings.notificationsEnabled) {
          new Notification({
            title: 'Time Tracker',
            body: `Paused "${current.issue.name}" - laptop was asleep for ${Math.floor(sleepDuration / 60)} minutes`
          }).show()
        }

        mainWindow?.webContents.send('idle-pause')
      }
    }
    suspendedAt = null
  })

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
  isQuitting = true
  if (idleCheckInterval) {
    clearInterval(idleCheckInterval)
  }
  // Save last-seen timestamp for recovery detection
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
    'lastSeenAt',
    new Date().toISOString()
  )
})
