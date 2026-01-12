<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useTrackerStore } from '../stores/tracker.store'
import { useSettingsStore } from '../stores/settings.store'
import { RCard, RProgress, RText, RSpace, RDivider } from 'roughness'

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
  <RCard class="progress-card">
    <!-- Earnings inline (enabled via settings) -->
    <div
      v-if="settingsStore.settings.showEarnings"
      class="earnings-row"
      :title="`${monthlyHours.toFixed(1)} hours × ${formatMoney(settingsStore.settings.hourlyRate)}/hour`"
    >
      <RText class="text-success font-bold text-xl">{{ formatMoney(monthlyEarnings) }}</RText>
      <RText class="text-secondary text-sm">
        of {{ formatMoney(targetEarnings) }} target
      </RText>
    </div>

    <!-- Daily Progress -->
    <div class="progress-row">
      <div class="progress-label">
        <RText size="small">Today</RText>
        <RText size="small" class="text-secondary">
          {{ formatHours(todaySeconds) }} / {{ settingsStore.settings.dailyTargetHours }}h
        </RText>
      </div>
      <div class="progress-bar-wrapper">
        <RProgress
          :value="dailyProgress / 100"
          :color="dailyProgress >= 100 ? 'success' : 'primary'"
        />
      </div>
    </div>

    <!-- Monthly Progress -->
    <div class="progress-row">
      <div class="progress-label">
        <RText size="small">Month</RText>
        <RText size="small" class="text-secondary">
          {{ formatHours(monthSeconds) }} / {{ settingsStore.settings.monthlyTargetHours }}h
        </RText>
      </div>
      <div class="progress-bar-wrapper">
        <RProgress
          :value="monthlyProgress / 100"
          :color="monthlyProgress >= 100 ? 'success' : 'primary'"
        />
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

.text-secondary {
  color: var(--color-text-secondary);
}

.text-success {
  color: var(--color-success);
}
</style>
