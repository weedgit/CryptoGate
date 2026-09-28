import { useSyncExternalStore } from "react";
import { getViewerTimeZone, subscribeViewerTimeZone } from "./dateTime";

/** Viewer zone that re-renders the caller when the profile zone changes. */
export function useViewerTimeZone(): string {
  return useSyncExternalStore(subscribeViewerTimeZone, getViewerTimeZone, getViewerTimeZone);
}
