/**
 * Calculate the number of workdays (Mon-Fri) in a given month
 */
export function getWorkdaysInMonth(year: number, month: number): number {
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  let workdays = 0

  for (let d = new Date(firstDay); d <= lastDay; d.setDate(d.getDate() + 1)) {
    const dayOfWeek = d.getDay()
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      workdays++
    }
  }
  return workdays
}

/**
 * Calculate progress percentage (capped at 100)
 */
export function calculateProgress(currentSeconds: number, targetHours: number): number {
  const targetSeconds = targetHours * 3600
  return Math.min(100, (currentSeconds / targetSeconds) * 100)
}

/**
 * Aggregate time entries into total seconds
 */
export function aggregateEntrySeconds(
  entries: { startedAt: string; endedAt: string | null }[],
  now: number = Date.now()
): number {
  return entries.reduce((total, entry) => {
    const start = new Date(entry.startedAt).getTime()
    const end = entry.endedAt ? new Date(entry.endedAt).getTime() : now
    return total + (end - start) / 1000
  }, 0)
}
