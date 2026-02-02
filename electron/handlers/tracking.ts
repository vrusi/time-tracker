import { ipcMain, BrowserWindow } from 'electron'
import type { Issue, TimeEntry } from '../../src/types'
import { type IssueRow, type TimeEntryRow, mapIssue, mapTrackingResult } from '../mappers'
import { db } from '../db'

export interface TrackingContext {
  getMainWindow: () => BrowserWindow | null
  getIdleThreshold: () => number
  updateTrayMenu: () => void
  checkDailyTargetNotification: () => void
  checkWeeklyTargetNotification: () => void
}

// Store the last idle pause info for potential recovery
let lastIdlePauseInfo: {
  entryId: number
  idleDurationSeconds: number
  pausedAt: string
} | null = null

export function getLastIdlePauseInfo() {
  return lastIdlePauseInfo
}

export function clearLastIdlePauseInfo() {
  lastIdlePauseInfo = null
}

export function getCurrentTracking(): { entry: TimeEntry; issue: Issue } | null {
  const entry = db.prepare(`
    SELECT * FROM time_entries WHERE ended_at IS NULL LIMIT 1
  `).get() as TimeEntryRow | undefined

  if (!entry) return null

  const issue = db.prepare('SELECT * FROM issues WHERE id = ?').get(entry.issue_id) as IssueRow

  return mapTrackingResult(entry, issue)
}

export function pauseTracking(
  reason: 'manual' | 'idle' | 'switched',
  idleThreshold: number,
  mainWindow: BrowserWindow | null,
  updateTrayMenu: () => void,
  checkDailyTargetNotification: () => void,
  checkWeeklyTargetNotification: () => void
): TimeEntry | null {
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

  // Store idle pause info for potential recovery
  if (reason === 'idle') {
    lastIdlePauseInfo = {
      entryId: current.entry.id,
      idleDurationSeconds: idleThreshold,
      pausedAt: new Date().toISOString()
    }
  } else {
    // Clear idle pause info if manually pausing or switching
    lastIdlePauseInfo = null
  }

  updateTrayMenu()
  mainWindow?.webContents.send('tracking-update', null)

  // Check if daily/weekly targets were just reached
  checkDailyTargetNotification()
  checkWeeklyTargetNotification()

  return { ...current.entry, endedAt: endTime, pausedReason: reason }
}

export function startTracking(
  issueId: number,
  mainWindow: BrowserWindow | null,
  updateTrayMenu: () => void,
  pauseCurrentTracking: () => TimeEntry | null
): TimeEntry {
  // Pause any current tracking first
  pauseCurrentTracking()

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
    issue: mapIssue(issue)
  })

  return entry
}

export function setupTrackingHandlers(ctx: TrackingContext) {
  const { getMainWindow, getIdleThreshold, updateTrayMenu, checkDailyTargetNotification, checkWeeklyTargetNotification } = ctx

  const doPause = (reason: 'manual' | 'idle' | 'switched') => {
    return pauseTracking(reason, getIdleThreshold(), getMainWindow(), updateTrayMenu, checkDailyTargetNotification, checkWeeklyTargetNotification)
  }

  ipcMain.handle('start-tracking', (_, issueId: number) => {
    return startTracking(
      issueId,
      getMainWindow(),
      updateTrayMenu,
      () => doPause('switched')
    )
  })

  ipcMain.handle('pause-tracking', (_, reason?: 'manual' | 'switched') => {
    return doPause(reason || 'manual')
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
    const startedAt = new Date(current.entry.startedAt)

    // Skip if lastSeenAt is stale (before entry started) - clear it and return null
    if (lastSeenAt.getTime() < startedAt.getTime()) {
      db.prepare('DELETE FROM settings WHERE key = ?').run('lastSeenAt')
      return null
    }

    const now = new Date()
    const elapsedSinceLastSeen = (now.getTime() - lastSeenAt.getTime()) / 1000
    const totalElapsed = (now.getTime() - startedAt.getTime()) / 1000

    // If app was closed for less than 60 seconds, silently continue tracking (no dialog)
    if (elapsedSinceLastSeen < 60) {
      // Clear lastSeenAt so we don't prompt again, tracking continues as-is
      db.prepare('DELETE FROM settings WHERE key = ?').run('lastSeenAt')
      return null
    }

    return {
      entry: current.entry,
      issue: current.issue,
      lastSeenAt: lastSeenRow.value,
      totalElapsedSeconds: totalElapsed,
      elapsedSinceLastSeenSeconds: elapsedSinceLastSeen
    }
  })

  // Resolve tracking recovery - adjust or discard the entry
  ipcMain.handle('resolve-tracking-recovery', (_, action: 'keep-all' | 'end-at-close' | 'discard') => {
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

  // Get idle recovery info
  ipcMain.handle('get-idle-recovery-info', () => {
    return lastIdlePauseInfo
  })

  // Recover idle time - extend the previous entry's end time to include idle duration
  ipcMain.handle('recover-idle-time', () => {
    if (!lastIdlePauseInfo) return null

    const { entryId, idleDurationSeconds } = lastIdlePauseInfo

    // Get the entry to recover
    const entry = db.prepare('SELECT * FROM time_entries WHERE id = ?').get(entryId) as TimeEntryRow | undefined
    if (!entry || !entry.ended_at) {
      lastIdlePauseInfo = null
      return null
    }

    // Extend the end time by the idle duration
    const oldEndTime = new Date(entry.ended_at)
    const newEndTime = new Date(oldEndTime.getTime() + idleDurationSeconds * 1000)

    db.prepare('UPDATE time_entries SET ended_at = ? WHERE id = ?').run(newEndTime.toISOString(), entryId)

    // Clear the idle pause info after recovery
    lastIdlePauseInfo = null

    // Check if daily/weekly targets were just reached after recovering time
    checkDailyTargetNotification()
    checkWeeklyTargetNotification()

    return {
      entryId,
      recoveredSeconds: idleDurationSeconds,
      newEndTime: newEndTime.toISOString()
    }
  })

  // Clear idle recovery info (user dismissed the recovery option)
  ipcMain.handle('dismiss-idle-recovery', () => {
    lastIdlePauseInfo = null
  })
}
