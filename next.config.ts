import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: "/login", destination: "/entrar", permanent: false },
      { source: "/portfolio", destination: "/carteira", permanent: false },
      { source: "/planning", destination: "/planejamento", permanent: false },
      { source: "/strategy", destination: "/estrategia", permanent: false },
      { source: "/learn", destination: "/aprender", permanent: false },
      { source: "/analyses", destination: "/analises", permanent: false },
      {
        source: "/analyses/screener",
        destination: "/analises/filtros",
        permanent: false,
      },
      { source: "/settings", destination: "/configuracoes", permanent: false },
      {
        source: "/admin/users",
        destination: "/admin/usuarios",
        permanent: false,
      },
      {
        source: "/invite/:token",
        destination: "/convite/:token",
        permanent: false,
      },
      {
        source: "/reset-password/:token",
        destination: "/redefinir-senha/:token",
        permanent: false,
      },
    ];
  },
  async rewrites() {
    return [
      { source: "/entrar", destination: "/login" },
      { source: "/carteira", destination: "/portfolio" },
      { source: "/planejamento", destination: "/planning" },
      { source: "/estrategia", destination: "/strategy" },
      { source: "/aprender", destination: "/learn" },
      { source: "/analises", destination: "/analyses" },
      { source: "/analises/filtros", destination: "/analyses/screener" },
      { source: "/configuracoes", destination: "/settings" },
      { source: "/assinatura", destination: "/subscription" },
      { source: "/admin/usuarios", destination: "/admin/users" },
      { source: "/convite/:token", destination: "/invite/:token" },
      {
        source: "/redefinir-senha/:token",
        destination: "/reset-password/:token",
      },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "icons.brapi.dev",
        port: "",
        pathname: "/icons/*.svg",
        search: "",
      },
    ],
  },
};

export default nextConfig;
