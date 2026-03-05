import { useTrackerStore } from '../stores/tracker.store'

export function useTrackingToggle() {
  const trackerStore = useTrackerStore()

  const isCurrentlyTracking = (issueId: number) =>
    trackerStore.currentIssue?.id === issueId && trackerStore.isTracking

  const toggleTracking = async (issueId: number) => {
    if (isCurrentlyTracking(issueId)) {
      await trackerStore.pauseTracking()
    } else {
      await trackerStore.startTracking(issueId)
    }
  }

  return { isCurrentlyTracking, toggleTracking }
}
