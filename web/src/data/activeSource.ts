import type { DataSource } from "./source";
import { realSource } from "./realSource";
import type { MetricPlan, MetricStructure, PlanType } from "./types";

// The dashboard reads only the real data/ files. There is no mock source to
// switch to: a file that can't be loaded is reported by name in the view that
// needs it.

export const DATA_BASE =
  (import.meta.env.VITE_DATA_BASE_URL as string | undefined) ?? "/data";

// Resolve an image-map path (relative, e.g. "images/test/x.png") to a URL the
// browser can load, served under the data base (e.g. "/data/images/test/x.png").
// Absolute URLs and already-prefixed paths pass through unchanged.
export function resolveImageUrl(p: string | undefined): string | undefined {
  if (!p) return undefined;
  if (/^(https?:)?\/\//.test(p) || p.startsWith(DATA_BASE + "/")) return p;
  const clean = p.replace(/^\/+/, "");
  return `${DATA_BASE}/${clean}`;
}

export function getDataSource(): DataSource {
  return realSource;
}

// ---- Coherent metric geometry + plans ----
// The inspection view and the report both need the structure AND both plans.
// getInspectionData resolves them as ONE unit: either all real and consistent,
// or an error naming the file that failed. There is no sample to fall back to:
//   - a missing or invalid layout or plan file is an error naming that file;
//   - a plan whose stops reference locations absent from the layout is an error
//     naming the plan file, because mismatched data must not be rendered.

export type InspectionData =
  | { ok: true; structure: MetricStructure; plans: Record<PlanType, MetricPlan> }
  | { ok: false; file: string; reason: string };

let inspectionDataPromise: Promise<InspectionData> | null = null;

// Reset the cached bundle (used by tests; harmless in the app).
export function resetInspectionData(): void {
  inspectionDataPromise = null;
}

async function resolveInspectionData(): Promise<InspectionData> {
  const src = getDataSource();
  const structure = await src.getMetricStructure();
  if (!structure.ok) {
    return { ok: false, file: structure.file, reason: structure.reason };
  }

  const [naive, optimized] = await Promise.all([
    src.getMetricPlan("naive"),
    src.getMetricPlan("optimized"),
  ]);
  if (!naive.ok) return { ok: false, file: naive.file, reason: naive.reason };
  if (!optimized.ok) return { ok: false, file: optimized.file, reason: optimized.reason };

  // Every stop in each plan must exist in the layout.
  const locationIds = new Set(
    structure.value.diagonal_connections.distinct_locations.map((l) => l.location_id)
  );
  for (const plan of [naive, optimized]) {
    const missing = plan.value.stops.filter((s) => !locationIds.has(s.location_id));
    if (missing.length > 0) {
      return {
        ok: false,
        file: plan.file,
        reason:
          `references ${missing.length} location(s) not in ${structure.file} ` +
          `(e.g. ${missing[0].location_id})`,
      };
    }
  }

  return {
    ok: true,
    structure: structure.value,
    plans: { naive: naive.value, optimized: optimized.value },
  };
}

// Resolve (and cache) the coherent structure + plans bundle.
export function getInspectionData(): Promise<InspectionData> {
  if (!inspectionDataPromise) {
    inspectionDataPromise = resolveInspectionData();
  }
  return inspectionDataPromise;
}
