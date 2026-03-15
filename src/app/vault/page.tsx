"use client";

import dynamic from "next/dynamic";

const VaultDropzone = dynamic(() => import("@/components/VaultDropzone").then(mod => mod.VaultDropzone), { ssr: false });

export default function VaultPage() {
  return (
    <div className="pt-24 min-h-screen">
      <VaultDropzone />
    </div>
  );
}
