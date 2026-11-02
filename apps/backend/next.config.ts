import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Internal packages are consumed as TypeScript source.
  transpilePackages: [
    '@splitr/calculation-engine',
    '@splitr/shared-types',
    '@splitr/receipt-parser',
    '@splitr/design-tokens',
  ],
};

export default nextConfig;
