import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  transpilePackages: ['read-excel-file'],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'smheyvllxkhjfrapuufb.supabase.co',
      },
    ],
  },
}

export default nextConfig