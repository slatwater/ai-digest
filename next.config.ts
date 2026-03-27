import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Claude Agent SDK 需要 Node.js API（child_process 等），不能被 webpack bundle
  serverExternalPackages: ["@anthropic-ai/claude-agent-sdk"],
};

export default nextConfig;
