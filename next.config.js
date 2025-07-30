/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: '/api/search',
        destination: 'http://localhost:5000/api/search',
      },
    ];
  },
};

module.exports = nextConfig;
