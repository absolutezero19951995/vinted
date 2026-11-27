/** @type {import('next').NextConfig} */
const backend = process.env.BACKEND_URL ?? 'http://localhost:4000';

export default {
  // фронт и бэк на одном origin → cookie сессии работает без CORS
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${backend}/api/:path*` }];
  },
  images: { unoptimized: true },
};
