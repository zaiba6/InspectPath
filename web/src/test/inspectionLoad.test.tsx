// Replaces the "metric fallback" tests. There is no sample structure or plan:
// when the real layout or a plan can't be loaded (or doesn't match), the
// inspection data is an error that names the file, and the view says so
// instead of drawing any bridge.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import { realSource } from "../data/realSource";
import { getInspectionData, resetInspectionData } from "../data/activeSource";
import { clearWarnings } from "../data/dataWarnings";
import { ViewStateProvider } from "../app/viewState";
import InspectionView from "../features/inspection/InspectionView";
import layoutRaw from "../../../data/structures/kw51_layout.json";
import naiveRaw from "../../../data/plans/kw51_naive.json";
import optimizedRaw from "../../../data/plans/kw51_optimized.json";

const realFetch = globalThis.fetch;

const json = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
const htmlFallback = () =>
  new Response("<!doctype html>", {
    status: 200,
    headers: { "content-type": "text/html" },
  });

// Serve the real files, with optional per-file overrides.
function serve(overrides: Record<string, () => Response> = {}) {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    for (const [suffix, respond] of Object.entries(overrides)) {
      if (url.endsWith(suffix)) return respond();
    }
    if (url.endsWith("/structures/kw51_layout.json")) return json(layoutRaw);
    if (url.endsWith("/plans/kw51_naive.json")) return json(naiveRaw);
    if (url.endsWith("/plans/kw51_optimized.json")) return json(optimizedRaw);
    return new Response("not found", { status: 404 });
  }) as unknown as typeof fetch;
}

describe("inspection data loading (no sample fallback)", () => {
  beforeEach(() => {
    clearWarnings();
    resetInspectionData();
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
    vi.restoreAllMocks();
  });

  // Changed from "missing layout -> metric sample structure + warning".
  it("a missing layout is an error naming the file, not a sample structure", async () => {
    serve({ "/structures/kw51_layout.json": htmlFallback });
    const res = await realSource.getMetricStructure();
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.file).toBe("/data/structures/kw51_layout.json");
      expect(res.reason).toMatch(/expected JSON/);
    }
  });

  // Changed from "invalid plan -> metric sample plan + warning naming the field".
  it("an invalid plan is an error naming the file and the bad field, not a sample plan", async () => {
    serve({
      "/plans/kw51_optimized.json": () =>
        json({ plan_type: "optimized", units: "m", stops: [], stats: {}, provenance: {} }),
    });
    const res = await realSource.getMetricPlan("optimized");
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.file).toBe("/data/plans/kw51_optimized.json");
      expect(res.reason).toMatch(/stops/);
    }
  });

  it("loads the real layout and both plans together when all are valid", async () => {
    serve();
    const d = await getInspectionData();
    expect(d.ok).toBe(true);
    if (d.ok) {
      expect(d.structure.id).toBe("kw51");
      expect(d.plans.naive.stops).toHaveLength(34);
      expect(d.plans.optimized.stops).toHaveLength(34);
    }
  });

  it("a missing plan makes the whole bundle an error naming that plan file", async () => {
    serve({ "/plans/kw51_naive.json": () => new Response("", { status: 404 }) });
    const d = await getInspectionData();
    expect(d).toEqual({ ok: false, file: "/data/plans/kw51_naive.json", reason: "HTTP 404" });
  });

  it("a plan that references a location not in the layout is an error naming the plan", async () => {
    const bad = structuredClone(optimizedRaw) as { stops: { location_id: string }[] };
    bad.stops[0].location_id = "X-deck-999999";
    serve({ "/plans/kw51_optimized.json": () => json(bad) });
    const d = await getInspectionData();
    expect(d.ok).toBe(false);
    if (!d.ok) {
      expect(d.file).toBe("/data/plans/kw51_optimized.json");
      expect(d.reason).toMatch(/X-deck-999999/);
      expect(d.reason).toMatch(/kw51_layout\.json/);
    }
  });

  it("the inspection view shows the message and file, and draws no bridge", async () => {
    serve({ "/structures/kw51_layout.json": () => new Response("", { status: 404 }) });
    render(
      <ViewStateProvider>
        <InspectionView />
      </ViewStateProvider>
    );
    await act(async () => {
      for (let i = 0; i < 5; i++) await Promise.resolve();
    });
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Bridge inspection data couldn't be loaded.");
    expect(within(alert).getByText("/data/structures/kw51_layout.json")).toBeInTheDocument();
    expect(alert).toHaveTextContent("HTTP 404");
    expect(screen.queryByLabelText("Map legend")).not.toBeInTheDocument();
    expect(screen.queryByText(/Inspection stats/)).not.toBeInTheDocument();
  });
});
