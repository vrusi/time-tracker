<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import type { TimeEntry, Issue, DayGroup } from '../types'

const entries = ref<(TimeEntry & { issue: Issue })[]>([])
const isLoading = ref(false)

// Date range - default to current week
const today = new Date()
const weekStart = new Date(today)
weekStart.setDate(today.getDate() - today.getDay())

const startDate = ref(weekStart.toISOString().split('T')[0])
const endDate = ref(today.toISOString().split('T')[0])

const groupedEntries = computed<DayGroup[]>(() => {
  const groups = new Map<string, DayGroup>()

  entries.value.forEach(entry => {
    const date = entry.startedAt.split('T')[0]

    if (!groups.has(date)) {
      groups.set(date, { date, entries: [], totalSeconds: 0 })
    }

    const group = groups.get(date)!
    group.entries.push(entry)

    const start = new Date(entry.startedAt).getTime()
    const end = entry.endedAt ? new Date(entry.endedAt).getTime() : Date.now()
    group.totalSeconds += (end - start) / 1000
  })

  // Sort by date descending
  return Array.from(groups.values()).sort((a, b) => b.date.localeCompare(a.date))
})

async function loadEntries() {
  isLoading.value = true
  try {
    const start = new Date(startDate.value)
    start.setHours(0, 0, 0, 0)

    const end = new Date(endDate.value)
    end.setHours(23, 59, 59, 999)

    entries.value = await window.electronAPI.getTimeEntries(
      start.toISOString(),
      end.toISOString()
    )
  } finally {
    isLoading.value = false
  }
}

function formatTime(isoString: string): string {
  return new Date(isoString).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit'
  })
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (hours > 0) {
    return `${hours}h ${minutes}m`
  }
  return `${minutes}m`
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00')
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric'
  })
}

function entryDuration(entry: TimeEntry): number {
  const start = new Date(entry.startedAt).getTime()
  const end = entry.endedAt ? new Date(entry.endedAt).getTime() : Date.now()
  return (end - start) / 1000
}

watch([startDate, endDate], loadEntries)
onMounted(loadEntries)
</script>

<template>
  <div>
    <!-- Date filter -->
    <div class="bg-white rounded-lg shadow p-4 mb-6">
      <div class="flex items-center gap-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">From</label>
          <input
            v-model="startDate"
            type="date"
            class="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">To</label>
          <input
            v-model="endDate"
            type="date"
            class="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="isLoading" class="bg-white rounded-lg shadow p-8 text-center text-gray-500">
      Loading...
    </div>

    <!-- Empty state -->
    <div v-else-if="groupedEntries.length === 0" class="bg-white rounded-lg shadow p-8 text-center text-gray-500">
      No time entries for this period.
    </div>

    <!-- Entries grouped by day -->
    <div v-else class="space-y-4">
      <div
        v-for="group in groupedEntries"
        :key="group.date"
        class="bg-white rounded-lg shadow overflow-hidden"
      >
        <!-- Day header -->
        <div class="px-4 py-3 bg-gray-50 border-b flex items-center justify-between">
          <span class="font-medium text-gray-900">{{ formatDate(group.date) }}</span>
          <span class="text-sm text-gray-500">Total: {{ formatDuration(group.totalSeconds) }}</span>
        </div>

        <!-- Entries -->
        <ul class="divide-y">
          <li
            v-for="entry in group.entries"
            :key="entry.id"
            class="px-4 py-3 flex items-center gap-4"
          >
            <div class="flex-1">
              <div class="flex items-center gap-2">
                <span class="font-medium text-gray-900">{{ entry.issue.externalId }}</span>
                <span class="text-gray-600">{{ entry.issue.name }}</span>
              </div>
              <div class="text-sm text-gray-400">
                {{ formatTime(entry.startedAt) }} - {{ entry.endedAt ? formatTime(entry.endedAt) : 'ongoing' }}
                <span v-if="entry.pausedReason" class="ml-2 text-xs">
                  ({{ entry.pausedReason }})
                </span>
              </div>
            </div>
            <span class="text-sm font-medium text-gray-900">
              {{ formatDuration(entryDuration(entry)) }}
            </span>
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>
