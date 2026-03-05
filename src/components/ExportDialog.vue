<script setup lang="ts">
import { ref, computed } from 'vue'
import type { MonthlyReport } from '../types'
import { RDialog, RButton, RText } from 'roughness'
import {
  formatTimeHMS,
  aggregateReport,
  generateCSV,
  generatePDF,
  generateExportFilename
} from '../utils/export'

defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

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
  try {
    report.value = await window.electronAPI.exportMonth(year.value, month.value)
    totalHours.value = report.value.reduce((sum, r) => sum + r.totalHours, 0)
  } finally {
    isExporting.value = false
  }
}

function downloadCSV() {
  if (!aggregatedReport.value) return

  const csv = generateCSV(aggregatedReport.value, totalHours.value)
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = generateExportFilename(year.value, month.value, 'csv')
  a.click()
  URL.revokeObjectURL(url)
}

function downloadPDF() {
  if (!aggregatedReport.value) return

  const title = `Time Report — ${months[month.value - 1]} ${year.value}`
  const doc = generatePDF(aggregatedReport.value, totalHours.value, title)
  doc.save(generateExportFilename(year.value, month.value, 'pdf'))
}

function closeDialog() {
  emit('update:open', false)
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

      <!-- Report table -->
      <div v-if="aggregatedReport" class="report-table-wrapper">
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

      <!-- Placeholder when no report -->
      <div v-if="!aggregatedReport" class="empty-state">
        <RText class="text-secondary">Select a month and year, then click Generate to view the report.</RText>
      </div>
    </div>

    <!-- Footer actions -->
    <template #footer>
      <div class="footer-actions">
        <button class="btn-close" @click="closeDialog">Close</button>
        <RButton
          v-if="aggregatedReport && aggregatedReport.length > 0"
          @click="downloadPDF"
        >
          Download PDF
        </RButton>
        <RButton
          v-if="aggregatedReport && aggregatedReport.length > 0"
          filled
          @click="downloadCSV"
        >
          Download CSV
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
</style>
