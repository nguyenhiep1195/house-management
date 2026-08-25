import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";

const withSerwist = withSerwistInit({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
});

const nextConfig: NextConfig = {
  output: "standalone",
  // Serwist injects a webpack config; dev uses Turbopack (SW disabled in dev).
  // An empty turbopack config silences Next 16's "webpack config, no turbopack
  // config" error without forcing dev onto webpack.
  turbopack: {},
};

export default withSerwist(nextConfig);
