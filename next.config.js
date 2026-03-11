/** @type {import('next').NextConfig} */
module.exports = {
  experimental: {
    serverComponentsExternalPackages: ['ws', 'bufferutil', 'utf-8-validate', 'ffmpeg-static', 'fluent-ffmpeg', 'sharp'],
  },
}
