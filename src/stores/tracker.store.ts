import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Issue, TimeEntry, IdleRecoveryInfo } from '@/types'
import { useSettingsStore } from './settings.store'
import { formatTimer, formatIdleTime, calculateIdleProgress } from '@/utils/format'

export const useTrackerStore = defineStore('tracker', () => {
  const settingsStore = useSettingsStore()

  const currentEntry = ref<TimeEntry | null>(null)
  const currentIssue = ref<Issue | null>(null)
  const lastTrackedIssue = ref<Issue | null>(null)
  const elapsedSeconds = ref(0)
  const pausedElapsedSeconds = ref(0)
  const pauseReason = ref<'manual' | 'idle' | null>(null)
  const presenceMode = ref(false)
  const idleSeconds = ref(0)
  const idleRecoveryInfo = ref<IdleRecoveryInfo | null>(null)
  let timer: number | null = null

  const idleThresholdSeconds = computed(() => settingsStore.settings.idleThresholdMinutes * 60)
  let isSwitchingTrackers = false

  const isTracking = computed(() => currentEntry.value !== null && currentEntry.value.endedAt === null)

  const formattedTime = computed(() => formatTimer(elapsedSeconds.value))

  const formattedPausedTime = computed(() => formatTimer(pausedElapsedSeconds.value))

  const idleIndicatorSeconds = computed(() => settingsStore.settings.idleIndicatorMinutes * 60)

  const isIdle = computed(() => idleSeconds.value >= idleIndicatorSeconds.value)

  const formattedIdleTime = computed(() =>
    formatIdleTime(idleSeconds.value, idleIndicatorSeconds.value)
  )

  const idleProgress = computed(() =>
    calculateIdleProgress(idleSeconds.value, idleThresholdSeconds.value)
  )

  const canRecoverIdleTime = computed(() =>
    pauseReason.value === 'idle' && idleRecoveryInfo.value !== null
  )

  const formattedRecoverableIdleTime = computed(() => {
    if (!idleRecoveryInfo.value) return ''
    const minutes = Math.floor(idleRecoveryInfo.value.idleDurationSeconds / 60)
    return `${minutes} min`
  })

  function updateElapsed() {
    if (currentEntry.value && !currentEntry.value.endedAt) {
      const start = new Date(currentEntry.value.startedAt).getTime()
      const currentSessionSeconds = Math.max(0, Math.floor((Date.now() - start) / 1000))
      elapsedSeconds.value = pausedElapsedSeconds.value + currentSessionSeconds
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
    // Set flag to prevent onTrackingUpdate from saving pausedElapsedSeconds
    // when the backend pauses the old tracker
    isSwitchingTrackers = true

    // Check if we're resuming the same issue
    const isResuming = lastTrackedIssue.value?.id === issueId

    // Clear idle recovery info since we're starting fresh
    idleRecoveryInfo.value = null

    const entry = await window.electronAPI.startTracking(issueId)
    const issues = await window.electronAPI.getIssues()
    const issue = issues.find(i => i.id === issueId)

    currentEntry.value = entry
    currentIssue.value = issue || null
    lastTrackedIssue.value = null  // Clear last tracked since we're now tracking

    // Reset paused time only if starting a new issue, not resuming
    // When resuming, keep pausedElapsedSeconds so timer continues from where it left off
    setTimeout(() => {
      if (!isResuming) {
        pausedElapsedSeconds.value = 0
      }
      isSwitchingTrackers = false
    }, 0)

    startTimer()
  }

  async function pauseTracking() {
    // Save last tracked issue and elapsed time before clearing
    if (currentIssue.value) {
      lastTrackedIssue.value = currentIssue.value
      pausedElapsedSeconds.value = elapsedSeconds.value
      pauseReason.value = 'manual'
    }
    await window.electronAPI.pauseTracking('manual')
    currentEntry.value = null
    currentIssue.value = null
    stopTimer()
  }

  function clearLastTracked() {
    lastTrackedIssue.value = null
    pausedElapsedSeconds.value = 0
    pauseReason.value = null
    idleRecoveryInfo.value = null
    // Also dismiss on backend
    window.electronAPI.dismissIdleRecovery()
  }

  async function recoverIdleTime() {
    const result = await window.electronAPI.recoverIdleTime()
    if (result) {
      // Update the paused elapsed seconds to include recovered time
      pausedElapsedSeconds.value += result.recoveredSeconds
      idleRecoveryInfo.value = null
    }
    return result
  }

  async function dismissIdleRecovery() {
    await window.electronAPI.dismissIdleRecovery()
    idleRecoveryInfo.value = null
  }

  function clearState() {
    // Clear all tracking state (used when switching projects)
    currentEntry.value = null
    currentIssue.value = null
    lastTrackedIssue.value = null
    elapsedSeconds.value = 0
    pausedElapsedSeconds.value = 0
    pauseReason.value = null
    stopTimer()
  }

  async function loadCurrentTracking() {
    const current = await window.electronAPI.getCurrentTracking()
    if (current) {
      currentEntry.value = current.entry
      currentIssue.value = current.issue
      startTimer()
    }
    // Load presence mode state
    presenceMode.value = await window.electronAPI.getPresenceMode()
  }

  async function togglePresenceMode() {
    const newValue = !presenceMode.value
    await window.electronAPI.setPresenceMode(newValue)
    presenceMode.value = newValue
  }

  async function resetIdle() {
    await window.electronAPI.resetIdleTime()
    idleSeconds.value = 0
  }

  async function refreshCurrentIssue() {
    if (currentIssue.value) {
      const issues = await window.electronAPI.getIssues()
      const updated = issues.find(i => i.id === currentIssue.value!.id)
      if (updated) {
        currentIssue.value = updated
      }
    }
  }

  function setupListeners() {
    window.electronAPI.onIdlePause(async () => {
      // Save last tracked issue and elapsed time before clearing
      if (currentIssue.value) {
        lastTrackedIssue.value = currentIssue.value
        pausedElapsedSeconds.value = elapsedSeconds.value
      }
      // Always set pause reason to idle (even if currentIssue was already cleared by tracking-update)
      pauseReason.value = 'idle'
      currentEntry.value = null
      currentIssue.value = null
      stopTimer()

      // Fetch idle recovery info for potential recovery
      idleRecoveryInfo.value = await window.electronAPI.getIdleRecoveryInfo()
    })

    // Re-fetch idle recovery info when user returns (so the displayed time is accurate)
    document.addEventListener('visibilitychange', async () => {
      if (document.visibilityState === 'visible' && pauseReason.value === 'idle' && idleRecoveryInfo.value) {
        idleRecoveryInfo.value = await window.electronAPI.getIdleRecoveryInfo()
      }
    })

    window.electronAPI.onTrackingUpdate((data) => {
      if (data) {
        currentEntry.value = data.entry
        currentIssue.value = data.issue
        startTimer()
      } else if (!isSwitchingTrackers) {
        // Save last tracked issue and elapsed time before clearing
        // Skip entirely if we're switching trackers (handled by startTracking)
        if (currentIssue.value) {
          lastTrackedIssue.value = currentIssue.value
          pausedElapsedSeconds.value = elapsedSeconds.value
        }
        currentEntry.value = null
        currentIssue.value = null
        stopTimer()
      }
    })

    window.electronAPI.onPresenceModeChange((enabled) => {
      presenceMode.value = enabled
    })

    window.electronAPI.onIdleUpdate((seconds) => {
      idleSeconds.value = seconds
    })
  }

  return {
    currentEntry,
    currentIssue,
    lastTrackedIssue,
    isTracking,
    elapsedSeconds,
    formattedTime,
    formattedPausedTime,
    pauseReason,
    presenceMode,
    idleSeconds,
    isIdle,
    formattedIdleTime,
    idleProgress,
    idleThresholdSeconds,
    idleRecoveryInfo,
    canRecoverIdleTime,
    formattedRecoverableIdleTime,
    startTracking,
    pauseTracking,
    clearLastTracked,
    clearState,
    loadCurrentTracking,
    togglePresenceMode,
    resetIdle,
    recoverIdleTime,
    dismissIdleRecovery,
    refreshCurrentIssue,
    setupListeners
  }
})
