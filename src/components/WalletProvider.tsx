"use client";

import { AptosWalletAdapterProvider } from "@aptos-labs/wallet-adapter-react";
import React, { useMemo } from "react";
import { Network } from "@aptos-labs/ts-sdk";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const queryClient = new QueryClient();

export default function WalletProvider({ children }: { children: React.ReactNode }): React.ReactNode {
    const [mounted, setMounted] = React.useState(false);

    React.useEffect(() => {
        setMounted(true);
    }, []);

    const wallets = useMemo(() => [], []);

    if (!mounted) {
        return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    }

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
