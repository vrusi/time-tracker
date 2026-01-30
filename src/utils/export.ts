import type { MonthlyReport } from '../types'

export interface AggregatedReportItem {
  externalId: string
  name: string
  totalHours: number
}

/**
 * Round hours to nearest half hour
 */
export function roundToHalfHour(hours: number): number {
  return Math.round(hours * 2) / 2
}

/**
 * Format hours to H:MM string (rounded to half hours)
 */
export function formatTimeHM(hours: number): string {
  const rounded = roundToHalfHour(hours)
  const h = Math.floor(rounded)
  const m = Math.round((rounded - h) * 60)
  return `${h}:${m.toString().padStart(2, '0')}`
}

/**
 * Aggregate report by externalId, combining duplicates
 */
export function aggregateReport(report: MonthlyReport[]): AggregatedReportItem[] {
  const byId = new Map<string, AggregatedReportItem>()

  for (const item of report) {
    const existing = byId.get(item.externalId)
    if (existing) {
      existing.totalHours += item.totalHours
    } else {
      byId.set(item.externalId, {
        externalId: item.externalId,
        name: item.name,
        totalHours: item.totalHours
      })
    }
  }

  return Array.from(byId.values())
}

/**
 * Generate CSV content from aggregated report
 */
export function generateCSV(items: AggregatedReportItem[]): string {
  const headers = ['Task', 'Time']
  const rows = items.map(r => [`"${r.name}"`, formatTimeHM(r.totalHours)])

  return [
    headers.join(','),
    ...rows.map(r => r.join(','))
  ].join('\n')
}

/**
 * Generate export filename
 */
export function generateExportFilename(year: number, month: number): string {
  return `time-report-${year}-${month.toString().padStart(2, '0')}.csv`
}
