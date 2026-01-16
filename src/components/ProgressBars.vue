<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useTrackerStore } from '../stores/tracker.store'
import { useSettingsStore } from '../stores/settings.store'
import { RCard, RProgress, RText } from 'roughness'
import { formatMoney } from '../utils/format'
import { getWorkdaysInMonth, calculateProgress } from '../utils/workdays'

const trackerStore = useTrackerStore()
const settingsStore = useSettingsStore()

const todaySeconds = ref(0)
const monthSeconds = ref(0)
let refreshInterval: number | null = null

getWorkdaysInMonth(new Date().getFullYear(), new Date().getMonth())

const dailyProgress = computed(() => {
  return calculateProgress(todaySeconds.value, settingsStore.settings.dailyTargetHours)
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

.text-secondary {
  color: var(--color-text-secondary);
}

.text-success {
  color: var(--color-success);
}
</style>
