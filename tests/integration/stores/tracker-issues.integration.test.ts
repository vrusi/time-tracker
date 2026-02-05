import { describe, it, expect } from 'vitest'
import { useTrackerStore } from '../../../src/stores/tracker.store'
import { useIssuesStore } from '../../../src/stores/issues.store'
import { setupStoreIntegration, getIPCHandler } from './setup'
import { mockElectronAPI } from '../../setup'
import { createMockIssue, createMockTimeEntry } from '../../fixtures'

/**
 * Integration tests: Tracker + Issues stores working together.
 * Tests behavior when issues are archived/deleted while being tracked.
 */
describe('Tracker + Issues Integration', () => {
  setupStoreIntegration()

  describe('tracking with archived issues', () => {
    it('tracker continues with archived issue until manually stopped', async () => {
      const tracker = useTrackerStore()
      const issues = useIssuesStore()

      const issue = createMockIssue({ id: 1, name: 'Test Issue' })
      const archivedIssue = createMockIssue({ id: 1, name: 'Test Issue', archived: true })
      const entry = createMockTimeEntry({ issueId: 1 })

      // Setup: tracking an issue
      mockElectronAPI.startTracking.mockResolvedValue(entry)
      mockElectronAPI.getIssues.mockResolvedValue([issue])
      await tracker.startTracking(1)

      expect(tracker.isTracking).toBe(true)
      expect(tracker.currentIssue?.id).toBe(1)

      // Archive the issue
      mockElectronAPI.archiveIssue.mockResolvedValue(undefined)
      mockElectronAPI.getIssues.mockResolvedValue([archivedIssue])
      await issues.archiveIssue(1)

      // Tracking should still be active
      expect(tracker.isTracking).toBe(true)
      expect(tracker.currentIssue?.id).toBe(1)
    })

    it('refreshCurrentIssue updates tracker with latest issue data', async () => {
      const tracker = useTrackerStore()

      const issue = createMockIssue({ id: 1, name: 'Original Name' })
      const updatedIssue = createMockIssue({ id: 1, name: 'Updated Name' })
      const entry = createMockTimeEntry({ issueId: 1 })

      // Start tracking
      mockElectronAPI.startTracking.mockResolvedValue(entry)
      mockElectronAPI.getIssues.mockResolvedValue([issue])
      await tracker.startTracking(1)

      expect(tracker.currentIssue?.name).toBe('Original Name')

      // Issue updated in backend
      mockElectronAPI.getIssues.mockResolvedValue([updatedIssue])
      await tracker.refreshCurrentIssue()

      expect(tracker.currentIssue?.name).toBe('Updated Name')
    })

    it('archived issues appear in issues store archivedIssues', async () => {
      const issues = useIssuesStore()

      const activeIssue = createMockIssue({ id: 1, archived: false })
      const archivedIssue = createMockIssue({ id: 2, archived: true })

      mockElectronAPI.getIssues.mockResolvedValue([activeIssue, archivedIssue])
      await issues.loadIssues()

      expect(issues.activeIssues).toHaveLength(1)
      expect(issues.activeIssues[0].id).toBe(1)
      expect(issues.archivedIssues).toHaveLength(1)
      expect(issues.archivedIssues[0].id).toBe(2)
    })
  })

  describe('tracking with deleted issues', () => {
    it('tracker state requires explicit cleanup after deleting tracked issue', async () => {
      const tracker = useTrackerStore()
      const issues = useIssuesStore()

      const issue = createMockIssue({ id: 1 })
      const entry = createMockTimeEntry({ issueId: 1 })

      // Setup: load issues and start tracking
      mockElectronAPI.getIssues.mockResolvedValue([issue])
      await issues.loadIssues()

      mockElectronAPI.startTracking.mockResolvedValue(entry)
      await tracker.startTracking(1)

      expect(tracker.isTracking).toBe(true)

      // Delete the issue (would fail due to FK constraint in real DB,
      // but frontend handles optimistically)
      mockElectronAPI.deleteIssue.mockResolvedValue(undefined)
      await issues.deleteIssue(1)

      // Issue removed from issues store
      expect(issues.issues).toHaveLength(0)

      // Tracker still has stale reference (until clearState or pause)
      expect(tracker.currentIssue?.id).toBe(1)

      // Explicit cleanup
      tracker.clearState()
      expect(tracker.currentIssue).toBeNull()
      expect(tracker.isTracking).toBe(false)
    })
  })

  describe('last tracked issue coordination', () => {
    it('tracks last issue when paused manually', async () => {
      const tracker = useTrackerStore()

      const issue = createMockIssue({ id: 1, name: 'My Issue' })
      const entry = createMockTimeEntry({ issueId: 1 })

      mockElectronAPI.startTracking.mockResolvedValue(entry)
      mockElectronAPI.getIssues.mockResolvedValue([issue])
      mockElectronAPI.pauseTracking.mockResolvedValue(undefined)

      await tracker.startTracking(1)
      await tracker.pauseTracking()

      expect(tracker.lastTrackedIssue?.id).toBe(1)
      expect(tracker.lastTrackedIssue?.name).toBe('My Issue')
      expect(tracker.pauseReason).toBe('manual')
    })

    it('clears last tracked issue when clearLastTracked called', async () => {
      const tracker = useTrackerStore()

      const issue = createMockIssue({ id: 1 })
      const entry = createMockTimeEntry({ issueId: 1 })

      mockElectronAPI.startTracking.mockResolvedValue(entry)
      mockElectronAPI.getIssues.mockResolvedValue([issue])
      mockElectronAPI.pauseTracking.mockResolvedValue(undefined)

      await tracker.startTracking(1)
      await tracker.pauseTracking()

      expect(tracker.lastTrackedIssue).not.toBeNull()

      tracker.clearLastTracked()

      expect(tracker.lastTrackedIssue).toBeNull()
      expect(tracker.pauseReason).toBeNull()
    })

    it('resuming same issue keeps lastTrackedIssue cleared', async () => {
      const tracker = useTrackerStore()

      const issue = createMockIssue({ id: 1 })
      const entry1 = createMockTimeEntry({ issueId: 1 })
      const entry2 = createMockTimeEntry({ id: 2, issueId: 1 })

      mockElectronAPI.startTracking.mockResolvedValue(entry1)
      mockElectronAPI.getIssues.mockResolvedValue([issue])
      mockElectronAPI.pauseTracking.mockResolvedValue(undefined)

      // Start and accumulate time
      await tracker.startTracking(1)
      tracker.elapsedSeconds = 3600 // 1 hour

      // Pause - this saves elapsedSeconds to internal pausedElapsedSeconds
      await tracker.pauseTracking()
      // After pause, formattedPausedTime reflects the saved elapsed value (1 hour)
      expect(tracker.formattedPausedTime).toBe('01:00:00')
      expect(tracker.lastTrackedIssue?.id).toBe(1)

      // Resume same issue
      mockElectronAPI.startTracking.mockResolvedValue(entry2)
      await tracker.startTracking(1)

      // lastTrackedIssue is cleared because we're now actively tracking
      expect(tracker.lastTrackedIssue).toBeNull()
      expect(tracker.isTracking).toBe(true)
    })
  })
})
