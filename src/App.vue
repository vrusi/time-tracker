<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useTrackerStore } from './stores/tracker.store'
import { useIssuesStore } from './stores/issues.store'
import { useSettingsStore } from './stores/settings.store'
import TrackerStatus from './components/TrackerStatus.vue'
import IssueList from './components/IssueList.vue'
import IssueForm from './components/IssueForm.vue'
import HistoryView from './components/HistoryView.vue'
import ExportDialog from './components/ExportDialog.vue'
import ProgressBars from './components/ProgressBars.vue'
import CalendarView from './components/CalendarView.vue'
import SettingsView from './components/SettingsView.vue'
import { RButton, RCard, RSpace, RTabs, RTabItem } from 'roughness'

const trackerStore = useTrackerStore()
const issuesStore = useIssuesStore()
const settingsStore = useSettingsStore()

const activeTab = ref<'track' | 'history' | 'settings'>('track')
const historyView = ref<'list' | 'calendar'>('list')
const showExportDialog = ref(false)

onMounted(async () => {
  await settingsStore.loadSettings()
  await issuesStore.loadIssues()
  await trackerStore.loadCurrentTracking()
  trackerStore.setupListeners()
})
</script>

<template>
  <div class="min-h-screen paper-bg">
    <div class="max-w-4xl mx-auto px-4 py-6">
      <!-- Header with title and export -->
      <header class="flex items-center justify-between mb-6">
        <h1 class="text-2xl font-bold">Time Tracker</h1>
        <RButton @click="showExportDialog = true">Export</RButton>
      </header>

      <!-- Hero: Current Tracking Status -->
      <TrackerStatus class="mb-6" />

      <!-- Progress bars -->
      <ProgressBars class="mb-6" />

      <!-- Main navigation tabs -->
      <RTabs v-model="activeTab" class="w-full">
        <RTabItem label="Track" value="track">
          <RSpace vertical class="mt-4">
            <IssueForm />
            <IssueList />
          </RSpace>
        </RTabItem>

        <RTabItem label="History" value="history">
          <RSpace vertical class="mt-4">
            <!-- View toggle -->
            <div class="flex justify-end gap-2">
              <RButton
                :filled="historyView === 'list'"
                @click="historyView = 'list'"
              >
                List
              </RButton>
              <RButton
                :filled="historyView === 'calendar'"
                @click="historyView = 'calendar'"
              >
                Calendar
              </RButton>
            </div>

            <HistoryView v-if="historyView === 'list'" />
            <CalendarView v-else />
          </RSpace>
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
  </div>
</template>
