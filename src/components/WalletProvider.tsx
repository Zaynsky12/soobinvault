"use client";

import { AptosWalletAdapterProvider } from "@aptos-labs/wallet-adapter-react";
import { PetraWallet } from "petra-plugin-wallet-adapter";
import React, { useMemo } from "react";
import { Network } from "@aptos-labs/ts-sdk";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const queryClient = new QueryClient();

export function WalletProvider({ children }: { children: React.ReactNode }) {
    const wallets = useMemo(() => [new PetraWallet()], []);

    return (
        <QueryClientProvider client={queryClient}>
            <AptosWalletAdapterProvider
                autoConnect={true}
                dappConfig={{
                    network: Network.TESTNET,
                    aptosApiKeys: { testnet: process.env.NEXT_PUBLIC_APTOS_API_KEY }
                }}
                onError={(error) => {
                    console.log("Custom error handling", error);
                }}
            >
                {children}
            </AptosWalletAdapterProvider>
        </QueryClientProvider>
    );
}
