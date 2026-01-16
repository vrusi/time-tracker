<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { RCard, RButton, RText, RSpace } from 'roughness'
import { formatHours } from '../utils/format'
import {
  calculateDailyTotals,
  calculateDailyIssueBreakdown,
  generateCalendarWeeks,
  getHoursClass,
  isToday,
  isWeekend,
  type TimeEntryWithIssue
} from '../utils/calendar'

const entries = ref<TimeEntryWithIssue[]>([])
const isLoading = ref(false)
const expandedDate = ref<string | null>(null)

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
const dailyTotals = computed(() => calculateDailyTotals(entries.value))

// Calculate per-issue breakdown for each day
const dailyIssueBreakdown = computed(() => calculateDailyIssueBreakdown(entries.value))

function toggleDay(dateStr: string) {
  if (expandedDate.value === dateStr) {
    expandedDate.value = null
  } else {
    expandedDate.value = dateStr
  }
}

// Build calendar grid
const calendarWeeks = computed(() => generateCalendarWeeks(year.value, month.value))

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

const emit = defineEmits<{
  (e: 'view-change', view: 'list' | 'calendar'): void
}>()
</script>

<template>
  <RCard>
    <template #title>
      <div class="card-header">
        <div class="header-left">
          <span class="card-title">History</span>
          <div class="view-toggle">
            <RButton size="small" @click="emit('view-change', 'list')">
              List
            </RButton>
            <RButton size="small" class="view-active" @click="emit('view-change', 'calendar')">
              Calendar
            </RButton>
          </div>
        </div>
        <div class="header-right">
          <RButton @click="prevMonth">←</RButton>
          <div class="text-center month-display">
            <RText class="font-semibold">{{ monthName }}</RText>
            <RText size="small" class="text-secondary block">
              Total: {{ formatHours(monthTotal) || '0h' }}
            </RText>
          </div>
          <RSpace>
            <RButton size="small" @click="goToToday">Today</RButton>
            <RButton @click="nextMonth">→</RButton>
          </RSpace>
        </div>
      </div>
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
              isWeekend(dayInfo.date) && dayInfo.isCurrentMonth && 'weekend',
              dailyTotals.get(dayInfo.dateStr) && 'has-entries',
              expandedDate === dayInfo.dateStr && 'expanded'
            ]"
            @click="dailyTotals.get(dayInfo.dateStr) && toggleDay(dayInfo.dateStr)"
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

            <!-- Expanded issue breakdown -->
            <div
              v-if="expandedDate === dayInfo.dateStr && dailyIssueBreakdown.get(dayInfo.dateStr)"
              class="issue-breakdown"
              @click.stop
            >
              <div
                v-for="item in dailyIssueBreakdown.get(dayInfo.dateStr)"
                :key="item.issue.id"
                class="issue-row"
              >
                <span class="issue-id">{{ item.issue.externalId }}</span>
                <span class="issue-name">{{ item.issue.name }}</span>
                <span class="issue-hours">{{ formatHours(item.totalSeconds) }}</span>
              </div>
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

/* Card header styling (matches IssueList/HistoryView) */
.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  gap: 1rem;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.card-title {
  font-weight: 600;
  font-size: 1.1rem;
}

.view-toggle {
  display: flex;
  gap: 0.5rem;
}

/* Both buttons look similar, inactive one is faded */
.view-toggle > :not(.view-active) {
  opacity: 0.5;
}

.card-header :deep(.r-button) {
  font-size: 0.8rem;
}

.month-display {
  min-width: 140px;
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

.calendar-day.has-entries {
  cursor: pointer;
  transition: transform 0.15s ease;
}

.calendar-day.has-entries:hover {
  transform: scale(1.05);
  z-index: 1;
}

.calendar-day.expanded {
  transform: scale(1.05);
  z-index: 1;
}

.calendar-day {
  position: relative;
}

.issue-breakdown {
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  min-width: 280px;
  max-width: 350px;
  margin-top: 0.25rem;
  padding: 0.75rem;
  background: var(--color-bg);
  border: 2px solid var(--color-border);
  border-radius: 4px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  z-index: 10;
}

.issue-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.8rem;
  padding: 0.25rem 0;
}

.issue-row:not(:last-child) {
  border-bottom: 1px solid var(--color-border);
  padding-bottom: 0.375rem;
  margin-bottom: 0.125rem;
}

.issue-id {
  color: var(--color-accent);
  font-weight: 500;
  flex-shrink: 0;
}

.issue-name {
  color: var(--color-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

.issue-hours {
  color: var(--color-text-secondary);
  font-weight: 500;
  flex-shrink: 0;
}
</style>
