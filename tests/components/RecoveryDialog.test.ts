import { describe, it, expect } from 'vitest'
import { formatDuration } from '../../src/utils/format'

/**
 * Recovery Dialog Logic - time calculations for crash recovery decisions.
 * Critical for accurate user information when deciding what time to keep.
 */
describe('Recovery Dialog Logic', () => {
  interface TrackingRecoveryInfo {
    entry: { id: number; issueId: number; startedAt: string }
    issue: { id: number; externalId: string; name: string }
    lastSeenAt: string
    totalElapsedSeconds: number
    elapsedSinceLastSeenSeconds: number
  }

  describe('time calculations for recovery options', () => {
    function calculateTimeAtClose(recovery: TrackingRecoveryInfo): string {
      const timeAtCloseSeconds = Math.max(0, recovery.totalElapsedSeconds - recovery.elapsedSinceLastSeenSeconds)
      return formatDuration(timeAtCloseSeconds)
    }

    it('calculates time tracked before app closed', () => {
      const recovery: TrackingRecoveryInfo = {
        entry: { id: 1, issueId: 1, startedAt: '2024-01-15T09:00:00.000Z' },
        issue: { id: 1, externalId: '#1', name: 'Test' },
        lastSeenAt: '2024-01-15T10:00:00.000Z',
        totalElapsedSeconds: 7200, // 2 hours total
        elapsedSinceLastSeenSeconds: 3600 // 1 hour since close
      }

      expect(formatDuration(recovery.elapsedSinceLastSeenSeconds)).toBe('1h 0m')
      expect(formatDuration(recovery.totalElapsedSeconds)).toBe('2h 0m')
      expect(calculateTimeAtClose(recovery)).toBe('1h 0m') // 2h - 1h
    })

    it('prevents negative time values from stale data', () => {
      const recovery: TrackingRecoveryInfo = {
        entry: { id: 1, issueId: 1, startedAt: '2024-01-15T09:00:00.000Z' },
        issue: { id: 1, externalId: '#1', name: 'Test' },
        lastSeenAt: '2024-01-15T09:30:00.000Z',
        totalElapsedSeconds: 1800,
        elapsedSinceLastSeenSeconds: 3600 // More than total (shouldn't happen)
      }

      expect(calculateTimeAtClose(recovery)).toBe('0m') // Clamped to 0
    })
  })

  describe('recovery threshold', () => {
    const RECOVERY_THRESHOLD_SECONDS = 60

    function shouldShowRecovery(elapsedSinceClose: number): boolean {
      return elapsedSinceClose >= RECOVERY_THRESHOLD_SECONDS
    }

    it('shows recovery dialog when app was closed for 60+ seconds', () => {
      expect(shouldShowRecovery(30)).toBe(false) // Quick restart
      expect(shouldShowRecovery(60)).toBe(true)  // Threshold
      expect(shouldShowRecovery(300)).toBe(true) // Long gap
    })
  })
})
