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
