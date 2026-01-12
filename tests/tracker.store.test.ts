import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useTrackerStore } from '../src/stores/tracker.store'
import { useSettingsStore } from '../src/stores/settings.store'
import { mockElectronAPI } from './setup'

describe('Tracker Store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    // Reset mock return values
    mockElectronAPI.getCurrentTracking.mockResolvedValue(null)
    mockElectronAPI.getHandsoffMode.mockResolvedValue(false)
  })

  describe('initial state', () => {
    it('starts with no active tracking', () => {
      const store = useTrackerStore()
      expect(store.currentEntry).toBeNull()
      expect(store.currentIssue).toBeNull()
      expect(store.isTracking).toBe(false)
    })

    it('starts with handsoff mode disabled', () => {
      const store = useTrackerStore()
      expect(store.handsoffMode).toBe(false)
    })

    it('starts with zero elapsed time', () => {
      const store = useTrackerStore()
      expect(store.elapsedSeconds).toBe(0)
      expect(store.formattedTime).toBe('00:00:00')
    })
  })

  describe('formattedTime', () => {
    it('formats elapsed seconds correctly', () => {
      const store = useTrackerStore()

      store.elapsedSeconds = 0
      expect(store.formattedTime).toBe('00:00:00')

      store.elapsedSeconds = 61
      expect(store.formattedTime).toBe('00:01:01')

      store.elapsedSeconds = 3661
      expect(store.formattedTime).toBe('01:01:01')
    })
  })

  describe('isIdle', () => {
    it('returns false when idle seconds below threshold', () => {
      const store = useTrackerStore()
      const settingsStore = useSettingsStore()

      settingsStore.settings.idleIndicatorSeconds = 30
      store.idleSeconds = 29

      expect(store.isIdle).toBe(false)
    })

    it('returns true when idle seconds at or above threshold', () => {
      const store = useTrackerStore()
      const settingsStore = useSettingsStore()

      settingsStore.settings.idleIndicatorSeconds = 30
      store.idleSeconds = 30

      expect(store.isIdle).toBe(true)
    })
  })

  describe('idleProgress', () => {
    it('calculates progress towards auto-pause threshold', () => {
      const store = useTrackerStore()
      const settingsStore = useSettingsStore()

      settingsStore.settings.idleThresholdMinutes = 10 // 600 seconds

      store.idleSeconds = 0
      expect(store.idleProgress).toBe(0)

      store.idleSeconds = 300
      expect(store.idleProgress).toBe(50)

      store.idleSeconds = 600
      expect(store.idleProgress).toBe(100)
    })

    it('caps at 100%', () => {
      const store = useTrackerStore()
      const settingsStore = useSettingsStore()

      settingsStore.settings.idleThresholdMinutes = 10
      store.idleSeconds = 1200

      expect(store.idleProgress).toBe(100)
    })
  })

  describe('formattedIdleTime', () => {
    it('returns empty string when below indicator threshold', () => {
      const store = useTrackerStore()
      const settingsStore = useSettingsStore()

      settingsStore.settings.idleIndicatorSeconds = 30
      store.idleSeconds = 29

      expect(store.formattedIdleTime).toBe('')
    })

    it('formats seconds when less than a minute', () => {
      const store = useTrackerStore()
      const settingsStore = useSettingsStore()

      settingsStore.settings.idleIndicatorSeconds = 30
      store.idleSeconds = 45

      expect(store.formattedIdleTime).toBe('45s')
    })

    it('formats minutes and seconds when >= 1 minute', () => {
      const store = useTrackerStore()
      const settingsStore = useSettingsStore()

      settingsStore.settings.idleIndicatorSeconds = 30
      store.idleSeconds = 90

      expect(store.formattedIdleTime).toBe('1m 30s')
    })
  })

  describe('startTracking', () => {
    it('calls API and updates state', async () => {
      const store = useTrackerStore()
      const mockEntry = { id: 1, issueId: 1, startedAt: new Date().toISOString(), endedAt: null }
      const mockIssue = { id: 1, externalId: '#123', name: 'Test Issue' }

      mockElectronAPI.startTracking.mockResolvedValue(mockEntry)
      mockElectronAPI.getIssues.mockResolvedValue([mockIssue])

      await store.startTracking(1)

      expect(mockElectronAPI.startTracking).toHaveBeenCalledWith(1)
      expect(store.currentEntry).toEqual(mockEntry)
      expect(store.currentIssue).toEqual(mockIssue)
    })
  })

  describe('pauseTracking', () => {
    it('calls API and clears state', async () => {
      const store = useTrackerStore()
      store.currentEntry = { id: 1, issueId: 1, startedAt: '', endedAt: null, pausedReason: null, notes: null }
      store.currentIssue = { id: 1, externalId: '#1', name: 'Test', link: null, notes: null, archived: false, createdAt: '' }

      await store.pauseTracking()

      expect(mockElectronAPI.pauseTracking).toHaveBeenCalledWith('manual')
      expect(store.currentEntry).toBeNull()
      expect(store.currentIssue).toBeNull()
    })
  })
})
