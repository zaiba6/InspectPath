import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import Footer, { DISCLAIMER } from "../components/Footer";

// Replaces the three mock-provenance tests (mock source flagged, mock footer,
// mock disclaimer wording). Reason: there is no mock source or sample mode, so
// the footer always carries the one real-data disclaimer.
describe("data provenance labeling", () => {
  it("the footer always shows the real-data disclaimer", () => {
    render(<Footer />);
    expect(screen.getByText(DISCLAIMER)).toBeInTheDocument();
  });

  it("the disclaimer keeps the estimates-not-ratings wording and never says sample", () => {
    expect(DISCLAIMER).toBe(
      "Simulation with real bridge data. Alerts and severity are estimates, not engineering ratings."
    );
    expect(DISCLAIMER).not.toMatch(/sample|mock/i);
  });
});
