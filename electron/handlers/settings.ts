import { ipcMain, BrowserWindow, powerMonitor } from 'electron'
import type Database from 'better-sqlite3'
import type { AppSettings } from '../../src/types'
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
} from '../projects'
import { switchDatabase, db } from '../db'

// Settings cache - invalidated when settings are updated or project is switched
let cachedSettings: AppSettings | null = null

export function invalidateSettingsCache() {
  cachedSettings = null
}

export function getSettings(db: Database.Database): AppSettings {
  if (cachedSettings) {
    return cachedSettings
  }

  const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[]
  const settings: Record<string, any> = {}
  for (const row of rows) {
    settings[row.key] = row.value
  }
  cachedSettings = {
    dailyTargetHours: parseFloat(settings.dailyTargetHours) || 8,
    weeklyTargetHours: parseFloat(settings.weeklyTargetHours) || 40,
    monthlyTargetHours: parseFloat(settings.monthlyTargetHours) || 160,
    hourlyRate: parseFloat(settings.hourlyRate) || 18.67,
    currency: settings.currency || 'GBP',
    currencySymbol: settings.currencySymbol || '£',
    idleThresholdMinutes: parseFloat(settings.idleThresholdMinutes) || 10,
    idleIndicatorMinutes: parseFloat(settings.idleIndicatorMinutes) || 0.5,
    issueUrlPattern: settings.issueUrlPattern || 'gitlab',
    issueBaseUrl: settings.issueBaseUrl,
    customIssuePattern: settings.customIssuePattern,
    theme: settings.theme || 'light',
    showEarnings: settings.showEarnings === 'true',
    notificationsEnabled: settings.notificationsEnabled !== 'false'
  }
  return cachedSettings
}

export function getEffectiveIdleTime(idleResetTime: number | null, setIdleResetTime: (value: number | null) => void): number {
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
      setIdleResetTime(null)
    }
  }

  return systemIdleTime
}

export interface SettingsContext {
  getMainWindow: () => BrowserWindow | null
  getIdleThreshold: () => number
  setIdleThreshold: (value: number) => void
  updateTrayMenu: () => void
  pauseTracking: (reason: 'manual' | 'idle' | 'switched') => void
  getIdleResetTime: () => number | null
  setIdleResetTime: (value: number | null) => void
  getPresenceMode: () => boolean
  setPresenceMode: (enabled: boolean) => void
}

export function setupSettingsHandlers(ctx: SettingsContext) {
  const { getMainWindow, setIdleThreshold, updateTrayMenu, pauseTracking, getIdleResetTime, setIdleResetTime, getPresenceMode, setPresenceMode } = ctx

  // Settings
  ipcMain.handle('get-settings', () => {
    return getSettings(db)
  })

  ipcMain.handle('update-settings', (_, updates: Record<string, any>) => {
    const updateStmt = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')

    for (const [key, value] of Object.entries(updates)) {
      updateStmt.run(key, String(value))
    }

    // Invalidate cache since settings changed
    invalidateSettingsCache()

    // Reload idle threshold if it changed
    if ('idleThresholdMinutes' in updates) {
      const newSettings = getSettings(db)
      setIdleThreshold(newSettings.idleThresholdMinutes * 60)
    }

    return getSettings(db)
  })

  // Presence mode
  ipcMain.handle('get-presence-mode', () => getPresenceMode())

  ipcMain.handle('set-presence-mode', (_, enabled: boolean) => {
    setPresenceMode(enabled)
  })

  ipcMain.handle('get-idle-time', () => {
    return getEffectiveIdleTime(getIdleResetTime(), setIdleResetTime)
  })

  ipcMain.handle('reset-idle-time', () => {
    setIdleResetTime(Date.now())
    getMainWindow()?.webContents.send('idle-update', 0)
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
    // Invalidate settings cache since we switched to a different project's database
    invalidateSettingsCache()
    // Reload idle threshold from new db settings
    const newSettings = getSettings(db)
    setIdleThreshold(newSettings.idleThresholdMinutes * 60)
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
