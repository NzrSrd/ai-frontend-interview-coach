import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Enables React's <ViewTransition> integration for animated route changes.
    viewTransition: true,
  },
};

export default nextConfig;
