// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import LoadingState from "@/components/LoadingState";

afterEach(cleanup);

describe("LoadingState", () => {
  it("renders a polite status region with the waiting copy", () => {
    render(<LoadingState />);
    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(screen.getByText(/generating your interview/i)).toBeInTheDocument();
  });
});
