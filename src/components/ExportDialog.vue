<script setup lang="ts">
import { ref, computed } from 'vue'
import type { MonthlyReport, DailyBreakdownEntry } from '../types'
import { useSettingsStore } from '../stores/settings.store'
import { RDialog, RButton, RText } from 'roughness'
import {
  formatTimeHMS,
  aggregateReport,
  generateCSV,
  generatePDF,
  generateExportFilename,
  type AggregatedReportItem
} from '../utils/export'

defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

const settingsStore = useSettingsStore()

const now = new Date()
const year = ref(now.getFullYear())
const month = ref(now.getMonth() + 1)

const isExporting = ref(false)
const report = ref<MonthlyReport[] | null>(null)
const totalHours = ref(0)

const months = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]

const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i)

// Aggregate by externalId to combine duplicates
const aggregatedReport = computed(() => {
  if (!report.value) return null
  return aggregateReport(report.value)
})

async function generateReport() {
  isExporting.value = true
  resetPaddingState()
  try {
    report.value = await window.electronAPI.exportMonth(year.value, month.value)
    totalHours.value = report.value.reduce((sum, r) => sum + r.totalHours, 0)
  } finally {
    isExporting.value = false
  }
}

function downloadCSV(items: AggregatedReportItem[], total: number, suffix = '') {
  const csv = generateCSV(items, total)
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = generateExportFilename(year.value, month.value, 'csv').replace('.csv', `${suffix}.csv`)
  a.click()
  URL.revokeObjectURL(url)
}

function downloadPDF(items: AggregatedReportItem[], total: number, suffix = '', titleSuffix = '') {
  const title = `Time Report — ${months[month.value - 1]} ${year.value}${titleSuffix}`
  const doc = generatePDF(items, total, title)
  doc.save(generateExportFilename(year.value, month.value, 'pdf').replace('.pdf', `${suffix}.pdf`))
}

function downloadOriginalCSV() {
  if (aggregatedReport.value) downloadCSV(aggregatedReport.value, totalHours.value)
}

function downloadOriginalPDF() {
  if (aggregatedReport.value) downloadPDF(aggregatedReport.value, totalHours.value)
}

function downloadPaddedCSV() {
  if (paddedReport.value) downloadCSV(paddedReport.value, paddedTotal.value, '-padded')
}

function downloadPaddedPDF() {
  if (paddedReport.value) downloadPDF(paddedReport.value, paddedTotal.value, '-padded', ' (padded)')
}

function closeDialog() {
  emit('update:open', false)
}

// ───────────────────────────────────────────────────────────────────
// Padding flow
// ───────────────────────────────────────────────────────────────────
type SuspiciousDay = { date: string; totalHours: number; redistribute: boolean }

const dailyBreakdown = ref<DailyBreakdownEntry[]>([])
const suspiciousDays = ref<SuspiciousDay[]>([])
const showSuspiciousDialog = ref(false)
const isPadding = ref(false)
const padError = ref('')
const padNotes = ref('')
const paddedReport = ref<AggregatedReportItem[] | null>(null)
const paddedTotal = ref(0)
const SUSPICIOUS_THRESHOLD_HOURS = 9

const monthlyTarget = computed(() => settingsStore.settings.monthlyTargetHours)
const padGap = computed(() => Math.max(0, monthlyTarget.value - totalHours.value))
const canPad = computed(() =>
  !!aggregatedReport.value && aggregatedReport.value.length > 0 && padGap.value > 0.25
)

function resetPaddingState() {
  paddedReport.value = null
  paddedTotal.value = 0
  padNotes.value = ''
  padError.value = ''
  dailyBreakdown.value = []
  suspiciousDays.value = []
}

async function startPaddingFlow() {
  if (!settingsStore.settings.claudeApiKey) {
    padError.value = 'Add a Claude API key in Settings → AI first.'
    return
  }
  padError.value = ''

  try {
    dailyBreakdown.value = await window.electronAPI.getDailyBreakdown(year.value, month.value)
  } catch (err) {
    padError.value = err instanceof Error ? err.message : 'Failed to load daily breakdown'
    return
  }

  // Compute per-day totals
  const dayTotals = new Map<string, number>()
  for (const entry of dailyBreakdown.value) {
    dayTotals.set(entry.date, (dayTotals.get(entry.date) ?? 0) + entry.hours)
  }

  const suspicious: SuspiciousDay[] = Array.from(dayTotals.entries())
    .filter(([, hours]) => hours > SUSPICIOUS_THRESHOLD_HOURS)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, hours]) => ({ date, totalHours: hours, redistribute: false }))

  if (suspicious.length === 0) {
    await runPadding([], [])
  } else {
    suspiciousDays.value = suspicious
    showSuspiciousDialog.value = true
  }
}

async function confirmSuspiciousDays() {
  const trusted = suspiciousDays.value.filter(d => !d.redistribute).map(d => d.date)
  const redistribute = suspiciousDays.value.filter(d => d.redistribute).map(d => d.date)
  showSuspiciousDialog.value = false
  await runPadding(trusted, redistribute)
}

async function runPadding(trustedDays: string[], redistributeDays: string[]) {
  isPadding.value = true
  padError.value = ''
  try {
    // JSON-clone strips Vue reactive proxies so structuredClone in IPC doesn't choke
    const payload = JSON.parse(JSON.stringify({
      year: year.value,
      month: month.value,
      monthlyTargetHours: monthlyTarget.value,
      totalHoursBefore: totalHours.value,
      dailyBreakdown: dailyBreakdown.value,
      trustedDays,
      redistributeDays
    }))
    const response = await window.electronAPI.aiPadTimesheet(payload)
    paddedReport.value = response.paddedReport.map(r => ({
      externalId: r.externalId,
      name: r.name,
      totalHours: r.totalHours
    }))
    paddedTotal.value = response.totalHoursAfter
    padNotes.value = response.notes
  } catch (err) {
    padError.value = err instanceof Error ? err.message : 'Failed to pad timesheet'
  } finally {
    isPadding.value = false
  }
}

function discardPadded() {
  paddedReport.value = null
  paddedTotal.value = 0
  padNotes.value = ''
}

// Side-by-side rows: each row has the issue's original and padded hours
type SideBySideRow = { externalId: string; name: string; original: number; padded: number; delta: number }

const sideBySideRows = computed<SideBySideRow[]>(() => {
  if (!aggregatedReport.value || !paddedReport.value) return []
  const paddedMap = new Map(paddedReport.value.map(r => [r.externalId, r]))
  const rows: SideBySideRow[] = aggregatedReport.value.map(orig => {
    const padded = paddedMap.get(orig.externalId)
    const paddedHours = padded ? padded.totalHours : orig.totalHours
    return {
      externalId: orig.externalId,
      name: orig.name,
      original: orig.totalHours,
      padded: paddedHours,
      delta: paddedHours - orig.totalHours
    }
  })
  // Append any padded-only rows (shouldn't happen, but defensive)
  for (const p of paddedReport.value) {
    if (!aggregatedReport.value.some(o => o.externalId === p.externalId)) {
      rows.push({
        externalId: p.externalId,
        name: p.name,
        original: 0,
        padded: p.totalHours,
        delta: p.totalHours
      })
    }
  }
  return rows
})

function formatDateForDisplay(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}
</script>

<template>
  <RDialog :open="open" @update:open="emit('update:open', $event)">
    <template #title>Export Monthly Report</template>

    <div class="export-content">
      <!-- Month/Year selection -->
      <div class="controls-row">
        <div class="period-group">
          <span class="period-label">Period</span>
          <div class="period-selects">
            <select v-model="month" class="export-select">
              <option v-for="(m, i) in months" :key="i" :value="i + 1">{{ m }}</option>
            </select>
            <select v-model="year" class="export-select export-select-year">
              <option v-for="y in years" :key="y" :value="y">{{ y }}</option>
            </select>
          </div>
        </div>

        <RButton
          filled
          @click="generateReport"
          :loading="isExporting"
        >
          {{ isExporting ? 'Generating...' : 'Generate' }}
        </RButton>
      </div>

      <!-- Pad-to-target bar (visible after report is generated and gap exists) -->
      <div v-if="aggregatedReport && aggregatedReport.length > 0" class="pad-bar">
        <div class="pad-bar-info">
          <RText size="small">
            <span class="font-mono">{{ formatTimeHMS(totalHours) }}</span>
            of <span class="font-mono">{{ monthlyTarget }}h</span> target
            <span v-if="padGap > 0.25" class="text-secondary">
              · gap {{ padGap.toFixed(2) }}h
            </span>
            <span v-else class="text-secondary">· target met</span>
          </RText>
        </div>
        <RButton
          v-if="canPad"
          size="small"
          @click="startPaddingFlow"
          :loading="isPadding"
          :disabled="isPadding"
        >
          {{ paddedReport ? 'Regenerate padded' : (isPadding ? 'Padding…' : 'Pad to target') }}
        </RButton>
        <RButton
          v-if="paddedReport"
          size="small"
          @click="discardPadded"
        >
          Discard padded
        </RButton>
      </div>

      <div v-if="padError" class="pad-error">
        <RText size="small">{{ padError }}</RText>
      </div>

      <div v-if="padNotes && paddedReport" class="pad-notes">
        <RText size="small">{{ padNotes }}</RText>
      </div>

      <!-- Report table - single column when no padded version -->
      <div v-if="aggregatedReport && !paddedReport" class="report-table-wrapper">
        <table class="report-table">
          <thead>
            <tr>
              <th>Task</th>
              <th class="text-right">Time</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in aggregatedReport" :key="item.externalId">
              <td>{{ item.name }}</td>
              <td class="text-right font-mono">{{ formatTimeHMS(item.totalHours) }}</td>
            </tr>
            <tr v-if="aggregatedReport.length === 0">
              <td colspan="2" class="text-center py-8">
                <RText class="text-secondary">No time tracked for this month.</RText>
              </td>
            </tr>
          </tbody>
          <tfoot v-if="aggregatedReport.length > 0" class="total-row">
            <tr>
              <td><span class="total-label">Total</span></td>
              <td class="text-right font-semibold font-mono">{{ formatTimeHMS(totalHours) }}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <!-- Side-by-side table when padded version exists -->
      <div v-if="aggregatedReport && paddedReport" class="report-table-wrapper">
        <table class="report-table side-by-side">
          <thead>
            <tr>
              <th>Task</th>
              <th class="text-right">Original</th>
              <th class="text-right">Padded</th>
              <th class="text-right">Δ</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in sideBySideRows" :key="row.externalId">
              <td>{{ row.name }}</td>
              <td class="text-right font-mono">{{ formatTimeHMS(row.original) }}</td>
              <td class="text-right font-mono font-semibold">{{ formatTimeHMS(row.padded) }}</td>
              <td class="text-right font-mono" :class="row.delta > 0 ? 'delta-pos' : row.delta < 0 ? 'delta-neg' : 'delta-zero'">
                {{ row.delta > 0 ? '+' : '' }}{{ row.delta.toFixed(2) }}h
              </td>
            </tr>
          </tbody>
          <tfoot class="total-row">
            <tr>
              <td><span class="total-label">Total</span></td>
              <td class="text-right font-semibold font-mono">{{ formatTimeHMS(totalHours) }}</td>
              <td class="text-right font-semibold font-mono">{{ formatTimeHMS(paddedTotal) }}</td>
              <td class="text-right font-semibold font-mono delta-pos">
                +{{ (paddedTotal - totalHours).toFixed(2) }}h
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <!-- Placeholder when no report -->
      <div v-if="!aggregatedReport" class="empty-state">
        <RText class="text-secondary">Select a month and year, then click Generate to view the report.</RText>
      </div>
    </div>

    <!-- Footer actions -->
    <template #footer>
      <div class="footer-actions">
        <button class="btn-close" @click="closeDialog">Close</button>

        <!-- Padded export buttons (left of original, more prominent when present) -->
        <template v-if="paddedReport">
          <RButton @click="downloadPaddedPDF">Padded PDF</RButton>
          <RButton filled @click="downloadPaddedCSV">Padded CSV</RButton>
          <span class="footer-separator">/</span>
        </template>

        <RButton
          v-if="aggregatedReport && aggregatedReport.length > 0"
          @click="downloadOriginalPDF"
        >
          {{ paddedReport ? 'Original PDF' : 'Download PDF' }}
        </RButton>
        <RButton
          v-if="aggregatedReport && aggregatedReport.length > 0"
          :filled="!paddedReport"
          @click="downloadOriginalCSV"
        >
          {{ paddedReport ? 'Original CSV' : 'Download CSV' }}
        </RButton>
      </div>
    </template>
  </RDialog>

  <!-- Suspicious days confirmation dialog -->
  <RDialog v-model:open="showSuspiciousDialog">
    <template #title>Confirm suspicious days</template>
    <div class="suspicious-content">
      <RText size="small" class="text-secondary">
        These days have more than {{ SUSPICIOUS_THRESHOLD_HOURS }}h tracked. For each, tell me whether you really worked that much — if not, I'll trim the excess and redistribute it across other tasks.
      </RText>
      <div class="suspicious-list">
        <label v-for="day in suspiciousDays" :key="day.date" class="suspicious-row">
          <input
            type="checkbox"
            v-model="day.redistribute"
            class="suspicious-checkbox"
          />
          <div class="suspicious-day">
            <span class="suspicious-date">{{ formatDateForDisplay(day.date) }}</span>
            <span class="suspicious-hours font-mono">{{ day.totalHours.toFixed(2) }}h</span>
          </div>
          <span class="suspicious-label">
            I didn't actually work this much — redistribute the excess
          </span>
        </label>
      </div>
      <RText size="small" class="text-secondary suspicious-hint">
        Tick the days where the tracked hours look inflated. Unticked days are kept as-is.
      </RText>
    </div>
    <template #footer>
      <div class="footer-actions">
        <button type="button" class="btn-close" @click="showSuspiciousDialog = false">Cancel</button>
        <RButton filled @click="confirmSuspiciousDays">
          Pad timesheet
        </RButton>
      </div>
    </template>
  </RDialog>
</template>

<style scoped>
.text-secondary {
  color: var(--color-text-secondary);
}

.text-right {
  text-align: right;
}

.text-center {
  text-align: center;
}

.export-content {
  min-width: 500px;
}

/* Period grouping */
.controls-row {
  display: flex;
  align-items: flex-end;
  gap: 1.5rem;
  margin-bottom: 1.5rem;
}

.period-group {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.period-label {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.period-selects {
  display: flex;
  gap: 0.5rem;
}

.export-select {
  padding: 0.5rem 0.75rem;
  border: 2px solid var(--color-border);
  border-radius: 4px;
  background: var(--color-bg);
  color: var(--color-text);
  font-family: inherit;
  min-width: 120px;
}

.export-select-year {
  min-width: 90px;
}

.export-select:focus {
  outline: none;
  border-color: var(--color-accent);
}

.report-table-wrapper {
  border: 2px solid var(--color-border);
  border-radius: 4px;
  overflow: hidden;
}

.report-table {
  width: 100%;
  border-collapse: collapse;
}

.report-table th,
.report-table td {
  padding: 0.75rem 1rem;
  text-align: left;
}

.report-table thead {
  background: var(--color-bg-secondary);
}

.report-table th {
  font-weight: 600;
  color: var(--color-text);
  border-bottom: 2px solid var(--color-border);
}

.report-table tbody tr {
  border-bottom: 1px solid var(--color-border);
}

.report-table tbody tr:last-child {
  border-bottom: none;
}

.report-table .total-row {
  background: var(--color-bg-secondary);
}

.report-table .total-row td {
  border-top: 3px solid var(--color-border);
}

.total-label {
  font-weight: 700;
}

.empty-state {
  padding: 2rem;
  text-align: center;
  border: 2px dashed var(--color-border);
  border-radius: 4px;
}

.font-medium {
  font-weight: 500;
}

.font-semibold {
  font-weight: 600;
}

.font-mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.9em;
}

.py-8 {
  padding-top: 2rem;
  padding-bottom: 2rem;
}

.mb-6 {
  margin-bottom: 1.5rem;
}

/* Footer actions */
.footer-actions {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 1rem;
}

.btn-close {
  padding: 0.5rem 1rem;
  font-size: 0.9rem;
  font-family: inherit;
  background: transparent;
  border: 2px solid var(--color-border);
  border-radius: 4px;
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-close:hover {
  background: var(--color-bg-secondary);
  color: var(--color-text);
}

/* ───────────────────────────── Padding flow ───────────────────────────── */

.pad-bar {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
  padding: 0.5rem 0.75rem;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 4px;
}

.pad-bar-info {
  flex: 1;
}

.pad-error {
  margin-bottom: 0.75rem;
  padding: 0.5rem 0.75rem;
  background: rgba(229, 57, 53, 0.08);
  border: 1px solid var(--color-error);
  border-radius: 4px;
  color: var(--color-error);
}

.pad-notes {
  margin-bottom: 0.75rem;
  padding: 0.5rem 0.75rem;
  background: rgba(76, 175, 80, 0.08);
  border: 1px solid var(--color-success);
  border-radius: 4px;
  font-style: italic;
}

.font-mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.9em;
}

.report-table.side-by-side th,
.report-table.side-by-side td {
  padding: 0.5rem 0.75rem;
}

.delta-pos {
  color: var(--color-success);
}

.delta-neg {
  color: var(--color-error);
}

.delta-zero {
  color: var(--color-text-secondary);
  opacity: 0.6;
}

.footer-separator {
  align-self: center;
  color: var(--color-text-secondary);
  opacity: 0.5;
  margin: 0 0.25rem;
}

/* ───────────────────────────── Suspicious-days dialog ───────────────────────────── */

.suspicious-content {
  min-width: 480px;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.suspicious-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  max-height: 360px;
  overflow-y: auto;
}

.suspicious-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.6rem 0.75rem;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  background: var(--color-bg);
  cursor: pointer;
  transition: background 0.1s ease, border-color 0.1s ease;
}

.suspicious-row:hover {
  background: var(--color-bg-secondary);
  border-color: var(--color-text-secondary);
}

.suspicious-row:has(.suspicious-checkbox:checked) {
  background: rgba(255, 152, 0, 0.08);
  border-color: var(--color-warning);
}

.suspicious-checkbox {
  flex-shrink: 0;
  width: 1.1rem;
  height: 1.1rem;
  cursor: pointer;
  accent-color: var(--color-warning);
}

.suspicious-day {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
  min-width: 8rem;
}

.suspicious-date {
  font-weight: 500;
}

.suspicious-hours {
  font-size: 0.8rem;
  color: var(--color-text-secondary);
}

.suspicious-label {
  flex: 1;
  font-size: 0.85rem;
  color: var(--color-text-secondary);
  line-height: 1.3;
}

.suspicious-row:has(.suspicious-checkbox:checked) .suspicious-label {
  color: var(--color-text);
}

.suspicious-hint {
  margin-top: 0.25rem;
  line-height: 1.4;
}
</style>
