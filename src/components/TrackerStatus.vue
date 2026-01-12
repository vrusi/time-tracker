<script setup lang="ts">
import { ref, watch } from 'vue'
import { useTrackerStore } from '../stores/tracker.store'

const trackerStore = useTrackerStore()

const showNotes = ref(false)
const currentNotes = ref('')

// Save notes to current entry when pausing
async function pauseWithNotes() {
  if (trackerStore.currentEntry && currentNotes.value.trim()) {
    await window.electronAPI.updateTimeEntry(trackerStore.currentEntry.id, {
      notes: currentNotes.value.trim()
    })
  }
  currentNotes.value = ''
  showNotes.value = false
  await trackerStore.pauseTracking()
}

// Reset notes when tracking changes
watch(() => trackerStore.currentEntry?.id, () => {
  currentNotes.value = ''
  showNotes.value = false
})
</script>

<template>
  <div class="space-y-2">
    <div class="flex items-center gap-3">
    <!-- Idle indicator (when tracking and idle) -->
    <div
      v-if="trackerStore.isTracking && trackerStore.isIdle && !trackerStore.handsoffMode"
      class="flex items-center gap-2 px-2 py-1 bg-orange-100 text-orange-700 rounded-md text-xs"
      :title="`Auto-pause in ${Math.ceil((trackerStore.idleThresholdSeconds - trackerStore.idleSeconds) / 60)} min`"
    >
      <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <span>Idle {{ trackerStore.formattedIdleTime }}</span>
      <div class="w-12 h-1.5 bg-orange-200 rounded-full overflow-hidden">
        <div
          class="h-full bg-orange-500 transition-all duration-300"
          :style="{ width: `${trackerStore.idleProgress}%` }"
        />
      </div>
      <button
        @click="trackerStore.resetIdle()"
        class="ml-1 p-0.5 hover:bg-orange-200 rounded"
        title="I'm back - reset idle timer"
      >
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>

    <!-- Handsoff mode toggle -->
    <button
      @click="trackerStore.toggleHandsoffMode()"
      :class="[
        'px-2 py-1 text-xs font-medium rounded-md transition-colors border',
        trackerStore.handsoffMode
          ? 'bg-amber-100 text-amber-700 border-amber-300 hover:bg-amber-200 dark:bg-amber-900/50 dark:text-amber-300 dark:border-amber-700 dark:hover:bg-amber-800/50'
          : 'bg-gray-100 text-gray-500 border-gray-200 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-400 dark:border-gray-600 dark:hover:bg-gray-600'
      ]"
      :title="trackerStore.handsoffMode ? 'Handsoff mode ON - click to re-enable idle detection' : 'Enable handsoff mode: keeps tracking even when idle (useful for meetings, reading, or away-from-keyboard work)'"
    >
      <span class="flex items-center gap-1">
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 11.5V14m0-2.5v-6a1.5 1.5 0 113 0m-3 6a1.5 1.5 0 00-3 0v2a7.5 7.5 0 0015 0v-5a1.5 1.5 0 00-3 0m-6-3V11m0-5.5v-1a1.5 1.5 0 013 0v1m0 0V11m0-5.5a1.5 1.5 0 013 0v3m0 0V11" />
        </svg>
        Handsoff
      </span>
    </button>

    <template v-if="trackerStore.isTracking && trackerStore.currentIssue">
      <div class="flex items-center gap-2" :title="trackerStore.isIdle && !trackerStore.handsoffMode ? 'Idle - activity not detected' : 'Actively tracking time'">
        <span class="relative flex h-3 w-3">
          <span
            class="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
            :class="trackerStore.isIdle && !trackerStore.handsoffMode ? 'bg-orange-400' : 'bg-green-400'"
          ></span>
          <span
            class="relative inline-flex rounded-full h-3 w-3"
            :class="trackerStore.isIdle && !trackerStore.handsoffMode ? 'bg-orange-500' : 'bg-green-500'"
          ></span>
        </span>
        <span class="text-sm text-gray-600 dark:text-gray-400">
          {{ trackerStore.currentIssue.externalId }}
        </span>
        <span class="font-mono text-lg font-semibold text-gray-900 dark:text-white">
          {{ trackerStore.formattedTime }}
        </span>
      </div>

      <!-- Notes toggle -->
      <button
        @click="showNotes = !showNotes"
        :class="[
          'p-1.5 rounded-md transition-colors',
          showNotes || currentNotes ? 'text-blue-500 bg-blue-50 dark:bg-blue-900/30' : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
        ]"
        :title="showNotes ? 'Hide notes' : 'Add notes before pausing'"
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      </button>

      <button
        @click="pauseWithNotes"
        class="px-3 py-1.5 text-sm font-medium text-white bg-red-500 hover:bg-red-600 rounded-md transition-colors"
        title="Stop the timer and save tracked time"
      >
        Pause
      </button>
    </template>
    <template v-else>
      <span class="text-sm text-gray-400 dark:text-gray-500">Not tracking</span>
    </template>
    </div>

    <!-- Notes textarea (expandable) -->
    <div v-if="showNotes && trackerStore.isTracking" class="mt-2">
      <textarea
        v-model="currentNotes"
        rows="3"
        class="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
        placeholder="Add notes about what you're working on... (saved when you pause)"
      ></textarea>
    </div>
  </div>
</template>
