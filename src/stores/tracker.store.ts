import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Issue, TimeEntry } from '@/types'
import { useSettingsStore } from './settings.store'
import { formatTimer, formatIdleTime, calculateIdleProgress } from '@/utils/format'

export const useTrackerStore = defineStore('tracker', () => {
  const settingsStore = useSettingsStore()

  const currentEntry = ref<TimeEntry | null>(null)
  const currentIssue = ref<Issue | null>(null)
  const elapsedSeconds = ref(0)
  const handsoffMode = ref(false)
  const idleSeconds = ref(0)
  let timer: number | null = null

  const idleThresholdSeconds = computed(() => settingsStore.settings.idleThresholdMinutes * 60)

  const isTracking = computed(() => currentEntry.value !== null && currentEntry.value.endedAt === null)

  const formattedTime = computed(() => formatTimer(elapsedSeconds.value))

  const isIdle = computed(() => idleSeconds.value >= settingsStore.settings.idleIndicatorSeconds)

  const formattedIdleTime = computed(() =>
    formatIdleTime(idleSeconds.value, settingsStore.settings.idleIndicatorSeconds)
  )

  const idleProgress = computed(() =>
    calculateIdleProgress(idleSeconds.value, idleThresholdSeconds.value)
  )

  function updateElapsed() {
    if (currentEntry.value && !currentEntry.value.endedAt) {
      const start = new Date(currentEntry.value.startedAt).getTime()
      elapsedSeconds.value = Math.floor((Date.now() - start) / 1000)
    }
  }

  function startTimer() {
    if (timer) clearInterval(timer)
    timer = window.setInterval(updateElapsed, 1000)
    updateElapsed()
  }

  function stopTimer() {
    if (timer) {
      clearInterval(timer)
      timer = null
    }
    elapsedSeconds.value = 0
  }

  async function startTracking(issueId: number) {
    const entry = await window.electronAPI.startTracking(issueId)
    const issues = await window.electronAPI.getIssues()
    const issue = issues.find(i => i.id === issueId)

    currentEntry.value = entry
    currentIssue.value = issue || null
    startTimer()
  }

  async function pauseTracking() {
    await window.electronAPI.pauseTracking('manual')
    currentEntry.value = null
    currentIssue.value = null
    stopTimer()
  }

  async function loadCurrentTracking() {
    const current = await window.electronAPI.getCurrentTracking()
    if (current) {
      currentEntry.value = current.entry
      currentIssue.value = current.issue
      startTimer()
    }
    // Load handsoff mode state
    handsoffMode.value = await window.electronAPI.getHandsoffMode()
  }

  async function toggleHandsoffMode() {
    const newValue = !handsoffMode.value
    await window.electronAPI.setHandsoffMode(newValue)
    handsoffMode.value = newValue
  }

  async function resetIdle() {
    await window.electronAPI.resetIdleTime()
    idleSeconds.value = 0
  }

  function setupListeners() {
    window.electronAPI.onIdlePause(() => {
      currentEntry.value = null
      currentIssue.value = null
      stopTimer()
    })

    window.electronAPI.onTrackingUpdate((data) => {
      if (data) {
        currentEntry.value = data.entry
        currentIssue.value = data.issue
        startTimer()
      } else {
        currentEntry.value = null
        currentIssue.value = null
        stopTimer()
      }
    })

    window.electronAPI.onHandsoffModeChange((enabled) => {
      handsoffMode.value = enabled
    })

    window.electronAPI.onIdleUpdate((seconds) => {
      idleSeconds.value = seconds
    })
  }

  return {
    currentEntry,
    currentIssue,
    isTracking,
    elapsedSeconds,
    formattedTime,
    handsoffMode,
    idleSeconds,
    isIdle,
    formattedIdleTime,
    idleProgress,
    idleThresholdSeconds,
    startTracking,
    pauseTracking,
    loadCurrentTracking,
    toggleHandsoffMode,
    resetIdle,
    setupListeners
  }
})
