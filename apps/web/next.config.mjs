/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  async rewrites() {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'
    // /socket.io через Next НЕ проксируется: локально socket.io-client идёт на api:4000 напрямую
    // (NEXT_PUBLIC_WS_URL), на VPS — на тот же домен, где его перехватывает location /socket.io/ в nginx.
    return [
      {
        source: '/api/:path*',
        destination: `${apiUrl}/api/:path*`,
      },
    ]
  },
}

export default nextConfig
