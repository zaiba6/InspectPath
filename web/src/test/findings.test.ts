import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { realSource } from "../data/realSource";
import { clearWarnings } from "../data/dataWarnings";
import type { MetricStructure } from "../data/types";

// The committed files: the imaged connections come from the real image map,
// never from a mock list.
import layoutRaw from "../../../data/structures/kw51_layout.json";
import imageMapRaw from "../../../data/image_map.json";

const structure = layoutRaw as unknown as MetricStructure;
const realKeys = Object.keys(
  (imageMapRaw as unknown as Record<string, Record<string, string>>).kw51
).filter((k) => !k.endsWith("_closeup"));

type Health = "ready" | "test_mode" | "down";

// A /predict response used only to prove scores are passed through.
const PREDICT_BODY = {
  scores: { crack: 0.1, spallation: 0.9, exposed_bars: 0.2, efflorescence: 0.1, corrosion_stain: 0.1 },
  detected: ["spallation"],
  tier: "high",
  threshold: 0.5,
};

function serve({ health, images }: { health: Health; images: boolean }) {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const json = (body: unknown) =>
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    if (url.endsWith("/image_map.json")) return json(imageMapRaw);
    if (url.includes("/images/")) {
      if (!images) return new Response("<html></html>", { headers: { "content-type": "text/html" } });
      // Not a Node Response: its blob() would be a Node Blob, which jsdom's
      // FileReader rejects. The browser has one Blob type, so this mirrors it.
      return {
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "image/png" }),
        blob: async () => new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" }),
      } as unknown as Response;
    }
    if (url.endsWith("/health")) {
      if (health === "down") throw new TypeError("connection refused");
      return json({ status: "ok", mock: health === "test_mode" });
    }
    if (url.endsWith("/predict")) return json(PREDICT_BODY);
    return new Response("not found", { status: 404 });
  }) as unknown as typeof fetch;
}

describe("findings come from the real image map", () => {
  const realFetch = globalThis.fetch;
  beforeEach(() => clearWarnings());
  afterEach(() => {
    globalThis.fetch = realFetch;
    vi.restoreAllMocks();
  });

  it("lists exactly the imaged connections in data/image_map.json, with sides from the layout", async () => {
    serve({ health: "ready", images: true });
    const findings = await realSource.getFindings(structure);
    expect(findings.map((f) => f.location_id)).toEqual(realKeys);
    expect(findings).toHaveLength(4);
    for (const f of findings) expect(f.side).toBe(f.location_id[0]);
    expect(findings.find((f) => f.location_id === "A-deck-105020")?.has_closeup).toBe(true);
    expect(findings.find((f) => f.location_id === "C-arch-104023")?.has_closeup).toBe(false);
  });

  it("scores every finding with the model's response when the model is ready", async () => {
    serve({ health: "ready", images: true });
    const findings = await realSource.getFindings(structure);
    for (const f of findings) {
      expect(f.status).toBe("scored");
      if (f.status === "scored") {
        expect(f.tier).toBe("high");
        expect(f.scores.spallation).toBe(0.9);
      }
    }
  });

  it("marks every finding not scored (test mode) when /health reports mock: true", async () => {
    serve({ health: "test_mode", images: true });
    const findings = await realSource.getFindings(structure);
    expect(findings).toHaveLength(4);
    for (const f of findings) {
      expect(f).toMatchObject({ status: "not_scored", reason: "model_test_mode" });
      expect(f).not.toHaveProperty("scores");
      expect(f).not.toHaveProperty("tier");
    }
  });

  it("marks every finding not scored (model unavailable) when the model can't be reached", async () => {
    serve({ health: "down", images: true });
    const findings = await realSource.getFindings(structure);
    for (const f of findings) {
      expect(f).toMatchObject({ status: "not_scored", reason: "model_unavailable" });
    }
  });

  it("marks a finding not scored (image not available) when its image isn't served", async () => {
    serve({ health: "ready", images: false });
    const findings = await realSource.getFindings(structure);
    for (const f of findings) {
      expect(f).toMatchObject({ status: "not_scored", reason: "image_missing" });
    }
  });
});
