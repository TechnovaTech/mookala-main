/** @type {import('next').NextConfig} */
const nextConfig = {
  // CORS headers for /api are set in middleware.ts, in one place, so that the
  // preflight response and the real response always agree.
}

module.exports = nextConfig
