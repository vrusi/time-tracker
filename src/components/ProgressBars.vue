<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useTrackerStore } from '../stores/tracker.store'
import { useSettingsStore } from '../stores/settings.store'
import { useIssuesStore } from '../stores/issues.store'
import { RCard, RProgress, RText } from 'roughness'
import { formatMoney } from '../utils/format'
import { getWorkdaysInMonth, calculateProgress, getWeekStart, getWeekEnd, getTargetWorkdays, getWorkedDays, getFreeDays } from '../utils/workdays'

const trackerStore = useTrackerStore()
const settingsStore = useSettingsStore()
const issuesStore = useIssuesStore()

const todaySeconds = ref(0)
const weekSeconds = ref(0)
const monthSeconds = ref(0)
let refreshInterval: number | null = null

const dailyProgress = computed(() => {
  return calculateProgress(todaySeconds.value, settingsStore.settings.dailyTargetHours)
})

const weeklyProgress = computed(() => {
  return calculateProgress(weekSeconds.value, settingsStore.settings.weeklyTargetHours)
})

const monthlyProgress = computed(() => {
  return calculateProgress(monthSeconds.value, settingsStore.settings.monthlyTargetHours)
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

// Workday counter computeds
const totalWorkdaysInMonth = computed(() => {
  const now = new Date()
  return getWorkdaysInMonth(now.getFullYear(), now.getMonth())
})

const targetWorkdays = computed(() => {
  return getTargetWorkdays(settingsStore.settings.monthlyTargetHours, settingsStore.settings.dailyTargetHours)
})

const workedDays = computed(() => {
  return getWorkedDays(monthSeconds.value, settingsStore.settings.dailyTargetHours)
})

const remainingWorkdays = computed(() => {
  return Math.max(0, targetWorkdays.value - workedDays.value)
})

const freeDays = computed(() => {
  return getFreeDays(totalWorkdaysInMonth.value, targetWorkdays.value)
})

const workdayProgress = computed(() => {
  if (targetWorkdays.value <= 0) return 0
  return Math.min(100, (workedDays.value / targetWorkdays.value) * 100)
})

function formatHoursDisplay(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  return `${hours}h ${minutes}m`
}

function formatMoneyDisplay(amount: number): string {
  return formatMoney(amount, settingsStore.settings.currencySymbol)
}

async function loadProgress() {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayEnd = new Date()
  todayEnd.setHours(23, 59, 59, 999)

  const weekStart = getWeekStart(today)
  const weekEnd = getWeekEnd(today)

  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)
  const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59, 999)

  const todayEntries = await window.electronAPI.getTimeEntries(
    today.toISOString(),
    todayEnd.toISOString()
  )

  const weekEntries = await window.electronAPI.getTimeEntries(
    weekStart.toISOString(),
    weekEnd.toISOString()
  )

  const monthEntries = await window.electronAPI.getTimeEntries(
    monthStart.toISOString(),
    monthEnd.toISOString()
  )

  const activeTodayEntries = todayEntries.filter(e => !e.issue.archived)
  const activeWeekEntries = weekEntries.filter(e => !e.issue.archived)
  const activeMonthEntries = monthEntries.filter(e => !e.issue.archived)

  todaySeconds.value = activeTodayEntries.reduce((total, entry) => {
    const start = new Date(entry.startedAt).getTime()
    const end = entry.endedAt ? new Date(entry.endedAt).getTime() : Date.now()
    return total + (end - start) / 1000
  }, 0)

  weekSeconds.value = activeWeekEntries.reduce((total, entry) => {
    const start = new Date(entry.startedAt).getTime()
    const end = entry.endedAt ? new Date(entry.endedAt).getTime() : Date.now()
    return total + (end - start) / 1000
  }, 0)

  monthSeconds.value = activeMonthEntries.reduce((total, entry) => {
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

// Refresh when issues are archived/unarchived
issuesStore.$subscribe(() => {
  loadProgress()
})

// Expose for parent to call after deletions
defineExpose({ loadProgress })
</script>

<template>
  <RCard class="progress-card">
    <!-- Earnings inline (enabled via settings) -->
    <div
      v-if="settingsStore.settings.showEarnings"
      class="earnings-row"
      :title="`${monthlyHours.toFixed(1)} hours × ${formatMoneyDisplay(settingsStore.settings.hourlyRate)}/hour`"
    >
      <RText class="earnings-amount">{{ formatMoneyDisplay(monthlyEarnings) }}</RText>
      <RText class="text-secondary text-sm">
        of {{ formatMoneyDisplay(targetEarnings) }} target
      </RText>
    </div>

    <!-- Daily Progress -->
    <div class="progress-row">
      <div class="progress-label">
        <RText size="small">Today</RText>
        <RText size="small" class="text-secondary">
          {{ formatHoursDisplay(todaySeconds) }} / {{ settingsStore.settings.dailyTargetHours }}h
        </RText>
      </div>
      <div class="progress-bar-wrapper">
        <RProgress
          :value="dailyProgress / 100"
          :color="dailyProgress >= 100 ? 'success' : 'primary'"
        />
      </div>
    </div>

    <!-- Weekly Progress -->
    <div class="progress-row">
      <div class="progress-label">
        <RText size="small">Week</RText>
        <RText size="small" class="text-secondary">
          {{ formatHoursDisplay(weekSeconds) }} / {{ settingsStore.settings.weeklyTargetHours }}h
        </RText>
      </div>
      <div class="progress-bar-wrapper">
        <RProgress
          :value="weeklyProgress / 100"
          :color="weeklyProgress >= 100 ? 'success' : 'primary'"
        />
      </div>
    </div>

    <!-- Monthly Progress -->
    <div class="progress-row">
      <div class="progress-label">
        <RText size="small">Month</RText>
        <RText size="small" class="text-secondary">
          {{ formatHoursDisplay(monthSeconds) }} / {{ settingsStore.settings.monthlyTargetHours }}h
        </RText>
      </div>
      <div class="progress-bar-wrapper">
        <RProgress
          :value="monthlyProgress / 100"
          :color="monthlyProgress >= 100 ? 'success' : 'primary'"
        />
      </div>
    </div>

    <!-- Workday Counter -->
    <div class="workday-section">
      <div class="progress-row">
        <div class="progress-label">
          <RText size="small">Workdays</RText>
          <RText size="small" class="text-secondary">
            {{ workedDays }} / {{ targetWorkdays }} &mdash; {{ remainingWorkdays }} left
          </RText>
        </div>
        <div class="progress-bar-wrapper">
          <RProgress
            :value="workdayProgress / 100"
            :color="workdayProgress >= 100 ? 'success' : 'primary'"
          />
        </div>
      </div>
      <div v-if="freeDays > 0" class="free-days-info">
        <RText size="small" class="text-secondary">
          This month has {{ freeDays }} free {{ freeDays === 1 ? 'day' : 'days' }}
        </RText>
      </div>
    </div>
  </RCard>
</template>

<style scoped>
.progress-card {
  --r-card-padding: 0.75rem;
}

.earnings-row {
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
  padding-bottom: 0.75rem;
  border-bottom: 1px solid var(--color-border);
}

.earnings-amount {
  color: var(--color-success);
  font-size: 1.1rem;
  font-weight: 500;
  opacity: 0.85;
}

.progress-row {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 0.5rem;
}

.progress-row:last-child {
  margin-bottom: 0;
}

.progress-label {
  display: flex;
  justify-content: space-between;
  min-width: 180px;
  gap: 0.5rem;
}

.progress-bar-wrapper {
  flex: 1;
}

/* Force RProgress to take full width */
.progress-bar-wrapper :deep(.r-progress) {
  width: 100%;
}

.workday-section {
  margin-top: 0.5rem;
  padding-top: 0.5rem;
  border-top: 1px solid var(--color-border);
}

.free-days-info {
  text-align: center;
  margin-top: 0.25rem;
}

.text-secondary {
  color: var(--color-text-secondary);
}

.text-success {
  color: var(--color-success);
}
</style>
