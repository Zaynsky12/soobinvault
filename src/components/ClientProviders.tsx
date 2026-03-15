"use client";

import dynamic from "next/dynamic";
import { Footer } from "@/components/Footer";
import React from "react";
import { ShelbyClient } from "@shelby-protocol/sdk/browser";
import { ShelbyClientProvider } from "@shelby-protocol/react";
import { Network } from "@aptos-labs/ts-sdk";
import { Toaster } from "react-hot-toast";

const WalletProvider = dynamic((() => import("@/components/WalletProvider")) as any, { ssr: false }) as any;
const Navbar = dynamic((() => import("@/components/Navbar")) as any, { ssr: false }) as any;



export function ClientProviders({ children }: { children: React.ReactNode }) {
    const shelbyClient = React.useMemo(() => {
        // Next.js client-side env variable injection might sometimes fail or include whitespace
        const rawKey = process.env.NEXT_PUBLIC_SHELBY_API_KEY || "aptoslabs_hgdBXnSK14t_6GHbXm2irnCgggVW6KNMWogb1qcygNFwS";
        const apiKey = rawKey.trim();
        
        console.log("[Shelby] Initializing client. Key length:", apiKey.length, "Starts with aptoslabs:", apiKey.startsWith("aptoslabs_"));
        
        return new ShelbyClient({
            network: Network.TESTNET,
            apiKey: apiKey,
            aptos: {
                clientConfig: {
                    API_KEY: apiKey,
                }
            },
            indexer: {
                apiKey: apiKey
            }
        });
    }, [process.env.NEXT_PUBLIC_SHELBY_API_KEY, process.env.NEXT_PUBLIC_APTOS_API_KEY]);

    return (
        <WalletProvider>
            <ShelbyClientProvider client={shelbyClient}>
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
                <Footer />
            </ShelbyClientProvider>
        </WalletProvider>
    );
}
