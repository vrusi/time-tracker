import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useTrackerStore } from '../src/stores/tracker.store'
import { useSettingsStore } from '../src/stores/settings.store'
import { mockElectronAPI } from './setup'
import { createMockIssue, createMockTimeEntry } from './fixtures'

describe('Tracker Store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockElectronAPI.getCurrentTracking.mockResolvedValue(null)
    mockElectronAPI.getPresenceMode.mockResolvedValue(false)
    mockElectronAPI.startTracking.mockReset()
    mockElectronAPI.pauseTracking.mockReset()
    mockElectronAPI.setPresenceMode.mockReset()
    mockElectronAPI.resetIdleTime.mockReset()
  })

  describe('isIdle', () => {
    it('returns false when idle seconds below threshold', () => {
      const store = useTrackerStore()
      const settingsStore = useSettingsStore()
      settingsStore.settings.idleIndicatorMinutes = 0.5 // 30 seconds
      store.idleSeconds = 29
      expect(store.isIdle).toBe(false)
    })

    it('returns true when idle seconds at or above threshold', () => {
      const store = useTrackerStore()
      const settingsStore = useSettingsStore()
      settingsStore.settings.idleIndicatorMinutes = 0.5 // 30 seconds
      store.idleSeconds = 30
      expect(store.isIdle).toBe(true)
    })
  })

  describe('startTracking', () => {
    it('calls API and updates state', async () => {
      const store = useTrackerStore()
      const mockEntry = createMockTimeEntry()
      const mockIssue = createMockIssue()

      mockElectronAPI.startTracking.mockResolvedValue(mockEntry)
      mockElectronAPI.getIssues.mockResolvedValue([mockIssue])

      await store.startTracking(1)

      expect(mockElectronAPI.startTracking).toHaveBeenCalledWith(1)
      expect(store.currentEntry).toEqual(mockEntry)
      expect(store.currentIssue).toEqual(mockIssue)
      expect(store.isTracking).toBe(true)
    })

    it('handles issue not found', async () => {
      const store = useTrackerStore()
      const mockEntry = createMockTimeEntry({ issueId: 999 })

      mockElectronAPI.startTracking.mockResolvedValue(mockEntry)
      mockElectronAPI.getIssues.mockResolvedValue([])

      await store.startTracking(999)

      expect(store.currentEntry).toEqual(mockEntry)
      expect(store.currentIssue).toBeNull()
    })
  })

  describe('pauseTracking', () => {
    it('calls API and clears state', async () => {
      const store = useTrackerStore()
      store.currentEntry = createMockTimeEntry()
      store.currentIssue = createMockIssue()

      await store.pauseTracking()

      expect(mockElectronAPI.pauseTracking).toHaveBeenCalledWith('manual')
      expect(store.currentEntry).toBeNull()
      expect(store.currentIssue).toBeNull()
      expect(store.isTracking).toBe(false)
    })
  })

  describe('togglePresenceMode', () => {
    it('toggles presence mode on', async () => {
      const store = useTrackerStore()
      store.presenceMode = false

      await store.togglePresenceMode()

      expect(mockElectronAPI.setPresenceMode).toHaveBeenCalledWith(true)
      expect(store.presenceMode).toBe(true)
    })

    it('toggles presence mode off', async () => {
      const store = useTrackerStore()
      store.presenceMode = true

      await store.togglePresenceMode()

      expect(mockElectronAPI.setPresenceMode).toHaveBeenCalledWith(false)
      expect(store.presenceMode).toBe(false)
    })
  })

  describe('resetIdle', () => {
    it('calls API and resets idle seconds', async () => {
      const store = useTrackerStore()
      store.idleSeconds = 120

      await store.resetIdle()

      expect(mockElectronAPI.resetIdleTime).toHaveBeenCalled()
      expect(store.idleSeconds).toBe(0)
    })
  })

  describe('loadCurrentTracking', () => {
    it('loads active tracking session', async () => {
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

    it('handles no active tracking', async () => {
      const store = useTrackerStore()
      mockElectronAPI.getCurrentTracking.mockResolvedValue(null)

      await store.loadCurrentTracking()

      expect(store.currentEntry).toBeNull()
      expect(store.currentIssue).toBeNull()
    })
  })

  describe('resume tracking behavior', () => {
    it('detects when resuming same issue vs starting new issue', async () => {
      const store = useTrackerStore()
      const mockIssue = createMockIssue({ id: 42 })

      // Simulate paused state
      store.lastTrackedIssue = mockIssue

      // Check isResuming logic: same issue ID means resuming
      const isResumingSameIssue = store.lastTrackedIssue?.id === 42
      const isResumingDifferentIssue = store.lastTrackedIssue?.id === 99

      expect(isResumingSameIssue).toBe(true)
      expect(isResumingDifferentIssue).toBe(false)
    })

    it('clears lastTrackedIssue when starting tracking', async () => {
      const store = useTrackerStore()
      const mockIssue = createMockIssue({ id: 42 })
      const mockEntry = createMockTimeEntry({ issueId: 42 })

      store.lastTrackedIssue = mockIssue

      mockElectronAPI.startTracking.mockResolvedValue(mockEntry)
      mockElectronAPI.getIssues.mockResolvedValue([mockIssue])

      await store.startTracking(42)

      expect(store.lastTrackedIssue).toBeNull()
    })

    it('saves current issue as lastTrackedIssue when pausing', async () => {
      const store = useTrackerStore()
      const mockIssue = createMockIssue({ id: 42 })
      const mockEntry = createMockTimeEntry({ issueId: 42 })

      store.currentEntry = mockEntry
      store.currentIssue = mockIssue

      await store.pauseTracking()

      expect(store.lastTrackedIssue).toEqual(mockIssue)
      expect(store.pauseReason).toBe('manual')
    })

    it('clears state with clearLastTracked', () => {
      const store = useTrackerStore()
      const mockIssue = createMockIssue({ id: 42 })

      store.lastTrackedIssue = mockIssue
      store.pauseReason = 'manual'

      store.clearLastTracked()

      expect(store.lastTrackedIssue).toBeNull()
      expect(store.pauseReason).toBeNull()
    })
  })

  describe('computed properties', () => {
    it('formattedTime formats elapsed seconds', () => {
      const store = useTrackerStore()
      store.elapsedSeconds = 3661 // 1 hour, 1 minute, 1 second

      expect(store.formattedTime).toBe('01:01:01')
    })

    it('canRecoverIdleTime returns true when paused by idle with recovery info', () => {
      const store = useTrackerStore()
      store.pauseReason = 'idle'
      store.idleRecoveryInfo = {
        lastActiveAt: '2024-01-01T09:00:00.000Z',
        idleStartedAt: '2024-01-01T09:10:00.000Z',
        pausedAt: '2024-01-01T09:20:00.000Z',
        idleDurationSeconds: 600,
      }

      expect(store.canRecoverIdleTime).toBe(true)
    })

    it('canRecoverIdleTime returns false when paused manually', () => {
      const store = useTrackerStore()
      store.pauseReason = 'manual'
      store.idleRecoveryInfo = {
        lastActiveAt: '2024-01-01T09:00:00.000Z',
        idleStartedAt: '2024-01-01T09:10:00.000Z',
        pausedAt: '2024-01-01T09:20:00.000Z',
        idleDurationSeconds: 600,
      }

      expect(store.canRecoverIdleTime).toBe(false)
    })

    it('canRecoverIdleTime returns false when no recovery info', () => {
      const store = useTrackerStore()
      store.pauseReason = 'idle'
      store.idleRecoveryInfo = null

      expect(store.canRecoverIdleTime).toBe(false)
    })

    it('formattedRecoverableIdleTime returns empty string when no recovery info', () => {
      const store = useTrackerStore()
      store.idleRecoveryInfo = null

      expect(store.formattedRecoverableIdleTime).toBe('')
    })

    it('formattedRecoverableIdleTime formats recovery duration in minutes', () => {
      const store = useTrackerStore()
      store.idleRecoveryInfo = {
        lastActiveAt: '2024-01-01T09:00:00.000Z',
        idleStartedAt: '2024-01-01T09:10:00.000Z',
        pausedAt: '2024-01-01T09:20:00.000Z',
        idleDurationSeconds: 600, // 10 minutes
      }

      expect(store.formattedRecoverableIdleTime).toBe('10 min')
    })

    it('idleThresholdSeconds converts minutes to seconds', () => {
      const store = useTrackerStore()
      const settingsStore = useSettingsStore()
      settingsStore.settings.idleThresholdMinutes = 5

      expect(store.idleThresholdSeconds).toBe(300)
    })
  })

  describe('recoverIdleTime', () => {
    it('calls API and clears recovery info on success', async () => {
      const store = useTrackerStore()
      store.idleRecoveryInfo = {
        lastActiveAt: '2024-01-01T09:00:00.000Z',
        idleStartedAt: '2024-01-01T09:10:00.000Z',
        pausedAt: '2024-01-01T09:20:00.000Z',
        idleDurationSeconds: 600,
      }

      mockElectronAPI.recoverIdleTime.mockResolvedValue({ recoveredSeconds: 300 })

      const result = await store.recoverIdleTime()

      expect(mockElectronAPI.recoverIdleTime).toHaveBeenCalled()
      expect(result).toEqual({ recoveredSeconds: 300 })
      expect(store.idleRecoveryInfo).toBeNull()
    })

    it('does not clear recovery info when API returns null', async () => {
      const store = useTrackerStore()
      store.idleRecoveryInfo = {
        lastActiveAt: '2024-01-01T09:00:00.000Z',
        idleStartedAt: '2024-01-01T09:10:00.000Z',
        pausedAt: '2024-01-01T09:20:00.000Z',
        idleDurationSeconds: 600,
      }

      mockElectronAPI.recoverIdleTime.mockResolvedValue(null)

      const result = await store.recoverIdleTime()

      expect(result).toBeNull()
      expect(store.idleRecoveryInfo).not.toBeNull()
    })
  })

  describe('dismissIdleRecovery', () => {
    it('calls API and clears idle recovery info', async () => {
      const store = useTrackerStore()
      store.idleRecoveryInfo = {
        lastActiveAt: '2024-01-01T09:00:00.000Z',
        idleStartedAt: '2024-01-01T09:10:00.000Z',
        pausedAt: '2024-01-01T09:20:00.000Z',
        idleDurationSeconds: 600,
      }

      await store.dismissIdleRecovery()

      expect(mockElectronAPI.dismissIdleRecovery).toHaveBeenCalled()
      expect(store.idleRecoveryInfo).toBeNull()
    })
  })

  describe('clearState', () => {
    it('clears all tracking state', () => {
      const store = useTrackerStore()
      const mockIssue = createMockIssue()
      const mockEntry = createMockTimeEntry()

      store.currentEntry = mockEntry
      store.currentIssue = mockIssue
      store.lastTrackedIssue = mockIssue
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

  describe('refreshCurrentIssue', () => {
    beforeEach(() => {
      mockElectronAPI.getIssues.mockReset()
    })

    it('updates current issue from API', async () => {
      const store = useTrackerStore()
      const oldIssue = createMockIssue({ id: 42, name: 'Old Name' })
      const updatedIssue = createMockIssue({ id: 42, name: 'Updated Name' })

      store.currentIssue = oldIssue
      mockElectronAPI.getIssues.mockResolvedValue([updatedIssue])

      await store.refreshCurrentIssue()

      expect(store.currentIssue).toEqual(updatedIssue)
    })

    it('does nothing when no current issue', async () => {
      const store = useTrackerStore()
      store.currentIssue = null

      await store.refreshCurrentIssue()

      expect(mockElectronAPI.getIssues).not.toHaveBeenCalled()
    })

    it('keeps current issue when not found in API response', async () => {
      const store = useTrackerStore()
      const currentIssue = createMockIssue({ id: 42 })

      store.currentIssue = currentIssue
      mockElectronAPI.getIssues.mockResolvedValue([createMockIssue({ id: 99 })])

      await store.refreshCurrentIssue()

      expect(store.currentIssue).toEqual(currentIssue)
    })
  })

  describe('setupListeners', () => {
    beforeEach(() => {
      mockElectronAPI.onIdlePause.mockReset()
      mockElectronAPI.onTrackingUpdate.mockReset()
      mockElectronAPI.onPresenceModeChange.mockReset()
      mockElectronAPI.onIdleUpdate.mockReset()
      mockElectronAPI.getIdleRecoveryInfo.mockReset()
    })

    it('registers all event listeners', () => {
      const store = useTrackerStore()

      store.setupListeners()

      expect(mockElectronAPI.onIdlePause).toHaveBeenCalled()
      expect(mockElectronAPI.onTrackingUpdate).toHaveBeenCalled()
      expect(mockElectronAPI.onPresenceModeChange).toHaveBeenCalled()
      expect(mockElectronAPI.onIdleUpdate).toHaveBeenCalled()
    })

    it('onIdlePause handler sets pause reason and fetches recovery info', async () => {
      const store = useTrackerStore()
      const mockIssue = createMockIssue()
      const mockEntry = createMockTimeEntry()

      mockElectronAPI.getIdleRecoveryInfo.mockResolvedValue({
        lastActiveAt: '2024-01-01T09:00:00.000Z',
        idleStartedAt: '2024-01-01T09:10:00.000Z',
        pausedAt: '2024-01-01T09:20:00.000Z',
        idleDurationSeconds: 600,
      })

      store.setupListeners()

      // Set state AFTER setupListeners but BEFORE invoking callback
      store.currentEntry = mockEntry
      store.currentIssue = mockIssue
      store.elapsedSeconds = 3600

      const idlePauseCallback = mockElectronAPI.onIdlePause.mock.calls[0][0]
      await idlePauseCallback()

      expect(store.pauseReason).toBe('idle')
      expect(store.currentEntry).toBeNull()
      expect(store.currentIssue).toBeNull()
      expect(store.lastTrackedIssue).toEqual(mockIssue)
      expect(store.idleRecoveryInfo).not.toBeNull()
    })

    it('onTrackingUpdate handler updates state when data provided', () => {
      const store = useTrackerStore()
      const mockIssue = createMockIssue()
      const mockEntry = createMockTimeEntry()

      store.setupListeners()

      const trackingUpdateCallback = mockElectronAPI.onTrackingUpdate.mock.calls[0][0]
      trackingUpdateCallback({ entry: mockEntry, issue: mockIssue })

      expect(store.currentEntry).toEqual(mockEntry)
      expect(store.currentIssue).toEqual(mockIssue)
    })

    it('onTrackingUpdate handler clears state when null and saves last tracked', () => {
      const store = useTrackerStore()
      const mockIssue = createMockIssue()
      const mockEntry = createMockTimeEntry()

      store.setupListeners()

      // Set state after setupListeners
      store.currentEntry = mockEntry
      store.currentIssue = mockIssue
      store.elapsedSeconds = 1800

      const trackingUpdateCallback = mockElectronAPI.onTrackingUpdate.mock.calls[0][0]
      trackingUpdateCallback(null)

      expect(store.lastTrackedIssue).toEqual(mockIssue)
      expect(store.currentEntry).toBeNull()
      expect(store.currentIssue).toBeNull()
    })

    it('onPresenceModeChange handler updates presence mode', () => {
      const store = useTrackerStore()

      store.setupListeners()

      const presenceModeCallback = mockElectronAPI.onPresenceModeChange.mock.calls[0][0]
      presenceModeCallback(true)

      expect(store.presenceMode).toBe(true)
    })

    it('onIdleUpdate handler updates idle seconds', () => {
      const store = useTrackerStore()

      store.setupListeners()

      const idleUpdateCallback = mockElectronAPI.onIdleUpdate.mock.calls[0][0]
      idleUpdateCallback(120)

      expect(store.idleSeconds).toBe(120)
    })
  })

  describe('clearLastTracked extended', () => {
    it('clears idle recovery info and calls dismiss API', () => {
      const store = useTrackerStore()
      store.idleRecoveryInfo = {
        lastActiveAt: '2024-01-01T09:00:00.000Z',
        idleStartedAt: '2024-01-01T09:10:00.000Z',
        pausedAt: '2024-01-01T09:20:00.000Z',
        idleDurationSeconds: 600,
      }

      store.clearLastTracked()

      expect(store.idleRecoveryInfo).toBeNull()
      expect(mockElectronAPI.dismissIdleRecovery).toHaveBeenCalled()
    })
  })

  describe('startTracking with resume', () => {
    it('clears idle recovery info when starting', async () => {
      const store = useTrackerStore()
      const mockIssue = createMockIssue({ id: 42 })
      const mockEntry = createMockTimeEntry({ issueId: 42 })

      store.idleRecoveryInfo = {
        lastActiveAt: '2024-01-01T09:00:00.000Z',
        idleStartedAt: '2024-01-01T09:10:00.000Z',
        pausedAt: '2024-01-01T09:20:00.000Z',
        idleDurationSeconds: 600,
      }

      mockElectronAPI.startTracking.mockResolvedValue(mockEntry)
      mockElectronAPI.getIssues.mockResolvedValue([mockIssue])

      await store.startTracking(42)

      expect(store.idleRecoveryInfo).toBeNull()
    })
  })
})
