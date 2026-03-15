"use client";

import dynamic from "next/dynamic";

const Dashboard = dynamic(() => import("@/components/Dashboard").then(mod => mod.Dashboard), { ssr: false });

export default function DashboardPage() {
  return (
    <div className="pt-24 min-h-screen">
      <Dashboard />
    </div>
  );
}
