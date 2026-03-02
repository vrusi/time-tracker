import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
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
 * Format hours to HH:MM:SS string (rounded to half hours)
 */
export function formatTimeHM(hours: number): string {
  const rounded = roundToHalfHour(hours)
  const h = Math.floor(rounded)
  const m = Math.round((rounded - h) * 60)
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:00`
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
export function generateCSV(items: AggregatedReportItem[], totalHours?: number): string {
  const headers = ['Task', 'Time']
  const rows = items.map(r => [`"${r.name}"`, formatTimeHM(r.totalHours)])

  const lines = [
    headers.join(','),
    ...rows.map(r => r.join(','))
  ]

  if (totalHours !== undefined) {
    lines.push(`"Total",${formatTimeHM(totalHours)}`)
  }

  return lines.join('\n')
}

/**
 * Generate export filename
 */
export function generateExportFilename(year: number, month: number, format: 'csv' | 'pdf' = 'csv'): string {
  return `time-report-${year}-${month.toString().padStart(2, '0')}.${format}`
}

/**
 * Generate PDF report from aggregated report
 */
export function generatePDF(items: AggregatedReportItem[], totalHours: number, title: string): jsPDF {
  const doc = new jsPDF()

  doc.setFontSize(16)
  doc.text(title, 14, 20)

  const body = items.map(r => [r.name, formatTimeHM(r.totalHours)])

  autoTable(doc, {
    startY: 30,
    head: [['Task', 'Time']],
    body,
    foot: [['Total', formatTimeHM(totalHours)]],
    headStyles: {
      lineWidth: { bottom: 0.5 },
      fillColor: [240, 240, 240],
      textColor: [30, 30, 30],
      fontStyle: 'bold'
    },
    footStyles: {
      lineWidth: { top: 0.5 },
      fillColor: [240, 240, 240],
      textColor: [30, 30, 30],
      fontStyle: 'bold'
    },
    styles: {
      fontSize: 10,
      cellPadding: 5
    },
    columnStyles: {
      1: { halign: 'right' }
    }
  })

  return doc
}
