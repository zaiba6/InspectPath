import { useEffect, useRef, useState } from "react";
import { getDataSource } from "../../data/activeSource";
import type { TriggerRecord } from "../../data/types";
import { useViewState } from "../../app/viewState";

// Base tick at 1x. ~2 records/sec => ~500ms per record at 1x.
const BASE_INTERVAL_MS = 500;

export interface ReplayLoadError {
  file: string; // the file that was requested
  reason: string;
}

interface ReplayState {
  records: TriggerRecord[];
  current: TriggerRecord | null;
  loading: boolean;
  loadedFile: string | null; // the file the records came from
  error: ReplayLoadError | null; // set when the selected file couldn't be loaded
}

// Drives the replay cursor through the trigger array in timestamp order.
// Speed multiplier (1 | 5 | 20) divides the base interval.
// Stops and holds on the last record (no wraparound unless restarted).
export function useReplay(): ReplayState {
  const [records, setRecords] = useState<TriggerRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadedFile, setLoadedFile] = useState<string | null>(null);
  const [error, setError] = useState<ReplayLoadError | null>(null);
  const {
    replayCursor,
    setReplayCursor,
    replayRunning,
    setReplayRunning,
    replaySpeed,
    replayDataset,
    setAlertHistory,
  } = useViewState();

  // Load records whenever the selected dataset changes. Reset replay position.
  useEffect(() => {
    let active = true;
    setLoading(true);
    getDataSource().getReplay(replayDataset).then((res) => {
      if (!active) return;
      if (!res.ok) {
        // No data is shown in place of a file that failed to load.
        setRecords([]);
        setLoadedFile(null);
        setError({ file: res.file, reason: res.reason });
        setLoading(false);
        setReplayRunning(false);
        setAlertHistory([]);
        lastLevelRef.current = null;
        return;
      }
      const sorted = [...res.value].sort((a, b) =>
        a.timestamp.localeCompare(b.timestamp)
      );
      setRecords(sorted);
      setLoadedFile(res.file);
      setError(null);
      setLoading(false);
      // Restart the replay for the newly selected dataset.
      setReplayCursor(0);
      setReplayRunning(true);
      setAlertHistory([]);
      lastLevelRef.current = null;
    });
    return () => {
      active = false;
    };
  }, [replayDataset, setReplayCursor, setReplayRunning, setAlertHistory]);

  // Advance the cursor on a timer.
  const lastLevelRef = useRef<string | null>(null);
  useEffect(() => {
    if (loading || !replayRunning || records.length === 0) return;

    const interval = Math.max(50, Math.round(BASE_INTERVAL_MS / replaySpeed));
    const id = window.setInterval(() => {
      setReplayCursor((prev) => {
        const next = prev + 1;
        if (next >= records.length) {
          setReplayRunning(false);
          return records.length - 1; // hold on last record
        }
        return next;
      });
    }, interval);

    return () => window.clearInterval(id);
  }, [loading, replayRunning, replaySpeed, records.length, setReplayCursor, setReplayRunning]);

  const current =
    records.length > 0
      ? records[Math.min(replayCursor, records.length - 1)]
      : null;

  // Append to alert history only when the alert level changes.
  useEffect(() => {
    if (!current) return;
    if (lastLevelRef.current !== current.alert_level) {
      lastLevelRef.current = current.alert_level;
      setAlertHistory((prev) => [
        ...prev,
        {
          timestamp: current.timestamp,
          alert_level: current.alert_level,
          residual_pct: current.residual_pct,
          quality: current.quality,
        },
      ]);
    }
  }, [current, setAlertHistory]);

  return { records, current, loading, loadedFile, error };
}
