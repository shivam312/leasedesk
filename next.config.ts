import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // A bank statement import sends the file's rows to a server action; a
  // year of a busy account's rows is about 2 MB (D30).
  experimental: { serverActions: { bodySizeLimit: "4mb" } },
  // The invoice PDF reads its font from disk (src/lib/invoices/pdf.tsx).
  outputFileTracingIncludes: { "/**": ["./assets/fonts/*.ttf"] },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async redirects() {
    return [{ source: "/", destination: "/today", permanent: false }];
  },
};

export default nextConfig;
