import type { MonthlyReport } from '../types'

export interface AggregatedReportItem {
  externalId: string
  name: string
  totalHours: number
}

/**
 * Format hours to HH:MM:SS string
 */
export function formatTimeHMS(hours: number): string {
  const totalSeconds = Math.round(hours * 3600)
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
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
  const headers = ['Issue ID', 'Name', 'Time']
  const rows = items.map(r => [r.externalId, `"${r.name}"`, formatTimeHMS(r.totalHours)])

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
