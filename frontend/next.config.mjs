/** @type {import('next').NextConfig} */
const nextConfig = {
  // Páginas estáticas (pasta/index.html) servidas pelo S3 + CloudFront; a API fica em /api.
  output: 'export',
  trailingSlash: true,
  images: { unoptimized: true },
  reactStrictMode: true,
  poweredByHeader: false,
};
export default nextConfig;
