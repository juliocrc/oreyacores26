import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

process.env.SENTRY_SUPPRESS_GLOBAL_ERROR_HANDLER_FILE_WARNING ??= "1";
process.env.PRISMA_DISABLE_WARNINGS ??= "1";

const nextConfig: NextConfig = {
  reactCompiler: false,
  output: "standalone",
  // Sem isto o Next sobe para procurar a raiz do workspace e, como a pasta-pai
  // (E:\Acores) tem package-lock.json, o standalone sai aninhado em
  // .next/standalone/OREYACORESDELUXE/ e o launcher nao o encontra.
  outputFileTracingRoot: __dirname,
  compress: true,
  turbopack: {},
  serverExternalPackages: ["pdf-parse", "pdfjs-dist", "pdf-lib", "@prisma/client"],
  outputFileTracingExcludes: {
    "*": [
      "./documentacao/**/*",
      "./legislacao/**/*",
      "./boletins/**/*",
      "./CERTIFICADOS 2025/**/*",
      "./auditorias_documentos/**/*",
    ],
  },
  outputFileTracingIncludes: {
    "/api/**/*": ["./templates/**/*"],
  },
  async redirects() {
    return [
      {
        source: '/relatorios',
        destination: '/obras',
        permanent: true,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
      {
        source: "/icons/(.*)",
        headers: [
          { key: "Cache-Control", value: "public, max-age=86400, must-revalidate" },
        ],
      },
    ];
  },
  typescript: { ignoreBuildErrors: true },

    experimental: {
    serverActions: {
      bodySizeLimit: '50mb',
    },
  },

  webpack: (config, { isServer }) => {
    // Fix pdf-lib module resolution
    config.resolve.alias = {
      ...config.resolve.alias,
      'pdf-lib': require.resolve('pdf-lib'),
    };

    // Fix for pdf-lib ESM modules
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        crypto: false,
      };
    }

    return config;
  },
};

const hasSentryReleaseConfig = Boolean(
  process.env.SENTRY_AUTH_TOKEN && process.env.SENTRY_ORG && process.env.SENTRY_PROJECT
);

const configWithSentry = withSentryConfig(
  nextConfig,
  {
    silent: true,
    org: process.env.SENTRY_ORG,
    project: process.env.SENTRY_PROJECT,
    authToken: process.env.SENTRY_AUTH_TOKEN,
    dryRun: !hasSentryReleaseConfig,
  },
  {
    hideSourceMaps: true,
    automaticVercelMonitors: true,
    webpack: {
      treeshake: {
        removeDebugLogging: true,
      },
    },
  }
);

if (configWithSentry && typeof configWithSentry === 'object') {
  delete (configWithSentry as any).eslint;
}

export default hasSentryReleaseConfig ? configWithSentry : nextConfig;
