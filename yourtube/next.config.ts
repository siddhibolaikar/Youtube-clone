import type { NextConfig } from "next";

// Routes that render the PDF invoice (verify, webhook, resend) need the fonts
// in their serverless bundle.
const FIREBASE_PROJECT = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "yourtube-6351d";

const INVOICE_ROUTES = ["/api/payments/verify", "/api/payments/webhook", "/api/payments/resend-invoice"];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // pdfkit reads its AFM data from its own package directory at runtime,
  // which breaks if it's bundled.
  serverExternalPackages: ["pdfkit"],
  // Pin the test-only emulator flag at build time so its code is compiled
  // out of normal builds instead of just being inert.
  env: { NEXT_PUBLIC_USE_EMULATORS: process.env.NEXT_PUBLIC_USE_EMULATORS === "true" ? "true" : "false" },
  outputFileTracingIncludes: Object.fromEntries(INVOICE_ROUTES.map((r) => [r, ["./assets/fonts/**"]])),
  // signInWithRedirect breaks on non-firebaseapp.com domains in Chrome,
  // Safari and Firefox (third-party storage partitioning). Serving the auth
  // handler from our own domain fixes it; in production set
  // NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN to this app's domain.
  async rewrites() {
    return [
      { source: "/__/auth/:path*", destination: `https://${FIREBASE_PROJECT}.firebaseapp.com/__/auth/:path*` },
    ];
  },
};

export default nextConfig;
