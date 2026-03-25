import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@aptos-labs/wallet-adapter-react",
    "@aptos-labs/wallet-adapter-core",
    "@aptos-labs/wallet-standard",
    "@aptos-labs/aptos-client",
    "@shelby-protocol/react",
    "@wallet-standard/core",
    "@wallet-standard/base"
  ],
  serverExternalPackages: [
    "@aptos-labs/ts-sdk",
    "@shelby-protocol/sdk",
    "got"
  ],
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
      };
    }
    return config;
  },
  // @ts-ignore
  turbopack: {},
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' blob: data: https://*; connect-src 'self' https://* wss://*; frame-src 'self' https://*; upgrade-insecure-requests;",
          },
          {
            key: "X-Frame-Options",
            value: "SAMEORIGIN",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "origin-when-cross-origin",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains; preload",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
