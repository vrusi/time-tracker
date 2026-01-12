<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useTrackerStore } from '../stores/tracker.store'

const trackerStore = useTrackerStore()

const todaySeconds = ref(0)
const monthSeconds = ref(0)
let refreshInterval: number | null = null

const DAILY_TARGET_HOURS = 8
const MONTHLY_TARGET_HOURS = 160
const HOURLY_RATE = 18.67 // GBP per hour

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
const workdaysHours = workdaysInMonth * 8

const dailyProgress = computed(() => {
  return Math.min(100, (todaySeconds.value / (DAILY_TARGET_HOURS * 3600)) * 100)
})

const monthlyProgress = computed(() => {
  return Math.min(100, (monthSeconds.value / (MONTHLY_TARGET_HOURS * 3600)) * 100)
})

const monthlyHours = computed(() => {
  return monthSeconds.value / 3600
})

const monthlyEarnings = computed(() => {
  return monthlyHours.value * HOURLY_RATE
})

const targetEarnings = computed(() => {
  return MONTHLY_TARGET_HOURS * HOURLY_RATE
})

function formatHours(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  return `${hours}h ${minutes}m`
}

function formatMoney(amount: number): string {
  return `£${amount.toFixed(2)}`
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
const unwatch = trackerStore.$subscribe(() => {
  loadProgress()
})
</script>

<template>
  <div class="bg-white rounded-lg shadow p-4 space-y-4">
    <!-- Earnings highlight -->
    <div class="text-center py-2 border-b border-gray-100">
      <div class="text-3xl font-bold text-green-600">{{ formatMoney(monthlyEarnings) }}</div>
      <div class="text-sm text-gray-500">earned this month (of {{ formatMoney(targetEarnings) }})</div>
    </div>

    <!-- Daily Progress -->
    <div>
      <div class="flex justify-between text-sm mb-1">
        <span class="font-medium text-gray-700">Today</span>
        <span class="text-gray-500">
          {{ formatHours(todaySeconds) }} / {{ DAILY_TARGET_HOURS }}h
          <span class="text-gray-400 ml-1">({{ dailyProgress.toFixed(0) }}%)</span>
        </span>
      </div>
      <div class="h-3 bg-gray-200 rounded-full overflow-hidden">
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
        <span class="font-medium text-gray-700">This Month</span>
        <span class="text-gray-500">
          {{ formatHours(monthSeconds) }} / {{ MONTHLY_TARGET_HOURS }}h
          <span class="text-gray-400 ml-1">({{ monthlyProgress.toFixed(0) }}%)</span>
        </span>
      </div>
      <div class="h-3 bg-gray-200 rounded-full overflow-hidden">
        <div
          class="h-full transition-all duration-300 rounded-full"
          :class="monthlyProgress >= 100 ? 'bg-green-500' : 'bg-blue-500'"
          :style="{ width: `${monthlyProgress}%` }"
        />
      </div>
      <div class="text-xs text-gray-400 mt-1">
        {{ workdaysInMonth }} workdays this month ({{ workdaysHours }}h if 8h/day)
      </div>
    </div>
  </div>
</template>
