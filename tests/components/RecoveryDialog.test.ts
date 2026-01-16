import { describe, it, expect } from 'vitest'
import { formatDuration } from '../../src/utils/format'

/**
 * Tests for RecoveryDialog component logic.
 * Focus on time calculations that are critical for user decision-making.
 */
describe('RecoveryDialog Logic', () => {
  interface TrackingRecoveryInfo {
    entry: { id: number; issueId: number; startedAt: string }
    issue: { id: number; externalId: string; name: string }
    lastSeenAt: string
    totalElapsedSeconds: number
    elapsedSinceLastSeenSeconds: number
  }

  describe('time calculations', () => {
    describe('closedAgo', () => {
      it('formats elapsed time since last seen', () => {
        const recovery: TrackingRecoveryInfo = {
          entry: { id: 1, issueId: 1, startedAt: '2024-01-15T09:00:00.000Z' },
          issue: { id: 1, externalId: '#1', name: 'Test' },
          lastSeenAt: '2024-01-15T10:00:00.000Z',
          totalElapsedSeconds: 7200, // 2 hours total
          elapsedSinceLastSeenSeconds: 3600 // 1 hour since close
        }

        const closedAgo = formatDuration(recovery.elapsedSinceLastSeenSeconds)

        expect(closedAgo).toBe('1h 0m')
      })

      it('handles minutes only', () => {
        const recovery: TrackingRecoveryInfo = {
          entry: { id: 1, issueId: 1, startedAt: '2024-01-15T09:00:00.000Z' },
          issue: { id: 1, externalId: '#1', name: 'Test' },
          lastSeenAt: '2024-01-15T09:45:00.000Z',
          totalElapsedSeconds: 3600,
          elapsedSinceLastSeenSeconds: 900 // 15 minutes
        }

        const closedAgo = formatDuration(recovery.elapsedSinceLastSeenSeconds)

        expect(closedAgo).toBe('15m')
      })
    })

    describe('totalElapsed', () => {
      it('formats total elapsed time', () => {
        const recovery: TrackingRecoveryInfo = {
          entry: { id: 1, issueId: 1, startedAt: '2024-01-15T09:00:00.000Z' },
          issue: { id: 1, externalId: '#1', name: 'Test' },
          lastSeenAt: '2024-01-15T10:00:00.000Z',
          totalElapsedSeconds: 7200, // 2 hours
          elapsedSinceLastSeenSeconds: 3600
        }

        const totalElapsed = formatDuration(recovery.totalElapsedSeconds)

        expect(totalElapsed).toBe('2h 0m')
      })
    })

    describe('timeAtClose', () => {
      /**
       * Calculates time tracked before app closed
       */
      function calculateTimeAtClose(recovery: TrackingRecoveryInfo): string {
        const timeAtCloseSeconds = Math.max(0, recovery.totalElapsedSeconds - recovery.elapsedSinceLastSeenSeconds)
        return formatDuration(timeAtCloseSeconds)
      }

      it('computes time tracked before close', () => {
        const recovery: TrackingRecoveryInfo = {
          entry: { id: 1, issueId: 1, startedAt: '2024-01-15T09:00:00.000Z' },
          issue: { id: 1, externalId: '#1', name: 'Test' },
          lastSeenAt: '2024-01-15T10:00:00.000Z',
          totalElapsedSeconds: 7200, // 2 hours total
          elapsedSinceLastSeenSeconds: 3600 // 1 hour since close
        }

        const timeAtClose = calculateTimeAtClose(recovery)

        expect(timeAtClose).toBe('1h 0m') // 2h - 1h = 1h
      })

      it('prevents negative values (handles stale data)', () => {
        // Edge case: elapsed since close > total (shouldn't happen but safety check)
        const recovery: TrackingRecoveryInfo = {
          entry: { id: 1, issueId: 1, startedAt: '2024-01-15T09:00:00.000Z' },
          issue: { id: 1, externalId: '#1', name: 'Test' },
          lastSeenAt: '2024-01-15T09:30:00.000Z',
          totalElapsedSeconds: 1800,
          elapsedSinceLastSeenSeconds: 3600 // More than total (stale data)
        }

        const timeAtClose = calculateTimeAtClose(recovery)

        expect(timeAtClose).toBe('0m') // Clamped to 0
      })

      it('handles zero elapsed since close', () => {
        const recovery: TrackingRecoveryInfo = {
          entry: { id: 1, issueId: 1, startedAt: '2024-01-15T09:00:00.000Z' },
          issue: { id: 1, externalId: '#1', name: 'Test' },
          lastSeenAt: '2024-01-15T10:00:00.000Z',
          totalElapsedSeconds: 3600,
          elapsedSinceLastSeenSeconds: 0 // Just closed
        }

        const timeAtClose = calculateTimeAtClose(recovery)

        expect(timeAtClose).toBe('1h 0m') // All time is "at close"
      })
    })
  })

  describe('recovery threshold (60 seconds minimum)', () => {
    /**
     * Recovery dialog should only appear if tracked time before close >= 60 seconds.
     * This prevents showing "recover 0m" when only seconds were tracked.
     */
    const RECOVERY_THRESHOLD_SECONDS = 60

    function shouldShowRecovery(totalSeconds: number, elapsedSinceClose: number): boolean {
      const timeAtClose = totalSeconds - elapsedSinceClose
      return timeAtClose >= RECOVERY_THRESHOLD_SECONDS
    }

    it('shows recovery when tracked time >= 60 seconds', () => {
      // Time at close = 60 seconds (exactly at threshold)
      expect(shouldShowRecovery(3660, 3600)).toBe(true)
    })

    it('skips recovery when tracked time < 60 seconds', () => {
      // Time at close = 30 seconds (below threshold)
      expect(shouldShowRecovery(3630, 3600)).toBe(false)
    })
  })

  describe('button label time estimates', () => {
    function calculateTimeAtClose(totalSeconds: number, elapsedSinceClose: number): string {
      const timeAtCloseSeconds = Math.max(0, totalSeconds - elapsedSinceClose)
      return formatDuration(timeAtCloseSeconds)
    }

    it('end-at-close button shows time at close', () => {
      const totalElapsedSeconds = 7200 // 2 hours
      const elapsedSinceLastSeenSeconds = 3600 // 1 hour

      const timeAtClose = calculateTimeAtClose(totalElapsedSeconds, elapsedSinceLastSeenSeconds)

      expect(timeAtClose).toBe('1h 0m')
      // Button would show: "End at close time (1h 0m)"
    })

    it('keep-all button shows total elapsed', () => {
      const totalElapsedSeconds = 7200 // 2 hours

      const totalElapsed = formatDuration(totalElapsedSeconds)

      expect(totalElapsed).toBe('2h 0m')
      // Button would show: "Keep all time (2h 0m)"
    })
  })
})
