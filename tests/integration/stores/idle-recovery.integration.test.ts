import { describe, it, expect, vi } from 'vitest'
import { useTrackerStore } from '../../../src/stores/tracker.store'
import { useSettingsStore } from '../../../src/stores/settings.store'
import { setupStoreIntegration, getIPCHandler } from './setup'
import { mockElectronAPI } from '../../setup'
import { createMockIssue, createMockTimeEntry, createMockSettings } from '../../fixtures'

/**
 * Integration tests: Full idle pause → recovery cycle.
 * Tests the complete flow of idle detection, pause, and recovery options.
 */
describe('Idle Recovery Integration', () => {
  setupStoreIntegration()

  describe('full idle pause → recovery → resume cycle', () => {
    it('handles complete idle recovery flow', async () => {
      const tracker = useTrackerStore()

      const issue = createMockIssue({ id: 1, name: 'My Task' })
      const entry = createMockTimeEntry({ issueId: 1 })
      const recoveryInfo = {
        lastActiveAt: '2024-01-01T09:00:00.000Z',
        idleStartedAt: '2024-01-01T09:10:00.000Z',
        pausedAt: '2024-01-01T09:20:00.000Z',
        idleDurationSeconds: 600 // 10 minutes
      }

      // Setup listeners first to register handlers
      tracker.setupListeners()

      // Start tracking
      mockElectronAPI.startTracking.mockResolvedValue(entry)
      mockElectronAPI.getIssues.mockResolvedValue([issue])
      await tracker.startTracking(1)

      expect(tracker.isTracking).toBe(true)
      tracker.elapsedSeconds = 1200 // 20 minutes of tracking

      // Get the idle pause handler
      const idlePauseHandler = getIPCHandler('onIdlePause')
      expect(idlePauseHandler).toBeDefined()

      // Simulate idle pause from backend
      mockElectronAPI.getIdleRecoveryInfo.mockResolvedValue(recoveryInfo)
      await idlePauseHandler!()

      // Check state after idle pause
      expect(tracker.isTracking).toBe(false)
      expect(tracker.currentEntry).toBeNull()
      expect(tracker.lastTrackedIssue?.id).toBe(1)
      expect(tracker.pauseReason).toBe('idle')
      // formattedPausedTime reflects internal pausedElapsedSeconds (20 min = 1200s)
      expect(tracker.formattedPausedTime).toBe('00:20:00')
      expect(tracker.idleRecoveryInfo).toEqual(recoveryInfo)
      expect(tracker.canRecoverIdleTime).toBe(true)

      // Recover idle time
      mockElectronAPI.recoverIdleTime.mockResolvedValue({
        recoveredSeconds: 600,
        newEndTime: '2024-01-01T09:30:00.000Z'
      })
      const result = await tracker.recoverIdleTime()

      expect(result?.recoveredSeconds).toBe(600)
      // After recovery, paused time should be 1200 + 600 = 1800 seconds (30 min)
      expect(tracker.formattedPausedTime).toBe('00:30:00')
      expect(tracker.idleRecoveryInfo).toBeNull()
      expect(tracker.canRecoverIdleTime).toBe(false)

      // Resume tracking on same issue
      const newEntry = createMockTimeEntry({ id: 2, issueId: 1 })
      mockElectronAPI.startTracking.mockResolvedValue(newEntry)
      await tracker.startTracking(1)

      expect(tracker.isTracking).toBe(true)
      expect(tracker.currentIssue?.id).toBe(1)
    })

    it('dismiss recovery clears state correctly', async () => {
      const tracker = useTrackerStore()

      const issue = createMockIssue({ id: 1 })
      const entry = createMockTimeEntry({ issueId: 1 })
      const recoveryInfo = {
        lastActiveAt: '2024-01-01T09:00:00.000Z',
        idleStartedAt: '2024-01-01T09:10:00.000Z',
        pausedAt: '2024-01-01T09:20:00.000Z',
        idleDurationSeconds: 600
      }

      // Setup listeners first
      tracker.setupListeners()

      // Start and simulate idle pause
      mockElectronAPI.startTracking.mockResolvedValue(entry)
      mockElectronAPI.getIssues.mockResolvedValue([issue])
      await tracker.startTracking(1)
      tracker.elapsedSeconds = 1200

      mockElectronAPI.getIdleRecoveryInfo.mockResolvedValue(recoveryInfo)
      const idlePauseHandler = getIPCHandler('onIdlePause')
      await idlePauseHandler!()

      expect(tracker.idleRecoveryInfo).not.toBeNull()
      expect(tracker.canRecoverIdleTime).toBe(true)

      // Dismiss recovery
      mockElectronAPI.dismissIdleRecovery.mockResolvedValue(undefined)
      await tracker.dismissIdleRecovery()

      expect(tracker.idleRecoveryInfo).toBeNull()
      expect(tracker.canRecoverIdleTime).toBe(false)
      // Last tracked issue and paused time should still be available for resume
      expect(tracker.lastTrackedIssue?.id).toBe(1)
      expect(tracker.formattedPausedTime).toBe('00:20:00') // 1200 seconds
    })

    it('recovery fails gracefully when backend returns null', async () => {
      const tracker = useTrackerStore()

      tracker.idleRecoveryInfo = {
        lastActiveAt: '2024-01-01T09:00:00.000Z',
        idleStartedAt: '2024-01-01T09:10:00.000Z',
        pausedAt: '2024-01-01T09:20:00.000Z',
        idleDurationSeconds: 600
      }
      tracker.pausedElapsedSeconds = 1200

      mockElectronAPI.recoverIdleTime.mockResolvedValue(null)
      const result = await tracker.recoverIdleTime()

      expect(result).toBeNull()
      // Recovery info preserved for retry
      expect(tracker.idleRecoveryInfo).not.toBeNull()
      // Elapsed not modified
      expect(tracker.pausedElapsedSeconds).toBe(1200)
    })
  })

  describe('pausedElapsedSeconds preservation', () => {
    it('preserves paused elapsed when idle pause occurs', async () => {
      const tracker = useTrackerStore()

      const issue = createMockIssue({ id: 1 })
      const entry = createMockTimeEntry({ issueId: 1 })

      // Setup listeners first
      tracker.setupListeners()

      mockElectronAPI.startTracking.mockResolvedValue(entry)
      mockElectronAPI.getIssues.mockResolvedValue([issue])
      await tracker.startTracking(1)
      tracker.elapsedSeconds = 3600 // 1 hour

      mockElectronAPI.getIdleRecoveryInfo.mockResolvedValue({
        idleDurationSeconds: 300,
        lastActiveAt: '',
        idleStartedAt: '',
        pausedAt: ''
      })

      const idlePauseHandler = getIPCHandler('onIdlePause')
      await idlePauseHandler!()

      // 3600 seconds = 1 hour
      expect(tracker.formattedPausedTime).toBe('01:00:00')
    })

    it('adds recovered time to paused elapsed', async () => {
      const tracker = useTrackerStore()
      const issue = createMockIssue({ id: 1 })
      const entry = createMockTimeEntry({ issueId: 1 })

      // Setup and start tracking
      tracker.setupListeners()
      mockElectronAPI.startTracking.mockResolvedValue(entry)
      mockElectronAPI.getIssues.mockResolvedValue([issue])
      await tracker.startTracking(1)
      tracker.elapsedSeconds = 3600 // 1 hour

      // Simulate idle pause
      mockElectronAPI.getIdleRecoveryInfo.mockResolvedValue({
        idleDurationSeconds: 1800,
        lastActiveAt: '',
        idleStartedAt: '',
        pausedAt: ''
      })
      const idlePauseHandler = getIPCHandler('onIdlePause')
      await idlePauseHandler!()

      // Now recover the idle time
      mockElectronAPI.recoverIdleTime.mockResolvedValue({
        recoveredSeconds: 1800,
        newEndTime: ''
      })

      await tracker.recoverIdleTime()

      // 3600 + 1800 = 5400 seconds = 1h 30m
      expect(tracker.formattedPausedTime).toBe('01:30:00')
    })
  })

  describe('recovery eligibility', () => {
    it('cannot recover after manual pause', () => {
      const tracker = useTrackerStore()

      tracker.pauseReason = 'manual'
      tracker.idleRecoveryInfo = {
        idleDurationSeconds: 600,
        lastActiveAt: '',
        idleStartedAt: '',
        pausedAt: ''
      }

      expect(tracker.canRecoverIdleTime).toBe(false)
    })

    it('cannot recover without recovery info', () => {
      const tracker = useTrackerStore()

      tracker.pauseReason = 'idle'
      tracker.idleRecoveryInfo = null

      expect(tracker.canRecoverIdleTime).toBe(false)
    })

    it('can recover only when paused by idle with recovery info', () => {
      const tracker = useTrackerStore()

      tracker.pauseReason = 'idle'
      tracker.idleRecoveryInfo = {
        idleDurationSeconds: 600,
        lastActiveAt: '',
        idleStartedAt: '',
        pausedAt: ''
      }

      expect(tracker.canRecoverIdleTime).toBe(true)
    })
  })

  describe('formatted recoverable time', () => {
    it('formats idle duration in minutes', () => {
      const tracker = useTrackerStore()

      tracker.idleRecoveryInfo = {
        idleDurationSeconds: 600, // 10 minutes
        lastActiveAt: '',
        idleStartedAt: '',
        pausedAt: ''
      }

      expect(tracker.formattedRecoverableIdleTime).toBe('10 min')
    })

    it('returns empty string when no recovery info', () => {
      const tracker = useTrackerStore()

      tracker.idleRecoveryInfo = null
      expect(tracker.formattedRecoverableIdleTime).toBe('')
    })
  })
})
