<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useTrackerStore } from '../stores/tracker.store'
import { useSettingsStore } from '../stores/settings.store'

const trackerStore = useTrackerStore()
const settingsStore = useSettingsStore()

const todaySeconds = ref(0)
const monthSeconds = ref(0)
let refreshInterval: number | null = null

// Calculate workdays in current month
function getWorkdaysInMonth(year: number, month: number): number {
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

const now = new Date()
const workdaysInMonth = getWorkdaysInMonth(now.getFullYear(), now.getMonth())
const workdaysHours = computed(() => workdaysInMonth * settingsStore.settings.dailyTargetHours)

const dailyProgress = computed(() => {
  const target = settingsStore.settings.dailyTargetHours * 3600
  return Math.min(100, (todaySeconds.value / target) * 100)
})

const monthlyProgress = computed(() => {
  const target = settingsStore.settings.monthlyTargetHours * 3600
  return Math.min(100, (monthSeconds.value / target) * 100)
})

const monthlyHours = computed(() => {
  return monthSeconds.value / 3600
})

const monthlyEarnings = computed(() => {
  return monthlyHours.value * settingsStore.settings.hourlyRate
})

const targetEarnings = computed(() => {
  return settingsStore.settings.monthlyTargetHours * settingsStore.settings.hourlyRate
})

function formatHours(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  return `${hours}h ${minutes}m`
}

function formatMoney(amount: number): string {
  return `${settingsStore.settings.currencySymbol}${amount.toFixed(2)}`
}

async function loadProgress() {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayEnd = new Date()
  todayEnd.setHours(23, 59, 59, 999)

  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)
  const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59, 999)

  const todayEntries = await window.electronAPI.getTimeEntries(
    today.toISOString(),
    todayEnd.toISOString()
  )

  const monthEntries = await window.electronAPI.getTimeEntries(
    monthStart.toISOString(),
    monthEnd.toISOString()
  )

  todaySeconds.value = todayEntries.reduce((total, entry) => {
    const start = new Date(entry.startedAt).getTime()
    const end = entry.endedAt ? new Date(entry.endedAt).getTime() : Date.now()
    return total + (end - start) / 1000
  }, 0)

  monthSeconds.value = monthEntries.reduce((total, entry) => {
    const start = new Date(entry.startedAt).getTime()
    const end = entry.endedAt ? new Date(entry.endedAt).getTime() : Date.now()
    return total + (end - start) / 1000
  }, 0)
}

onMounted(() => {
  loadProgress()
  // Refresh every minute to update ongoing tracking
  refreshInterval = window.setInterval(loadProgress, 60000)
})

onUnmounted(() => {
  if (refreshInterval) {
    clearInterval(refreshInterval)
  }
})

// Also refresh when tracking changes
trackerStore.$subscribe(() => {
  loadProgress()
})
</script>

<template>
  <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-4 space-y-4">
    <!-- Earnings highlight -->
    <div class="text-center py-2 border-b border-gray-100 dark:border-gray-700" :title="`${monthlyHours.toFixed(1)} hours × ${formatMoney(settingsStore.settings.hourlyRate)}/hour`">
      <div class="text-3xl font-bold text-green-600 dark:text-green-400">{{ formatMoney(monthlyEarnings) }}</div>
      <div class="text-sm text-gray-500 dark:text-gray-400">earned this month (of {{ formatMoney(targetEarnings) }})</div>
    </div>

    <!-- Daily Progress -->
    <div>
      <div class="flex justify-between text-sm mb-1">
        <span class="font-medium text-gray-700 dark:text-gray-300">Today</span>
        <span class="text-gray-500 dark:text-gray-400">
          {{ formatHours(todaySeconds) }} / {{ settingsStore.settings.dailyTargetHours }}h
          <span class="text-gray-400 dark:text-gray-500 ml-1">({{ dailyProgress.toFixed(0) }}%)</span>
        </span>
      </div>
      <div class="h-3 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
        <div
          class="h-full transition-all duration-300 rounded-full"
          :class="dailyProgress >= 100 ? 'bg-green-500' : 'bg-blue-500'"
          :style="{ width: `${dailyProgress}%` }"
        />
      </div>
    </div>

    <!-- Monthly Progress -->
    <div>
      <div class="flex justify-between text-sm mb-1">
        <span class="font-medium text-gray-700 dark:text-gray-300">This Month</span>
        <span class="text-gray-500 dark:text-gray-400">
          {{ formatHours(monthSeconds) }} / {{ settingsStore.settings.monthlyTargetHours }}h
          <span class="text-gray-400 dark:text-gray-500 ml-1">({{ monthlyProgress.toFixed(0) }}%)</span>
        </span>
      </div>
      <div class="h-3 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
        <div
          class="h-full transition-all duration-300 rounded-full"
          :class="monthlyProgress >= 100 ? 'bg-green-500' : 'bg-blue-500'"
          :style="{ width: `${monthlyProgress}%` }"
        />
      </div>
      <div class="text-xs text-gray-400 dark:text-gray-500 mt-1">
        {{ workdaysInMonth }} workdays this month ({{ workdaysHours }}h if {{ settingsStore.settings.dailyTargetHours }}h/day)
      </div>
    </div>
  </div>
</template>
