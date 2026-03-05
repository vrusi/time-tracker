import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useTrackerStore } from '../src/stores/tracker.store'
import { useSettingsStore } from '../src/stores/settings.store'
import { mockElectronAPI } from './setup'
import { createMockIssue, createMockTimeEntry } from './fixtures'

/**
 * Tracker Store - manages active time tracking state.
 * Tests focus on state transitions and business rules.
 */
describe('Tracker Store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockElectronAPI.getCurrentTracking.mockResolvedValue(null)
    mockElectronAPI.getPresenceMode.mockResolvedValue(false)
    mockElectronAPI.startTracking.mockReset()
    mockElectronAPI.pauseTracking.mockReset()
    mockElectronAPI.setPresenceMode.mockReset()
    mockElectronAPI.resetIdleTime.mockReset()
    mockElectronAPI.recoverIdleTime.mockReset()
    mockElectronAPI.dismissIdleRecovery.mockReset()
    mockElectronAPI.getIdleRecoveryInfo.mockReset()
  })

  describe('elapsed time calculation', () => {
    afterEach(() => {
      vi.useRealTimers()
    })

    it('never shows negative elapsed time when startedAt is in the future', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2024-01-15T10:00:00.000Z'))

      const futureEntry = createMockTimeEntry({
        startedAt: '2024-01-15T11:00:00.000Z',
        endedAt: null
      })
      const issue = createMockIssue({ id: futureEntry.issueId })

      mockElectronAPI.getCurrentTracking.mockResolvedValue({
        entry: futureEntry,
        issue
      })

      const store = useTrackerStore()
      await store.loadCurrentTracking()

      expect(store.elapsedSeconds).toBe(0) // Clamped to 0, not -3600
    })
  })

  describe('idle detection', () => {
    it('marks user as idle when idle time exceeds indicator threshold', () => {
      const store = useTrackerStore()
      const settingsStore = useSettingsStore()
      settingsStore.settings.idleIndicatorMinutes = 0.5 // 30 seconds

      store.idleSeconds = 29
      expect(store.isIdle).toBe(false)

      store.idleSeconds = 30
      expect(store.isIdle).toBe(true)
    })

    it('converts idle threshold from minutes to seconds', () => {
      const store = useTrackerStore()
      const settingsStore = useSettingsStore()
      settingsStore.settings.idleThresholdMinutes = 5

      expect(store.idleThresholdSeconds).toBe(300)
    })
  })

  describe('tracking lifecycle', () => {
    it('transitions to tracking state when started', async () => {
      const store = useTrackerStore()
      const mockEntry = createMockTimeEntry()
      const mockIssue = createMockIssue()

      mockElectronAPI.startTracking.mockResolvedValue(mockEntry)
      mockElectronAPI.getIssues.mockResolvedValue([mockIssue])

      expect(store.isTracking).toBe(false)
      await store.startTracking(1)

      expect(store.isTracking).toBe(true)
      expect(store.currentEntry).toEqual(mockEntry)
      expect(store.currentIssue).toEqual(mockIssue)
    })

    it('transitions to paused state and remembers last issue', async () => {
      const store = useTrackerStore()
      const mockIssue = createMockIssue({ id: 42 })
      store.currentEntry = createMockTimeEntry()
      store.currentIssue = mockIssue

      await store.pauseTracking()

      expect(store.isTracking).toBe(false)
      expect(store.currentEntry).toBeNull()
      expect(store.lastTrackedIssue).toEqual(mockIssue)
      expect(store.pauseReason).toBe('manual')
    })

    it('clears last tracked issue when explicitly dismissed', () => {
      const store = useTrackerStore()
      store.lastTrackedIssue = createMockIssue()
      store.pauseReason = 'manual'
      store.idleRecoveryInfo = {
        lastActiveAt: '2024-01-01T09:00:00.000Z',
        idleStartedAt: '2024-01-01T09:10:00.000Z',
        pausedAt: '2024-01-01T09:20:00.000Z',
        idleDurationSeconds: 600,
      }

      store.clearLastTracked()

      expect(store.lastTrackedIssue).toBeNull()
      expect(store.pauseReason).toBeNull()
      expect(store.idleRecoveryInfo).toBeNull()
    })

    it('clears all state when switching projects', () => {
      const store = useTrackerStore()
      store.currentEntry = createMockTimeEntry()
      store.currentIssue = createMockIssue()
      store.lastTrackedIssue = createMockIssue()
      store.elapsedSeconds = 3600
      store.pauseReason = 'manual'

      store.clearState()

      expect(store.currentEntry).toBeNull()
      expect(store.currentIssue).toBeNull()
      expect(store.lastTrackedIssue).toBeNull()
      expect(store.elapsedSeconds).toBe(0)
      expect(store.pauseReason).toBeNull()
    })
  })

  describe('idle recovery', () => {
    const mockRecoveryInfo = {
      lastActiveAt: '2024-01-01T09:00:00.000Z',
      idleStartedAt: '2024-01-01T09:10:00.000Z',
      pausedAt: '2024-01-01T09:20:00.000Z',
      idleDurationSeconds: 600,
    }

    it('allows recovery only when paused by idle with recovery info available', () => {
      const store = useTrackerStore()

      // Manual pause - no recovery
      store.pauseReason = 'manual'
      store.idleRecoveryInfo = mockRecoveryInfo
      expect(store.canRecoverIdleTime).toBe(false)

      // Idle pause without info - no recovery
      store.pauseReason = 'idle'
      store.idleRecoveryInfo = null
      expect(store.canRecoverIdleTime).toBe(false)

      // Idle pause with info - can recover
      store.idleRecoveryInfo = mockRecoveryInfo
      expect(store.canRecoverIdleTime).toBe(true)
    })

    it('formats recoverable time in minutes', () => {
      const store = useTrackerStore()

      store.idleRecoveryInfo = null
      expect(store.formattedRecoverableIdleTime).toBe('')

      store.idleRecoveryInfo = mockRecoveryInfo // 600 seconds = 10 min
      expect(store.formattedRecoverableIdleTime).toBe('10 min')
    })

    it('clears recovery info after successful recovery', async () => {
      const store = useTrackerStore()
      store.idleRecoveryInfo = mockRecoveryInfo
      mockElectronAPI.recoverIdleTime.mockResolvedValue({ recoveredSeconds: 300 })

      await store.recoverIdleTime()

      expect(store.idleRecoveryInfo).toBeNull()
    })

    it('preserves recovery info if recovery fails', async () => {
      const store = useTrackerStore()
      store.idleRecoveryInfo = mockRecoveryInfo
      mockElectronAPI.recoverIdleTime.mockResolvedValue(null)

      await store.recoverIdleTime()

      expect(store.idleRecoveryInfo).not.toBeNull()
    })

    it('clears recovery info when dismissed', async () => {
      const store = useTrackerStore()
      store.idleRecoveryInfo = mockRecoveryInfo

      await store.dismissIdleRecovery()

      expect(store.idleRecoveryInfo).toBeNull()
    })
  })

  describe('presence mode', () => {
    it('toggles presence mode state', async () => {
      const store = useTrackerStore()

      store.presenceMode = false
      await store.togglePresenceMode()
      expect(store.presenceMode).toBe(true)

      await store.togglePresenceMode()
      expect(store.presenceMode).toBe(false)
    })
  })

  describe('loading state from backend', () => {
    it('restores active tracking session on load', async () => {
      const store = useTrackerStore()
      const mockEntry = createMockTimeEntry()
      const mockIssue = createMockIssue()

      mockElectronAPI.getCurrentTracking.mockResolvedValue({
        entry: mockEntry,
        issue: mockIssue,
      })
      mockElectronAPI.getPresenceMode.mockResolvedValue(true)

      await store.loadCurrentTracking()

      expect(store.currentEntry).toEqual(mockEntry)
      expect(store.currentIssue).toEqual(mockIssue)
      expect(store.presenceMode).toBe(true)
    })

    it('handles no active session gracefully', async () => {
      const store = useTrackerStore()
      mockElectronAPI.getCurrentTracking.mockResolvedValue(null)

      await store.loadCurrentTracking()

      expect(store.currentEntry).toBeNull()
      expect(store.currentIssue).toBeNull()
    })
  })

  describe('IPC event handlers', () => {
    beforeEach(() => {
      mockElectronAPI.onIdlePause.mockReset()
      mockElectronAPI.onTrackingUpdate.mockReset()
      mockElectronAPI.onPresenceModeChange.mockReset()
      mockElectronAPI.onIdleUpdate.mockReset()
    })

    it('handles idle pause event by saving state and fetching recovery info', async () => {
      const store = useTrackerStore()
      const mockIssue = createMockIssue()

      mockElectronAPI.getIdleRecoveryInfo.mockResolvedValue({
        lastActiveAt: '2024-01-01T09:00:00.000Z',
        idleStartedAt: '2024-01-01T09:10:00.000Z',
        pausedAt: '2024-01-01T09:20:00.000Z',
        idleDurationSeconds: 600,
      })

      store.setupListeners()
      store.currentEntry = createMockTimeEntry()
      store.currentIssue = mockIssue
      store.elapsedSeconds = 3600

      const idlePauseHandler = mockElectronAPI.onIdlePause.mock.calls[0][0]
      await idlePauseHandler()

      expect(store.pauseReason).toBe('idle')
      expect(store.lastTrackedIssue).toEqual(mockIssue)
      expect(store.currentEntry).toBeNull()
      expect(store.idleRecoveryInfo).not.toBeNull()
    })

    it('handles tracking update events', () => {
      const store = useTrackerStore()
      const mockIssue = createMockIssue()
      const mockEntry = createMockTimeEntry()

      store.setupListeners()
      const trackingUpdateHandler = mockElectronAPI.onTrackingUpdate.mock.calls[0][0]

      // Tracking started
      trackingUpdateHandler({ entry: mockEntry, issue: mockIssue })
      expect(store.currentEntry).toEqual(mockEntry)
      expect(store.currentIssue).toEqual(mockIssue)
    })

    it('handles presence mode change events', () => {
      const store = useTrackerStore()

      store.setupListeners()
      const presenceModeHandler = mockElectronAPI.onPresenceModeChange.mock.calls[0][0]

      presenceModeHandler(true)
      expect(store.presenceMode).toBe(true)
    })

    it('handles idle update events', () => {
      const store = useTrackerStore()

      store.setupListeners()
      const idleUpdateHandler = mockElectronAPI.onIdleUpdate.mock.calls[0][0]

      idleUpdateHandler(120)
      expect(store.idleSeconds).toBe(120)
    })
  })
})
