import { contextBridge, ipcRenderer } from 'electron'
import type { ElectronAPI } from '../src/types'

const electronAPI: ElectronAPI = {
  // Issues
  getIssues: (includeArchived = false) => ipcRenderer.invoke('get-issues', includeArchived),
  createIssue: (issue) => ipcRenderer.invoke('create-issue', issue),
  updateIssue: (id, updates) => ipcRenderer.invoke('update-issue', id, updates),
  archiveIssue: (id) => ipcRenderer.invoke('archive-issue', id),
  unarchiveIssue: (id) => ipcRenderer.invoke('unarchive-issue', id),
  deleteIssue: (id) => ipcRenderer.invoke('delete-issue', id),
  mergeIssues: (sourceId, targetId) => ipcRenderer.invoke('merge-issues', sourceId, targetId),

  // Tracking
  startTracking: (issueId) => ipcRenderer.invoke('start-tracking', issueId),
  pauseTracking: (reason) => ipcRenderer.invoke('pause-tracking', reason),
  getCurrentTracking: () => ipcRenderer.invoke('get-current-tracking'),

  // Presence mode
  getPresenceMode: () => ipcRenderer.invoke('get-presence-mode'),
  setPresenceMode: (enabled) => ipcRenderer.invoke('set-presence-mode', enabled),

  // History
  getTimeEntries: (startDate, endDate) => ipcRenderer.invoke('get-time-entries', startDate, endDate),
  getIssueTime: (issueId) => ipcRenderer.invoke('get-issue-time', issueId),
  getIssueEntries: (issueId) => ipcRenderer.invoke('get-issue-entries', issueId),

  // Time entry management
  createTimeEntry: (issueId, startedAt, endedAt, notes) => ipcRenderer.invoke('create-time-entry', issueId, startedAt, endedAt, notes),
  updateTimeEntry: (id, updates) => ipcRenderer.invoke('update-time-entry', id, updates),
  deleteTimeEntry: (id) => ipcRenderer.invoke('delete-time-entry', id),
  deleteTimeEntries: (ids) => ipcRenderer.invoke('delete-time-entries', ids),
  deleteIssues: (ids) => ipcRenderer.invoke('delete-issues', ids),
  wipeDatabase: () => ipcRenderer.invoke('wipe-database'),

  // Export
  exportMonth: (year, month) => ipcRenderer.invoke('export-month', year, month),

  // Idle
  getIdleTime: () => ipcRenderer.invoke('get-idle-time'),
  resetIdleTime: () => ipcRenderer.invoke('reset-idle-time'),

  // Settings
  getSettings: () => ipcRenderer.invoke('get-settings'),
  updateSettings: (settings) => ipcRenderer.invoke('update-settings', settings),

  // Projects
  getProjects: () => ipcRenderer.invoke('get-projects'),
  getActiveProject: () => ipcRenderer.invoke('get-active-project'),
  createProject: (name) => ipcRenderer.invoke('create-project', name),
  switchProject: (id) => ipcRenderer.invoke('switch-project', id),
  renameProject: (id, name) => ipcRenderer.invoke('rename-project', id, name),
  deleteProject: (id) => ipcRenderer.invoke('delete-project', id),

  // Events from main process
  onIdlePause: (callback) => {
    ipcRenderer.on('idle-pause', callback)
  },
  onTrackingUpdate: (callback) => {
    ipcRenderer.on('tracking-update', (_, data) => callback(data))
  },
  onPresenceModeChange: (callback) => {
    ipcRenderer.on('presence-mode-change', (_, enabled) => callback(enabled))
  },
  onIdleUpdate: (callback) => {
    ipcRenderer.on('idle-update', (_, seconds) => callback(seconds))
  }
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)
