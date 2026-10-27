import { useState } from "react";
import { generateReport } from "./llmClient";
import type { Finding, AlertHistoryEntry, InspectionReport } from "../../data/types";

type Status = "idle" | "loading" | "done" | "error";

export function useReport() {
  const [report, setReport] = useState<InspectionReport | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [notice, setNotice] = useState<string | null>(null);

  async function run(findings: Finding[], alertHistory: AlertHistoryEntry[]) {
    setStatus("loading");
    setNotice(null);
    try {
      const result = await generateReport({ findings, alertHistory });
      setReport(result);
      setStatus("done");
    } catch (e) {
      // No sample report: say what failed. The rule-based report is unaffected.
      setStatus("error");
      const reason = e instanceof Error ? e.message : String(e);
      setNotice(`AI summary failed: ${reason}. The rule-based report is unaffected.`);
    }
  }

  return { report, status, notice, run };
}
