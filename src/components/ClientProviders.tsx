"use client";

import dynamic from "next/dynamic";
import { Footer } from "@/components/Footer";
import { usePathname } from "next/navigation";
import React from "react";
import { ShelbyClient } from "@shelby-protocol/sdk/browser";
import { ShelbyClientProvider } from "@shelby-protocol/react";
import { VaultKeyProvider } from "@/context/VaultKeyContext";
import { Network } from "@aptos-labs/ts-sdk";
import { Toaster } from "react-hot-toast";

const WalletProvider = dynamic((() => import("@/components/WalletProvider")) as any, { ssr: false }) as any;
const Navbar = dynamic((() => import("@/components/Navbar")) as any, { ssr: false }) as any;



let globalShelbyClient: ShelbyClient | null = null;

export function ClientProviders({ children }: { children: React.ReactNode }) {
    const shelbyClient = React.useMemo(() => {
        if (typeof window === "undefined") return null;
        if (globalShelbyClient) return globalShelbyClient;

        const rawKey = process.env.NEXT_PUBLIC_SHELBY_API_KEY || "aptoslabs_8nf7TvDNviM_BvorzGpZdTDDZPsPpPorTcctVeD9F45Fu";
        const apiKey = rawKey.trim();

        console.log("[Shelby] Initializing client. Key length:", apiKey.length, "Starts with aptoslabs:", apiKey.startsWith("aptoslabs_"));

        globalShelbyClient = new ShelbyClient({
            network: Network.TESTNET,
            apiKey: apiKey,
            rpc: {
                baseUrl: "https://api.testnet.shelby.xyz/shelby",
                apiKey: apiKey,
            },
            aptos: {
                clientConfig: {
                    API_KEY: apiKey,
                }
            },
            indexer: {
                apiKey: apiKey
            }
        });

        return globalShelbyClient;
    }, []);

    const pathname = usePathname();
    const isVaultPage = pathname === '/dashboard' || pathname === '/vault';

    return (
        <WalletProvider>
            {shelbyClient && (
                <ShelbyClientProvider client={shelbyClient}>
                    <VaultKeyProvider>
                        <Toaster
                            position="bottom-right"
                            toastOptions={{
                                style: {
                                    background: '#1a0d12',
                                    color: '#fff',
                                    border: '1px solid rgba(232,58,118,0.3)',
                                    borderRadius: '12px',
                                    fontSize: '14px',
                                },
                                success: {
                                    iconTheme: { primary: '#10b981', secondary: '#1a0d12' },
                                },
                                error: {
                                    iconTheme: { primary: '#ef4444', secondary: '#1a0d12' },
                                },
                            }}
                        />
                        <Navbar />
                        <main className="flex-grow">
                            {children}
                        </main>
                        {/* Hide footer on mobile for vault-related pages */}
                        <div className={isVaultPage ? "hidden md:block" : ""}>
                            <Footer />
                        </div>
                    </VaultKeyProvider>
                </ShelbyClientProvider>
            )}
            {!shelbyClient && (
                <main className="flex-grow">
                    {children}
                </main>
            )}
        </WalletProvider>
    );
}
