/**
 * Get the start of the week (Monday 00:00:00) for a given date
 */
export function getWeekStart(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  // getDay() returns 0 for Sunday, 1 for Monday, etc.
  // We want Monday as the start of the week
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d
}

/**
 * Get the end of the week (Sunday 23:59:59.999) for a given date
 */
export function getWeekEnd(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  // getDay() returns 0 for Sunday, 1 for Monday, etc.
  const diff = day === 0 ? 0 : 7 - day
  d.setDate(d.getDate() + diff)
  d.setHours(23, 59, 59, 999)
  return d
}

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
