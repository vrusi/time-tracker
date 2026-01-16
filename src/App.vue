<script setup lang="ts">
import { ref, onMounted, provide, watch } from 'vue'
import { useTrackerStore } from './stores/tracker.store'
import { useIssuesStore } from './stores/issues.store'
import { useSettingsStore } from './stores/settings.store'
import { useProjectsStore } from './stores/projects.store'
import type { TrackingRecoveryInfo } from './types'
import TrackerStatus from './components/TrackerStatus.vue'
import IssueList from './components/IssueList.vue'
import HistoryView from './components/HistoryView.vue'
import ExportDialog from './components/ExportDialog.vue'
import RecoveryDialog from './components/RecoveryDialog.vue'
import ProgressBars from './components/ProgressBars.vue'
import CalendarView from './components/CalendarView.vue'
import SettingsView from './components/SettingsView.vue'
import ProjectSwitcher from './components/ProjectSwitcher.vue'
import { RButton, RTabs, RTabItem } from 'roughness'

const trackerStore = useTrackerStore()
const issuesStore = useIssuesStore()
const settingsStore = useSettingsStore()
const projectsStore = useProjectsStore()

const activeTab = ref<'track' | 'history' | 'settings'>('track')
const historyView = ref<'list' | 'calendar'>('list')
const showExportDialog = ref(false)
const showRecoveryDialog = ref(false)
const recoveryInfo = ref<TrackingRecoveryInfo | null>(null)
const historyViewRef = ref<InstanceType<typeof HistoryView> | null>(null)
const progressBarsRef = ref<InstanceType<typeof ProgressBars> | null>(null)

function refreshProgress() {
  progressBarsRef.value?.loadProgress()
}

// Provide refresh function to child components
provide('refreshProgress', refreshProgress)

// Refresh history view when tracking state changes (e.g., pause/stop sets endedAt)
watch(() => trackerStore.currentEntry, () => {
  historyViewRef.value?.loadEntries()
  refreshProgress()
})

async function handleRecoveryResolve(action: 'keep-all' | 'end-at-close' | 'discard') {
  await window.electronAPI.resolveTrackingRecovery(action)
  await trackerStore.loadCurrentTracking()
  refreshProgress()
}

onMounted(async () => {
  await projectsStore.loadProjects()
  await settingsStore.loadSettings()
  await issuesStore.loadIssues()

  // Check for recovery before loading current tracking
  const recovery = await window.electronAPI.checkTrackingRecovery()
  if (recovery) {
    recoveryInfo.value = recovery
    showRecoveryDialog.value = true
  } else {
    await trackerStore.loadCurrentTracking()
  }

  trackerStore.setupListeners()
})
</script>

<template>
  <div class="min-h-screen paper-bg">
    <div class="max-w-4xl mx-auto px-4 py-6">
      <!-- Header with title, project switcher, and export -->
      <header class="flex items-center justify-between mb-6">
        <h1 class="text-2xl font-bold">Time Tracker</h1>
        <div class="flex items-center gap-3">
          <ProjectSwitcher />
          <RButton @click="showExportDialog = true">Export</RButton>
        </div>
      </header>

      <!-- Hero: Current Tracking Status -->
      <TrackerStatus class="mb-6" />

      <!-- Progress bars -->
      <ProgressBars ref="progressBarsRef" class="mb-6" />

      <!-- Main navigation tabs -->
      <RTabs v-model="activeTab" class="w-full">
        <RTabItem label="Track" value="track">
          <div class="track-section">
            <IssueList />
          </div>
        </RTabItem>

        <RTabItem label="History" value="history">
          <div class="history-section">
            <HistoryView
              v-show="historyView === 'list'"
              ref="historyViewRef"
              :view-mode="historyView"
              @entries-changed="refreshProgress"
              @view-change="historyView = $event"
            />
            <CalendarView v-show="historyView === 'calendar'" @view-change="historyView = $event" />
          </div>
        </RTabItem>

        <RTabItem label="Settings" value="settings">
          <div class="mt-4">
            <SettingsView />
          </div>
        </RTabItem>
      </RTabs>
    </div>

    <!-- Export dialog -->
    <ExportDialog v-model:open="showExportDialog" />

    <!-- Recovery dialog -->
    <RecoveryDialog
      v-model:open="showRecoveryDialog"
      :recovery="recoveryInfo"
      @resolve="handleRecoveryResolve"
    />
  </div>
</template>

<style scoped>
.track-section {
  margin-top: 1rem;
}

.history-section {
  margin-top: 0.5rem;
}
</style>
