import type { DataSource, LoadResult } from "./source";
import type {
  DefectScores,
  DefectTier,
  Finding,
  ImageMap,
  MetricPlan,
  MetricStructure,
  PlanType,
  TriggerRecord,
} from "./types";
import { mockSource } from "./mockSource";
import {
  validateMetricPlan,
  validateMetricStructure,
  validateReplay,
} from "./validators";
import { addWarning } from "./dataWarnings";

// Base path where the shared data/ outputs are served from. Defaults to "/data".
const DATA_BASE =
  (import.meta.env.VITE_DATA_BASE_URL as string | undefined) ?? "/data";

// Defect model endpoint (contract §1: POST /predict).
const PREDICT_URL =
  (import.meta.env.VITE_PREDICT_URL as string | undefined) ??
  "http://localhost:8001";

// Fetches JSON, treating a non-OK status OR a non-JSON content-type as missing,
// and says which. The Vite dev server returns 200 + text/html (its SPA
// fallback) for files that don't exist, so res.ok alone is not enough.
async function loadJson(
  path: string
): Promise<{ ok: true; data: unknown } | { ok: false; reason: string }> {
  try {
    const res = await fetch(path, { method: "GET" });
    if (!res.ok) return { ok: false, reason: `HTTP ${res.status}` };
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) {
      return {
        ok: false,
        reason: `expected JSON but got "${contentType || "unknown"}" (file not served)`,
      };
    }
    return { ok: true, data: await res.json() };
  } catch (e) {
    return { ok: false, reason: `request failed (${String(e)})` };
  }
}

async function fetchJson(path: string): Promise<unknown | null> {
  const r = await loadJson(path);
  return r.ok ? r.data : null;
}

// ---- Replay (contract §2) ----
// A missing or invalid replay is an error naming the file. Nothing is shown in
// its place.

async function getReplay(dataset: string): Promise<LoadResult<TriggerRecord[]>> {
  const fileName = `replay_${dataset}.json`;
  const file = `${DATA_BASE}/trigger/${fileName}`;
  const loaded = await loadJson(file);
  if (!loaded.ok) return { ok: false, file, reason: loaded.reason };
  const res = validateReplay(loaded.data, fileName);
  if (!res.ok) return { ok: false, file, reason: res.error };
  return { ok: true, value: res.value, file };
}

// ---- Metric structure (contract §3b) ----
// Real KW51 geometry. The dashboard reads it; it never computes geometry.
// The layout file is served at /data/structures/kw51_layout.json.

async function getMetricStructure(): Promise<MetricStructure> {
  const fileName = "kw51_layout.json";
  const raw = await fetchJson(`${DATA_BASE}/structures/${fileName}`);
  if (raw === null) {
    // Not present yet: fall back to the metric sample. This is expected before
    // the geometry is deployed, so warn (it affects what the map shows).
    addWarning({
      piece: "structure",
      message: `${fileName} not found under ${DATA_BASE}/structures/. Using the metric sample.`,
    });
    return mockSource.getMetricStructure();
  }
  const res = validateMetricStructure(raw, fileName);
  if (!res.ok) {
    addWarning({ piece: "structure", message: `${res.error}. Falling back to the metric sample.` });
    return mockSource.getMetricStructure();
  }
  return res.value;
}

// ---- Metric plan (contract §4b) ----
// Produced only by firmware_esp32/planner.py and served as JSON files; the
// dashboard reads them and never computes a plan.

async function getMetricPlan(type: PlanType): Promise<MetricPlan> {
  const fileName = `kw51_${type}.json`;
  const raw = await fetchJson(`${DATA_BASE}/plans/${fileName}`);
  if (raw === null) {
    addWarning({
      piece: "plan",
      message: `${fileName} not found under ${DATA_BASE}/plans/. Using the metric sample plan.`,
    });
    return mockSource.getMetricPlan(type);
  }
  const res = validateMetricPlan(raw, fileName);
  if (!res.ok) {
    addWarning({ piece: "plan", message: `${res.error}. Falling back to the metric sample plan.` });
    return mockSource.getMetricPlan(type);
  }
  return res.value;
}

// ---- Image map (contract §5) ----

async function getImageMap(): Promise<ImageMap> {
  const raw = await fetchJson(`${DATA_BASE}/image_map.json`);
  if (raw === null || typeof raw !== "object") {
    return mockSource.getImageMap();
  }
  return raw as ImageMap;
}

// ---- Defects (contract §1) via POST /predict, per capture waypoint ----

// Tier rule per contract §1 (team decision, not an engineering standard).
function tierFromDetected(detected: string[]): DefectTier {
  if (detected.includes("exposed_bars") || detected.includes("spallation")) return "high";
  if (detected.includes("corrosion_stain")) return "medium";
  if (detected.includes("crack") || detected.includes("efflorescence")) return "low";
  return "none";
}

interface PredictResponse {
  scores: DefectScores;
  detected: string[];
  tier: DefectTier;
  threshold: number;
}

// Convert a Blob to a bare base64 string (no data: prefix).
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string; // "data:<mime>;base64,<payload>"
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

// Fetch an image from the served data/ path as base64, or null when it is not
// served. Guards against the Vite SPA fallback (HTML) for a missing image.
async function fetchImageBase64(imagePath: string): Promise<string | null> {
  try {
    const imgRes = await fetch(`${DATA_BASE}/${imagePath.replace(/^\/+/, "")}`);
    if (!imgRes.ok) return null;
    const contentType = imgRes.headers.get("content-type") ?? "";
    if (!contentType.startsWith("image/")) return null;
    return await blobToBase64(await imgRes.blob());
  } catch {
    return null;
  }
}

// The defect API's /health says whether it is up and whether it is in test
// mode ("mock": true = deterministic fake scores, which are never shown).
type ModelState = "ready" | "model_unavailable" | "model_test_mode";

async function defectModelState(): Promise<ModelState> {
  try {
    const res = await fetch(`${PREDICT_URL}/health`, { method: "GET" });
    if (!res.ok) return "model_unavailable";
    const data = await res.json();
    if (data && data.mock === true) return "model_test_mode";
    return "ready";
  } catch {
    return "model_unavailable";
  }
}

// Contract §1: POST /predict takes an image file or base64 image — NOT a path.
// We send base64 JSON ({ image_base64 }), which Zaiba's API accepts. Returns
// null on any failure; the finding is then shown as not scored.
async function predict(imageBase64: string): Promise<PredictResponse | null> {
  try {
    const res = await fetch(`${PREDICT_URL}/predict`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image_base64: imageBase64 }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || typeof data !== "object" || !data.scores || !Array.isArray(data.detected)) {
      return null;
    }
    return data as PredictResponse;
  } catch {
    return null;
  }
}

// The imaged connections are the keys of the real image map for this structure
// (each "<location_id>" with an optional "<location_id>_closeup"). Each one is
// scored by the real defect model, or marked not scored with the reason.
async function getFindings(structure: MetricStructure): Promise<Finding[]> {
  const imageMap = await getImageMap();
  const images = imageMap[structure.id] ?? {};
  const locById = new Map(
    structure.diagonal_connections.distinct_locations.map((l) => [l.location_id, l])
  );

  const keys = Object.keys(images).filter((k) => !k.endsWith("_closeup"));
  const unknown = keys.filter((k) => !locById.has(k));
  if (unknown.length > 0) {
    addWarning({
      piece: "defects",
      message:
        `image_map.json lists ${unknown.length} key(s) that are not connections ` +
        `in the layout (e.g. ${unknown[0]}); those images are not shown.`,
    });
  }
  const located = keys.filter((k) => locById.has(k));
  if (located.length === 0) return [];

  const modelState = await defectModelState();
  const findings: Finding[] = [];

  for (const key of located) {
    const base = {
      id: `f-${key}`,
      location_id: key,
      side: locById.get(key)!.side,
      image_key: key,
      has_closeup: Boolean(images[`${key}_closeup`]),
    };

    const imageBase64 = await fetchImageBase64(images[key]);
    if (imageBase64 === null) {
      findings.push({ ...base, status: "not_scored", reason: "image_missing" });
      continue;
    }
    if (modelState !== "ready") {
      findings.push({ ...base, status: "not_scored", reason: modelState });
      continue;
    }
    const result = await predict(imageBase64);
    if (!result) {
      findings.push({ ...base, status: "not_scored", reason: "model_unavailable" });
      continue;
    }
    findings.push({
      ...base,
      status: "scored",
      tier: result.tier ?? tierFromDetected(result.detected),
      scores: result.scores,
      detected: result.detected,
    });
  }

  return findings;
}

export const realSource: DataSource = {
  isMock: false,
  getReplay,
  getMetricStructure,
  getMetricPlan,
  getImageMap,
  getFindings,
};
