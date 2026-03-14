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



const shelbyClient = new ShelbyClient({
    network: Network.TESTNET,
    apiKey: process.env.NEXT_PUBLIC_SHELBY_API_KEY,
    aptos: {
        clientConfig: {
            API_KEY: process.env.NEXT_PUBLIC_APTOS_API_KEY || process.env.NEXT_PUBLIC_SHELBY_API_KEY,
        }
    },
    indexer: {
        apiKey: process.env.NEXT_PUBLIC_SHELBY_API_KEY
    }
});

export function ClientProviders({ children }: { children: React.ReactNode }) {
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
                            iconTheme: { primary: '#E83A76', secondary: '#1a0d12' },
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
