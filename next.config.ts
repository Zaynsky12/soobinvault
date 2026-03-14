import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@aptos-labs/wallet-adapter-react",
    "petra-plugin-wallet-adapter",
    "aptos",
    "@aptos-labs/ts-sdk",
    "@aptos-labs/aptos-client",
    "@shelby-protocol/react",
    "@shelby-protocol/sdk"
  ]
};

export default nextConfig;
