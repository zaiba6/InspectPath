import { useReplay } from "./useReplay";
import StatusCard from "./StatusCard";
import SummaryMetrics from "./SummaryMetrics";
import DriftChart from "./DriftChart";
import AlertTimeline from "./AlertTimeline";
import EngineeringSection from "./EngineeringSection";
import ReplayControls from "./ReplayControls";
import DatasetPicker from "./DatasetPicker";
import { currentLevelSince } from "./monitorMetrics";
import { useViewState } from "../../app/viewState";

// Every monitor chart shares ONE time window so the frequency, drift, and
// engineering charts line up (previously the frequency chart used 12 and the
// residual chart 24, showing different spans).
const CHART_WINDOW = 24;

// UTC calendar date of an ISO timestamp, e.g. "2019-06-22".
function utcDate(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

export default function MonitorView() {
  const { current, loading, records, loadedFile, error } = useReplay();
  const { replayCursor } = useViewState();

  if (loading || error) {
    return (
      <div className="monitor">
        <div className="monitor-head">
          <div>
            <h2 className="view-title">Bridge monitor</h2>
          </div>
          <DatasetPicker />
        </div>
        {loading ? (
          <p className="placeholder">Loading monitor…</p>
        ) : (
          error && (
            <div className="load-error" role="alert">
              <p className="load-error-title">
                Bridge monitoring data couldn't be loaded.
              </p>
              <p>
                File: <code>{error.file}</code> ({error.reason}).
              </p>
              <p className="muted">No readings are shown.</p>
            </div>
          )
        )}
      </div>
    );
  }
  if (!current || records.length === 0 || !loadedFile) {
    return <p className="placeholder">No monitor data available.</p>;
  }

  const index = Math.min(replayCursor, records.length - 1);
  const atEnd = index >= records.length - 1;
  // History up to (and including) the current cursor — the data every panel
  // summarizes. Nothing reads past the cursor.
  const history = records.slice(0, index + 1);
  const since = currentLevelSince(history);

  // Dates come from the loaded records, not from the picker selection.
  const subtitle =
    `Replay of real bridge data (${current.source}, ` +
    `${utcDate(records[0].timestamp)} to ${utcDate(records[records.length - 1].timestamp)} UTC). ` +
    "Timestamps are recorded times, not live.";

  return (
    <div className="monitor">
      <div className="monitor-head">
        <div>
          <h2 className="view-title">Bridge monitor</h2>
          <p className="muted">{subtitle}</p>
        </div>
        <div className="monitor-controls">
          <DatasetPicker />
          <ReplayControls atEnd={atEnd} />
        </div>
      </div>

      {/* LAYER 1 — summary for anyone. DOM order = mobile stack order. */}
      <StatusCard record={current} since={since} />
      <SummaryMetrics current={current} history={history} />
      <DriftChart records={records} upToIndex={index} window={CHART_WINDOW} />
      <AlertTimeline history={history} />

      {/* LAYER 2 — engineering detail, always visible. */}
      <EngineeringSection
        current={current}
        history={history}
        upToIndex={index}
        window={CHART_WINDOW}
        sourceFile={loadedFile}
      />
    </div>
  );
}
