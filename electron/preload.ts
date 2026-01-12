import { contextBridge, ipcRenderer } from 'electron'
import type { Issue, TimeEntry, MonthlyReport, ElectronAPI } from '../src/types'

const electronAPI: ElectronAPI = {
  // Issues
  getIssues: (includeArchived = false) => ipcRenderer.invoke('get-issues', includeArchived),
  createIssue: (issue) => ipcRenderer.invoke('create-issue', issue),
  updateIssue: (id, updates) => ipcRenderer.invoke('update-issue', id, updates),
  archiveIssue: (id) => ipcRenderer.invoke('archive-issue', id),
  unarchiveIssue: (id) => ipcRenderer.invoke('unarchive-issue', id),

  // Tracking
  startTracking: (issueId) => ipcRenderer.invoke('start-tracking', issueId),
  pauseTracking: (reason) => ipcRenderer.invoke('pause-tracking', reason),
  getCurrentTracking: () => ipcRenderer.invoke('get-current-tracking'),

  // Handsoff mode
  getHandsoffMode: () => ipcRenderer.invoke('get-handsoff-mode'),
  setHandsoffMode: (enabled) => ipcRenderer.invoke('set-handsoff-mode', enabled),

  // History
  getTimeEntries: (startDate, endDate) => ipcRenderer.invoke('get-time-entries', startDate, endDate),
  getIssueTime: (issueId) => ipcRenderer.invoke('get-issue-time', issueId),

  // Export
  exportMonth: (year, month) => ipcRenderer.invoke('export-month', year, month),

  // Events from main process
  onIdlePause: (callback) => {
    ipcRenderer.on('idle-pause', callback)
  },
  onTrackingUpdate: (callback) => {
    ipcRenderer.on('tracking-update', (_, data) => callback(data))
  },
  onHandsoffModeChange: (callback) => {
    ipcRenderer.on('handsoff-mode-change', (_, enabled) => callback(enabled))
  }
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)
