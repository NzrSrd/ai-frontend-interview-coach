// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import InterviewForm from "@/components/InterviewForm";
import { MARKERS } from "@/lib/interviewFormat";

const fetchMock = vi.fn();

function streamedResponse(text: string): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(new TextEncoder().encode(text));
      c.close();
    },
  });
  return new Response(stream, { status: 200 });
}

const oneBlock = [
  MARKERS.question,
  "What is a closure?",
  MARKERS.answer,
  "A function bundled with its lexical scope.",
  MARKERS.followUps,
  "- How is it used for data privacy?",
  MARKERS.end,
].join("\n");

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  localStorage.clear();
  fetchMock.mockReset();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("InterviewForm", () => {
  it("renders the form controls", () => {
    render(<InterviewForm />);
    expect(
      screen.getByRole("button", { name: /generate questions/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("Topic")).toBeInTheDocument();
    expect(screen.getByText("Difficulty")).toBeInTheDocument();
  });

  it("streams a generated question into a result card and auto-saves it", async () => {
    fetchMock.mockResolvedValueOnce(streamedResponse(oneBlock));
    render(<InterviewForm />);

    await userEvent.click(
      screen.getByRole("button", { name: /generate questions/i }),
    );

    expect(await screen.findByText("What is a closure?")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/interview",
      expect.objectContaining({ method: "POST" }),
    );
    // The generation is auto-persisted for later grading.
    expect(localStorage.getItem("nextstep.savedInterviews.v1")).toContain(
      "What is a closure?",
    );
  });

  it("shows an error message when the API returns a non-OK status", async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json({ error: "Too many requests." }, { status: 429 }),
    );
    render(<InterviewForm />);

    await userEvent.click(
      screen.getByRole("button", { name: /generate questions/i }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /too many requests/i,
    );
  });
});
