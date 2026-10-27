import type { DataSource, LoadResult } from "./source";
import type {
  TriggerRecord,
  PlanType,
  ImageMap,
  Finding,
  MetricStructure,
  MetricPlan,
} from "./types";

import replayZ24 from "../mocks/replay_z24.json";
import structureKw51Sample from "../mocks/structure_kw51_sample.json";
import planKw51NaiveSample from "../mocks/plan_kw51_naive_sample.json";
import planKw51OptimizedSample from "../mocks/plan_kw51_optimized_sample.json";
import imageMap from "../mocks/image_map.json";
import findings from "../mocks/findings.json";

// Mock implementation of DataSource, backed by files in src/mocks/.
// Field names match docs/contract.md so the same files would validate
// against the real producers' output.
export const mockSource: DataSource = {
  isMock: true,

  async getReplay(dataset: string): Promise<LoadResult<TriggerRecord[]>> {
    void dataset;
    return { ok: true, value: replayZ24 as TriggerRecord[], file: "replay_z24.json" };
  },

  async getMetricStructure(): Promise<LoadResult<MetricStructure>> {
    return {
      ok: true,
      value: structureKw51Sample as unknown as MetricStructure,
      file: "structure_kw51_sample.json",
    };
  },

  async getMetricPlan(type: PlanType): Promise<LoadResult<MetricPlan>> {
    const value = (type === "optimized"
      ? planKw51OptimizedSample
      : planKw51NaiveSample) as unknown as MetricPlan;
    return { ok: true, value, file: `plan_kw51_${type}_sample.json` };
  },

  async getImageMap(): Promise<ImageMap> {
    return imageMap as ImageMap;
  },

  async getFindings(structure: MetricStructure): Promise<Finding[]> {
    void structure;
    return findings as Finding[];
  },
};
