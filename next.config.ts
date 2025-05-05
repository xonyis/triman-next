import type { NextConfig } from "next";

const nextConfig: NextConfig = {
    eslint: {
        ignoreDuringBuilds: true,
    },
    typescript: {
        ignoreBuildErrors: true,
    },
    images: {
        formats: ["image/avif", "image/webp"],
        unoptimized: true, // Désactive l'optimisation pour les GIFs
    },
};

export default nextConfig;
