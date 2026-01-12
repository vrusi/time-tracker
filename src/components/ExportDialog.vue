<script setup lang="ts">
import { ref } from 'vue'
import type { MonthlyReport } from '../types'
import { RDialog, RButton, RText, RSpace, RFormItem, RTable } from 'roughness'

const props = defineProps<{
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
  if (!report.value) return

  const headers = ['Issue ID', 'Name', 'Hours']
  const rows = report.value.map(r => [r.externalId, `"${r.name}"`, r.totalHours.toString()])

  const csv = [
    headers.join(','),
    ...rows.map(r => r.join(','))
  ].join('\n')

  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `time-report-${year.value}-${month.value.toString().padStart(2, '0')}.csv`
  a.click()
  URL.revokeObjectURL(url)
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
      <RSpace align="end" class="mb-6">
        <RFormItem label="Month">
          <select v-model="month" class="export-select">
            <option v-for="(m, i) in months" :key="i" :value="i + 1">{{ m }}</option>
          </select>
        </RFormItem>

        <RFormItem label="Year">
          <select v-model="year" class="export-select">
            <option v-for="y in years" :key="y" :value="y">{{ y }}</option>
          </select>
        </RFormItem>

        <RButton
          filled
          @click="generateReport"
          :loading="isExporting"
        >
          {{ isExporting ? 'Generating...' : 'Generate' }}
        </RButton>
      </RSpace>

      <!-- Report table -->
      <div v-if="report" class="report-table-wrapper">
        <table class="report-table">
          <thead>
            <tr>
              <th>Issue ID</th>
              <th>Name</th>
              <th class="text-right">Hours</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in report" :key="item.issueId">
              <td class="font-medium">{{ item.externalId }}</td>
              <td class="text-secondary">{{ item.name }}</td>
              <td class="text-right">{{ item.totalHours.toFixed(2) }}</td>
            </tr>
            <tr v-if="report.length === 0">
              <td colspan="3" class="text-center py-8">
                <RText class="text-secondary">No time tracked for this month.</RText>
              </td>
            </tr>
          </tbody>
          <tfoot v-if="report.length > 0">
            <tr>
              <td colspan="2" class="font-semibold">Total</td>
              <td class="text-right font-semibold">{{ totalHours.toFixed(2) }}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <!-- Placeholder when no report -->
      <div v-else class="empty-state">
        <RText class="text-secondary">Select a month and year, then click Generate to view the report.</RText>
      </div>
    </div>

    <!-- Footer actions -->
    <template #footer>
      <RSpace justify="end">
        <RButton @click="closeDialog">Close</RButton>
        <RButton
          v-if="report && report.length > 0"
          filled
          @click="downloadCSV"
        >
          Download CSV
        </RButton>
      </RSpace>
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

.export-select {
  padding: 0.5rem 0.75rem;
  border: 2px solid var(--color-border);
  border-radius: 4px;
  background: var(--color-bg);
  color: var(--color-text);
  font-family: inherit;
  min-width: 140px;
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

.report-table tfoot {
  background: var(--color-bg-secondary);
}

.report-table tfoot td {
  border-top: 2px solid var(--color-border);
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

.py-8 {
  padding-top: 2rem;
  padding-bottom: 2rem;
}

.mb-6 {
  margin-bottom: 1.5rem;
}
</style>
