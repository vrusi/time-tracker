<script setup lang="ts">
import { ref } from 'vue'
import type { MonthlyReport } from '../types'

const emit = defineEmits<{
  close: []
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
</script>

<template>
  <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50" @click.self="emit('close')">
    <div class="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
      <!-- Header -->
      <div class="px-6 py-4 border-b flex items-center justify-between">
        <h2 class="text-lg font-semibold text-gray-900">Export Monthly Report</h2>
        <button @click="emit('close')" class="text-gray-400 hover:text-gray-600">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <!-- Content -->
      <div class="px-6 py-4 flex-1 overflow-auto">
        <!-- Month/Year selection -->
        <div class="flex items-center gap-4 mb-6">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Month</label>
            <select
              v-model="month"
              class="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option v-for="(m, i) in months" :key="i" :value="i + 1">{{ m }}</option>
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Year</label>
            <select
              v-model="year"
              class="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option v-for="y in years" :key="y" :value="y">{{ y }}</option>
            </select>
          </div>
          <div class="self-end">
            <button
              @click="generateReport"
              :disabled="isExporting"
              class="px-4 py-2 text-sm font-medium text-white bg-blue-500 hover:bg-blue-600 rounded-md transition-colors disabled:opacity-50"
            >
              {{ isExporting ? 'Generating...' : 'Generate' }}
            </button>
          </div>
        </div>

        <!-- Report table -->
        <div v-if="report" class="border rounded-lg overflow-hidden">
          <table class="w-full">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-4 py-2 text-left text-sm font-medium text-gray-700">Issue ID</th>
                <th class="px-4 py-2 text-left text-sm font-medium text-gray-700">Name</th>
                <th class="px-4 py-2 text-right text-sm font-medium text-gray-700">Hours</th>
              </tr>
            </thead>
            <tbody class="divide-y">
              <tr v-for="item in report" :key="item.issueId">
                <td class="px-4 py-2 text-sm text-gray-900">{{ item.externalId }}</td>
                <td class="px-4 py-2 text-sm text-gray-600">{{ item.name }}</td>
                <td class="px-4 py-2 text-sm text-gray-900 text-right">{{ item.totalHours.toFixed(2) }}</td>
              </tr>
              <tr v-if="report.length === 0">
                <td colspan="3" class="px-4 py-8 text-center text-gray-500">
                  No time tracked for this month.
                </td>
              </tr>
            </tbody>
            <tfoot v-if="report.length > 0" class="bg-gray-50">
              <tr>
                <td colspan="2" class="px-4 py-2 text-sm font-medium text-gray-900">Total</td>
                <td class="px-4 py-2 text-sm font-semibold text-gray-900 text-right">{{ totalHours.toFixed(2) }}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <!-- Footer -->
      <div class="px-6 py-4 border-t flex justify-end gap-3">
        <button
          @click="emit('close')"
          class="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
        >
          Close
        </button>
        <button
          v-if="report && report.length > 0"
          @click="downloadCSV"
          class="px-4 py-2 text-sm font-medium text-white bg-green-500 hover:bg-green-600 rounded-md transition-colors"
        >
          Download CSV
        </button>
      </div>
    </div>
  </div>
</template>
