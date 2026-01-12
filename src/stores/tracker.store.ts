import { defineStore } from 'pinia'
import { ref, computed, onMounted } from 'vue'
import type { Issue, TimeEntry } from '@/types'

export const useTrackerStore = defineStore('tracker', () => {
  const currentEntry = ref<TimeEntry | null>(null)
  const currentIssue = ref<Issue | null>(null)
  const elapsedSeconds = ref(0)
  const handsoffMode = ref(false)
  let timer: number | null = null

  const isTracking = computed(() => currentEntry.value !== null && currentEntry.value.endedAt === null)

  const formattedTime = computed(() => {
    const hours = Math.floor(elapsedSeconds.value / 3600)
    const minutes = Math.floor((elapsedSeconds.value % 3600) / 60)
    const seconds = elapsedSeconds.value % 60
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
  })

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
  }

  return {
    currentEntry,
    currentIssue,
    isTracking,
    elapsedSeconds,
    formattedTime,
    handsoffMode,
    startTracking,
    pauseTracking,
    loadCurrentTracking,
    toggleHandsoffMode,
    setupListeners
  }
})
