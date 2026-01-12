<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import type { TimeEntry, Issue } from '../types'
import { RCard, RButton, RText, RSpace } from 'roughness'

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

function getHoursClass(seconds: number): string {
  if (seconds === 0) return ''
  const hours = seconds / 3600
  if (hours >= 8) return 'hours-great'
  if (hours >= 6) return 'hours-good'
  if (hours >= 4) return 'hours-ok'
  return 'hours-low'
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
  <RCard>
    <template #title>
      <RSpace justify="between" align="center" class="w-full">
        <RButton @click="prevMonth">←</RButton>

        <div class="text-center">
          <RText class="font-semibold">{{ monthName }}</RText>
          <RText size="small" class="text-secondary block">
            Total: {{ formatHours(monthTotal) || '0h' }}
          </RText>
        </div>

        <RSpace>
          <RButton size="small" @click="goToToday">Today</RButton>
          <RButton @click="nextMonth">→</RButton>
        </RSpace>
      </RSpace>
    </template>

    <!-- Loading -->
    <div v-if="isLoading" class="p-8 text-center">
      <RText class="text-secondary">Loading...</RText>
    </div>

    <!-- Calendar grid -->
    <div v-else class="calendar-grid">
      <!-- Week day headers -->
      <div class="grid grid-cols-7 gap-1 mb-2">
        <div
          v-for="day in weekDays"
          :key="day"
          class="text-center text-sm font-medium text-secondary py-2"
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
              'calendar-day',
              !dayInfo.isCurrentMonth && 'other-month',
              isToday(dayInfo.dateStr) && 'today',
              isWeekend(dayInfo.date) && dayInfo.isCurrentMonth && 'weekend'
            ]"
          >
            <div class="flex justify-between items-start">
              <span
                :class="[
                  'font-medium',
                  !dayInfo.isCurrentMonth && 'text-secondary',
                  isToday(dayInfo.dateStr) && 'text-accent'
                ]"
              >
                {{ dayInfo.day }}
              </span>
              <span
                v-if="dailyTotals.get(dayInfo.dateStr)"
                :class="['hours-badge', getHoursClass(dailyTotals.get(dayInfo.dateStr) || 0)]"
              >
                {{ formatHours(dailyTotals.get(dayInfo.dateStr) || 0) }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </RCard>
</template>

<style scoped>
.text-secondary {
  color: var(--color-text-secondary);
}

.text-accent {
  color: var(--color-accent);
}

.calendar-day {
  min-height: 60px;
  padding: 0.5rem;
  border: 2px solid var(--color-border);
  border-radius: 4px;
  background: var(--color-bg);
}

.calendar-day.other-month {
  background: var(--color-bg-secondary);
  opacity: 0.6;
}

.calendar-day.weekend {
  background: var(--color-bg-secondary);
}

.calendar-day.today {
  border-color: var(--color-accent);
  border-width: 3px;
}

.hours-badge {
  font-size: 0.75rem;
  padding: 0.125rem 0.5rem;
  border-radius: 9999px;
  font-weight: 500;
}

.hours-great {
  background: var(--color-success);
  color: var(--color-bg);
}

.hours-good {
  background: var(--color-accent);
  color: var(--color-bg);
}

.hours-ok {
  background: var(--color-warning);
  color: var(--color-bg);
}

.hours-low {
  background: var(--color-border);
  color: var(--color-text-secondary);
}
</style>
