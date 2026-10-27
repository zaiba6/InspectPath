import type { Finding, AlertHistoryEntry, InspectionReport } from "../../data/types";

export interface ReportRequest {
  findings: Finding[];
  alertHistory: AlertHistoryEntry[];
}

// API base URL (not a secret — just where our backend lives).
const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ??
  "http://localhost:8000";

// Returns true if the report backend is reachable and reports healthy.
// Used to decide whether to offer the optional "AI summary" toggle.
export async function isBackendReachable(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE_URL}/health`, { method: "GET" });
    return res.ok;
  } catch {
    return false;
  }
}

// Calls our backend /report endpoint, which holds the LLM credential
// server-side. On any failure (endpoint unavailable, no credential, error) it
// throws with the reason. There is no sample report to fall back to.
export async function generateReport(
  req: ReportRequest
): Promise<InspectionReport> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}/report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
    });
  } catch {
    throw new Error(`the report service at ${API_BASE_URL} could not be reached`);
  }

  if (!res.ok) throw new Error(`the report service returned HTTP ${res.status}`);

  const data = await res.json().catch(() => null);
  const text: string | undefined = data?.text;
  if (!text) throw new Error("the report service returned no summary text");

  return {
    text,
    generatedAt: new Date().toISOString(),
    source: "llm",
  };
}
