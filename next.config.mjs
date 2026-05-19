import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Pin the workspace root because this repo lives under a parent folder that also has a lockfile.
  turbopack: {
    root: projectRoot
  }
};

export default nextConfig;
