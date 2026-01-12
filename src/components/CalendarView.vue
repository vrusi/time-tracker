<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import type { TimeEntry, Issue } from '../types'

const entries = ref<(TimeEntry & { issue: Issue })[]>([])
const isLoading = ref(false)

// Current month/year selection
const currentDate = ref(new Date())
const year = computed(() => currentDate.value.getFullYear())
const month = computed(() => currentDate.value.getMonth())

const monthName = computed(() => {
  return currentDate.value.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
})

// Days of week header (Mon-Sun)
const weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

// Calculate daily totals from entries
const dailyTotals = computed(() => {
  const totals = new Map<string, number>()

  entries.value.forEach(entry => {
    const date = entry.startedAt.split('T')[0]
    const start = new Date(entry.startedAt).getTime()
    const end = entry.endedAt ? new Date(entry.endedAt).getTime() : Date.now()
    const seconds = (end - start) / 1000

    totals.set(date, (totals.get(date) || 0) + seconds)
  })

  return totals
})

// Build calendar grid
const calendarWeeks = computed(() => {
  const weeks: { date: Date; day: number; isCurrentMonth: boolean; dateStr: string }[][] = []
  const firstDay = new Date(year.value, month.value, 1)
  const lastDay = new Date(year.value, month.value + 1, 0)

  // Get the Monday of the week containing the first day
  let startDate = new Date(firstDay)
  const dayOfWeek = startDate.getDay()
  const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek // Adjust to Monday
  startDate.setDate(startDate.getDate() + diff)

  // Build weeks until we pass the last day of the month
  let currentWeek: { date: Date; day: number; isCurrentMonth: boolean; dateStr: string }[] = []

  while (startDate <= lastDay || currentWeek.length > 0) {
    const dateStr = startDate.toISOString().split('T')[0]
    currentWeek.push({
      date: new Date(startDate),
      day: startDate.getDate(),
      isCurrentMonth: startDate.getMonth() === month.value,
      dateStr
    })

    if (currentWeek.length === 7) {
      weeks.push(currentWeek)
      currentWeek = []

      // Stop if we've completed a week that ends after the month
      if (startDate > lastDay) break
    }

    startDate.setDate(startDate.getDate() + 1)
  }

  return weeks
})

function formatHours(seconds: number): string {
  if (seconds === 0) return ''
  const hours = seconds / 3600
  if (hours >= 1) {
    return `${hours.toFixed(1)}h`
  }
  const minutes = Math.floor(seconds / 60)
  return `${minutes}m`
}

function getHoursColor(seconds: number): string {
  if (seconds === 0) return ''
  const hours = seconds / 3600
  if (hours >= 8) return 'bg-green-100 text-green-800'
  if (hours >= 6) return 'bg-blue-100 text-blue-800'
  if (hours >= 4) return 'bg-yellow-100 text-yellow-800'
  return 'bg-gray-100 text-gray-600'
}

function isToday(dateStr: string): boolean {
  return dateStr === new Date().toISOString().split('T')[0]
}

function isWeekend(date: Date): boolean {
  const day = date.getDay()
  return day === 0 || day === 6
}

async function loadEntries() {
  isLoading.value = true
  try {
    const start = new Date(year.value, month.value, 1)
    const end = new Date(year.value, month.value + 1, 0, 23, 59, 59, 999)

    entries.value = await window.electronAPI.getTimeEntries(
      start.toISOString(),
      end.toISOString()
    )
  } finally {
    isLoading.value = false
  }
}

function prevMonth() {
  currentDate.value = new Date(year.value, month.value - 1, 1)
}

function nextMonth() {
  currentDate.value = new Date(year.value, month.value + 1, 1)
}

function goToToday() {
  currentDate.value = new Date()
}

// Monthly totals
const monthTotal = computed(() => {
  return entries.value.reduce((total, entry) => {
    const start = new Date(entry.startedAt).getTime()
    const end = entry.endedAt ? new Date(entry.endedAt).getTime() : Date.now()
    return total + (end - start) / 1000
  }, 0)
})

watch([year, month], loadEntries)
onMounted(loadEntries)
</script>

<template>
  <div class="bg-white rounded-lg shadow overflow-hidden">
    <!-- Header with navigation -->
    <div class="px-4 py-3 border-b flex items-center justify-between bg-gray-50">
      <button
        @click="prevMonth"
        class="p-2 hover:bg-gray-200 rounded-full transition-colors"
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
        </svg>
      </button>

      <div class="text-center">
        <h3 class="font-semibold text-gray-900">{{ monthName }}</h3>
        <p class="text-sm text-gray-500">Total: {{ formatHours(monthTotal) || '0h' }}</p>
      </div>

      <div class="flex items-center gap-2">
        <button
          @click="goToToday"
          class="px-3 py-1 text-sm text-gray-600 hover:bg-gray-200 rounded transition-colors"
        >
          Today
        </button>
        <button
          @click="nextMonth"
          class="p-2 hover:bg-gray-200 rounded-full transition-colors"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="isLoading" class="p-8 text-center text-gray-500">
      Loading...
    </div>

    <!-- Calendar grid -->
    <div v-else class="p-4">
      <!-- Week day headers -->
      <div class="grid grid-cols-7 gap-1 mb-2">
        <div
          v-for="day in weekDays"
          :key="day"
          class="text-center text-sm font-medium text-gray-500 py-2"
        >
          {{ day }}
        </div>
      </div>

      <!-- Calendar weeks -->
      <div class="grid gap-1">
        <div
          v-for="(week, weekIndex) in calendarWeeks"
          :key="weekIndex"
          class="grid grid-cols-7 gap-1"
        >
          <div
            v-for="dayInfo in week"
            :key="dayInfo.dateStr"
            :class="[
              'min-h-[60px] p-2 rounded border text-sm',
              dayInfo.isCurrentMonth ? 'bg-white' : 'bg-gray-50',
              isToday(dayInfo.dateStr) && 'ring-2 ring-blue-500',
              isWeekend(dayInfo.date) && dayInfo.isCurrentMonth && 'bg-gray-50'
            ]"
          >
            <div class="flex justify-between items-start">
              <span
                :class="[
                  'font-medium',
                  dayInfo.isCurrentMonth ? 'text-gray-900' : 'text-gray-400',
                  isToday(dayInfo.dateStr) && 'text-blue-600'
                ]"
              >
                {{ dayInfo.day }}
              </span>
              <span
                v-if="dailyTotals.get(dayInfo.dateStr)"
                :class="[
                  'text-xs px-1.5 py-0.5 rounded-full font-medium',
                  getHoursColor(dailyTotals.get(dayInfo.dateStr) || 0)
                ]"
              >
                {{ formatHours(dailyTotals.get(dayInfo.dateStr) || 0) }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
