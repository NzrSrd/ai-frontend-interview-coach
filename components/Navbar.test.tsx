// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

// The App Router hooks/components need a router context that doesn't exist in a
// bare render, so stub them with lightweight equivalents.
const pathname = vi.fn(() => "/");
vi.mock("next/navigation", () => ({ usePathname: () => pathname() }));
vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => {
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img {...props} />;
  },
}));
vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...rest
  }: {
    children: React.ReactNode;
    href: string;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import Navbar from "@/components/Navbar";

afterEach(cleanup);

describe("Navbar", () => {
  it("shows the logo home link and the eval dashboard link on the home page", () => {
    pathname.mockReturnValue("/");
    render(<Navbar />);
    expect(screen.getByRole("link", { name: /home/i })).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /eval dashboard/i }),
    ).toBeInTheDocument();
  });

  it("hides the eval link from assistive tech off the home page", () => {
    pathname.mockReturnValue("/eval");
    render(<Navbar />);
    const evalLink = screen.getByText(/eval dashboard/i).closest("a");
    expect(evalLink).toHaveAttribute("aria-hidden", "true");
    expect(evalLink).toHaveAttribute("tabindex", "-1");
  });
});
