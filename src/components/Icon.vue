<script setup lang="ts">
import { computed } from 'vue'

import PlayIcon from '../assets/icons/play.svg?raw'
import PauseIcon from '../assets/icons/pause.svg?raw'
import PencilIcon from '../assets/icons/pencil.svg?raw'
import DeleteIcon from '../assets/icons/delete.svg?raw'
import ClockIcon from '../assets/icons/clock.svg?raw'
import NoteIcon from '../assets/icons/note.svg?raw'
import BoxIcon from '../assets/icons/box.svg?raw'
import PresenceIcon from '../assets/icons/presence.svg?raw'

const icons: Record<string, string> = {
  play: PlayIcon,
  pause: PauseIcon,
  pencil: PencilIcon,
  delete: DeleteIcon,
  clock: ClockIcon,
  note: NoteIcon,
  box: BoxIcon,
  presence: PresenceIcon,
}

const props = defineProps<{
  name: keyof typeof icons
  size?: number
}>()

const svgContent = computed(() => icons[props.name] || '')
const iconSize = computed(() => props.size ?? 16)
</script>

<template>
  <span
    class="icon"
    :style="{ '--icon-size': iconSize + 'px' }"
    v-html="svgContent"
  />
</template>

<style scoped>
.icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: var(--icon-size);
  height: var(--icon-size);
  overflow: visible;
}

.icon :deep(svg) {
  width: var(--icon-size) !important;
  height: var(--icon-size) !important;
  overflow: visible !important;
}
</style>
