/**
 * Format seconds into human-readable duration (e.g., "2h 30m")
 */
export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (hours > 0) {
    return `${hours}h ${minutes}m`
  }
  return `${minutes}m`
}

/**
 * Format ISO string to time (e.g., "09:30 AM")
 */
export function formatTime(isoString: string): string {
  return new Date(isoString).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit'
  })
}

/**
 * Format seconds to hours string (e.g., "2.5h" or "45m")
 */
export function formatHours(seconds: number): string {
  if (seconds === 0) return ''
  const hours = seconds / 3600
  if (hours >= 1) {
    return `${hours.toFixed(1)}h`
  }
  const minutes = Math.floor(seconds / 60)
  return `${minutes}m`
}

/**
 * Format money amount with currency symbol
 */
export function formatMoney(amount: number, symbol: string): string {
  return `${symbol}${amount.toFixed(2)}`
}

/**
 * Format seconds to timer display (HH:MM:SS)
 */
export function formatTimer(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
}

/**
 * Format idle time (e.g., "2m 30s" or "45s")
 */
export function formatIdleTime(idleSeconds: number, thresholdSeconds: number): string {
  if (idleSeconds < thresholdSeconds) return ''
  const minutes = Math.floor(idleSeconds / 60)
  const seconds = idleSeconds % 60
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`
  }
  return `${seconds}s`
}

/**
 * Calculate idle progress percentage towards auto-pause
 */
export function calculateIdleProgress(idleSeconds: number, thresholdSeconds: number): number {
  return Math.min(100, (idleSeconds / thresholdSeconds) * 100)
}

/**
 * Format date string for display (e.g., "Monday, Jan 12")
 */
export function formatDate(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00')
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric'
  })
}
