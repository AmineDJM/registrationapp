import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keeps the source workbook next to the server bundle when the app is deployed standalone.
  outputFileTracingIncludes: {
    "/": ["./data/nomenclature.xlsx"],
    "/api/nomenclature/**": ["./data/nomenclature.xlsx"],
  },
};

export default nextConfig;
