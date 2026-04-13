/** @type {import('next').NextConfig} */
module.exports = {
  typescript: { ignoreBuildErrors: true },
  experimental: {
    serverComponentsExternalPackages: ['ws', 'bufferutil', 'utf-8-validate', 'fluent-ffmpeg', 'sharp'],
    outputFileTracingIncludes: {
      '/api/asc3/render-final-mix': ['./node_modules/ffmpeg-static/**/*'],
      '/api/landing/render-mix': ['./node_modules/ffmpeg-static/**/*'],
    },
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = [...(config.externals || []), 'sharp']
    }
    return config
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Cache-Control', value: 'no-store, no-cache, must-revalidate, proxy-revalidate' },
          { key: 'Pragma', value: 'no-cache' },
          { key: 'Expires', value: '0' },
          { key: 'Surrogate-Control', value: 'no-store' },
        ],
      },
    ]
  },
}
