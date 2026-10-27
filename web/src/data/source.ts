import type {
  TriggerRecord,
  PlanType,
  ImageMap,
  Finding,
  MetricStructure,
  MetricPlan,
} from "./types";

// Result of loading one data file. On failure it names the file that was
// requested and why it failed, so the UI can say so instead of showing other
// data in its place.
export type LoadResult<T> =
  | { ok: true; value: T; file: string }
  | { ok: false; file: string; reason: string };

// The single seam between the dashboard and its data.
// Today only mockSource implements this; a realSource can be added later
// with no changes to the views.
export interface DataSource {
  // True when this source serves mock/sample data rather than real sensor data.
  // The UI uses this to avoid claiming real data in the monitor subtitle/footer.
  readonly isMock: boolean;
  getReplay(dataset: string): Promise<LoadResult<TriggerRecord[]>>; // [contract §2]
  getMetricStructure(): Promise<MetricStructure>; // [contract §3b]
  getMetricPlan(type: PlanType): Promise<MetricPlan>; // [contract §4b]
  getImageMap(): Promise<ImageMap>; // [contract §5]
  getFindings(structure: MetricStructure): Promise<Finding[]>; // [dashboard-internal]
}
