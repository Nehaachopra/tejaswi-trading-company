import createNextIntlPlugin from "next-intl/plugin";

// the browser calls /trpc on this app's own address and Next forwards it to the API,
// so the session cookie the API sets belongs to this site and needs no cross-site setup
const apiUrl = process.env.API_URL ?? "http://localhost:8000";

/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      { source: "/trpc/:path*", destination: `${apiUrl}/trpc/:path*` },
      // uploaded photos, stored by the API for now
      { source: "/uploads/:path*", destination: `${apiUrl}/uploads/:path*` },
    ];
  },
};

// picks up ./i18n/request.ts
const withNextIntl = createNextIntlPlugin();

export default withNextIntl(nextConfig);
