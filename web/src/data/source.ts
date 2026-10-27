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

// The single seam between the dashboard and its data. realSource is the only
// implementation; it reads the real data/ files and never substitutes others.
export interface DataSource {
  getReplay(dataset: string): Promise<LoadResult<TriggerRecord[]>>; // [contract §2]
  getMetricStructure(): Promise<LoadResult<MetricStructure>>; // [contract §3b]
  getMetricPlan(type: PlanType): Promise<LoadResult<MetricPlan>>; // [contract §4b]
  getImageMap(): Promise<ImageMap>; // [contract §5]
  getFindings(structure: MetricStructure): Promise<Finding[]>; // [dashboard-internal]
}
