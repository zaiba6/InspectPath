// Replaces the startup data-source probe tests. There is no probe and no mock
// source any more: the monitor loads the selected real replay file, and if it
// can't, it says which file failed instead of showing any other data.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import { realSource } from "../data/realSource";
import * as activeSource from "../data/activeSource";
import type { DataSource } from "../data/source";
import type { TriggerRecord } from "../data/types";
import { clearWarnings } from "../data/dataWarnings";
import { ViewStateProvider } from "../app/viewState";
import MonitorView from "../features/monitor/MonitorView";
import DatasetPicker from "../features/monitor/DatasetPicker";
import StatusCard from "../features/monitor/StatusCard";
import { inRetrofitPeriod } from "../features/monitor/monitorMetrics";
import demo from "../../../data/trigger/replay_kw51_demo.json";
import full from "../../../data/trigger/replay_kw51.json";

const realFetch = globalThis.fetch;

function serve(handler: (url: string) => Response) {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) =>
    handler(String(input))
  ) as unknown as typeof fetch;
}

const json = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

describe("replay loading names the file on failure (no mock fallback)", () => {
  beforeEach(() => clearWarnings());
  afterEach(() => {
    globalThis.fetch = realFetch;
    vi.restoreAllMocks();
  });

  it("loads the real demo replay and reports which file it came from", async () => {
    serve((url) =>
      url.endsWith("/trigger/replay_kw51_demo.json") ? json(demo) : new Response("", { status: 404 })
    );
    const res = await realSource.getReplay("kw51_demo");
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.file).toBe("/data/trigger/replay_kw51_demo.json");
      expect(res.value).toHaveLength(165);
    }
  });

  it("a missing file (HTTP 404) is an error naming the file, with no records", async () => {
    serve(() => new Response("not found", { status: 404 }));
    const res = await realSource.getReplay("kw51");
    expect(res).toEqual({
      ok: false,
      file: "/data/trigger/replay_kw51.json",
      reason: "HTTP 404",
    });
  });

  it("Vite's HTML fallback for a missing file is an error, not data", async () => {
    serve(
      () =>
        new Response("<!doctype html>", {
          status: 200,
          headers: { "content-type": "text/html" },
        })
    );
    const res = await realSource.getReplay("kw51_demo");
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.file).toBe("/data/trigger/replay_kw51_demo.json");
      expect(res.reason).toMatch(/expected JSON/);
    }
  });

  it("an invalid file is an error naming the file and the bad field", async () => {
    serve(() => json([{ node_id: "node-1" }]));
    const res = await realSource.getReplay("kw51_demo");
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.file).toBe("/data/trigger/replay_kw51_demo.json");
      expect(res.reason).toMatch(/replay_kw51_demo\.json/);
    }
  });
});

describe("monitor view when the replay can't be loaded", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows the load-error message naming the file, and no readings", async () => {
    vi.spyOn(activeSource, "getDataSource").mockReturnValue({
      getReplay: async () => ({
        ok: false,
        file: "/data/trigger/replay_kw51_demo.json",
        reason: "HTTP 404",
      }),
    } as unknown as DataSource);
    render(
      <ViewStateProvider>
        <MonitorView />
      </ViewStateProvider>
    );
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Bridge monitoring data couldn't be loaded.");
    expect(within(alert).getByText("/data/trigger/replay_kw51_demo.json")).toBeInTheDocument();
    expect(alert).toHaveTextContent("HTTP 404");
    // No status card, chart, or any reading is shown in its place.
    expect(screen.queryByLabelText(/Bridge status/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Engineering detail/)).not.toBeInTheDocument();
  });
});

describe("dataset picker", () => {
  it("offers only the two real KW51 datasets", () => {
    render(
      <ViewStateProvider>
        <DatasetPicker />
      </ViewStateProvider>
    );
    const options = screen.getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual(["KW51 demo (short)", "KW51 full"]);
  });
});

describe("retrofit context note follows the current reading's timestamp", () => {
  const demoRecords = demo as TriggerRecord[];
  const fullRecords = full as TriggerRecord[];
  const NOTE = /falls inside KW51's retrofit period/;

  function renderCard(record: TriggerRecord) {
    return render(
      <ViewStateProvider>
        <StatusCard record={record} since={null} />
      </ViewStateProvider>
    );
  }

  it("is shown for a demo reading", () => {
    renderCard(demoRecords[0]);
    expect(screen.getByText(NOTE)).toBeInTheDocument();
  });

  it("is shown for a full-replay reading inside the period", () => {
    const inside = fullRecords.find((r) => r.timestamp.startsWith("2019-07-"))!;
    expect(inside).toBeDefined();
    renderCard(inside);
    expect(screen.getByText(NOTE)).toBeInTheDocument();
  });

  it("is hidden for a full-replay reading outside the period", () => {
    const outside = fullRecords[0];
    expect(outside.timestamp.startsWith("2018-11-")).toBe(true);
    renderCard(outside);
    expect(screen.queryByText(NOTE)).not.toBeInTheDocument();
  });

  it("uses the trigger model's boundaries (2019-05-15 to 2019-09-27 inclusive)", () => {
    expect(inRetrofitPeriod("2019-05-14T23:59:59Z")).toBe(false);
    expect(inRetrofitPeriod("2019-05-15T00:00:00Z")).toBe(true);
    expect(inRetrofitPeriod("2019-09-27T23:00:00Z")).toBe(true);
    expect(inRetrofitPeriod("2019-09-28T00:00:00Z")).toBe(false);
  });
});
