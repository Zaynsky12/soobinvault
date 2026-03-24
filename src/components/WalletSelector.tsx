"use client";

import React, { useEffect, useRef, useState } from 'react';
import { useWallet } from "@aptos-labs/wallet-adapter-react";
import { AdapterWallet } from "@aptos-labs/wallet-adapter-core";
import { X, ChevronRight, Wallet as WalletIcon, ExternalLink } from 'lucide-react';
import gsap from 'gsap';

interface WalletSelectorProps {
    isOpen: boolean;
    onClose: () => void;
}

export function WalletSelector({ isOpen, onClose }: WalletSelectorProps): React.ReactNode {
    const modalRef = useRef<HTMLDivElement>(null);
    const overlayRef = useRef<HTMLDivElement>(null);
    const { wallets, connect } = useWallet();

    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
            const ctx = gsap.context(() => {
                gsap.fromTo(overlayRef.current, 
                    { opacity: 0 }, 
                    { opacity: 1, duration: 0.3, ease: 'power2.out' }
                );
                gsap.fromTo(modalRef.current, 
                    { scale: 0.95, opacity: 0, y: 20 }, 
                    { scale: 1, opacity: 1, y: 0, duration: 0.4, ease: 'back.out(1.7)', delay: 0.1 }
                );
            });
            return () => {
                ctx.revert();
                document.body.style.overflow = 'unset';
            };
        }
    }, [isOpen]);

    const handleClose = () => {
        gsap.to(modalRef.current, { scale: 0.95, opacity: 0, y: 20, duration: 0.2, ease: 'power2.in' });
        gsap.to(overlayRef.current, { opacity: 0, duration: 0.2, ease: 'power2.in', onComplete: onClose });
    };

    const onWalletClick = (walletName: any) => {
        connect(walletName);
        handleClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            {/* Overlay */}
            <div 
                ref={overlayRef}
                className="absolute inset-0 bg-black/60 backdrop-blur-md"
                onClick={handleClose}
            />

            {/* Modal - Compact Version */}
            <div 
                ref={modalRef}
                className="relative w-full max-w-sm mx-auto bg-[#0B1121]/90 backdrop-blur-2xl border border-white/10 rounded-[2rem] shadow-[0_24px_80px_rgba(0,0,0,0.6)] overflow-hidden"
            >
                {/* Header - Compact */}
                <div className="p-6 pb-3 flex items-center justify-between border-b border-white/5">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-color-primary to-color-accent flex items-center justify-center shadow-[0_0_15px_rgba(232,58,118,0.3)]">
                            <WalletIcon className="text-white" size={16} />
                        </div>
                        <div>
                            <h2 className="text-lg font-heading font-bold text-white tracking-tight">Connect Wallet</h2>
                            <p className="text-[10px] text-color-support/60 font-medium">Select your preferred way to connect</p>
                        </div>
                    </div>
                    <button 
                        onClick={handleClose}
                        className="p-1 px-2.5 rounded-full hover:bg-white/5 text-color-support/60 hover:text-white transition-colors"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Wallet List - Compact */}
                <div className="p-4 max-h-[55vh] overflow-y-auto custom-scrollbar">
                    <div className="space-y-2">
                        {wallets?.map((wallet: AdapterWallet) => (
                            <button
                                key={wallet.name}
                                onClick={() => onWalletClick(wallet.name)}
                                className="w-full group relative flex items-center justify-between p-3.5 rounded-[1.25rem] bg-white/[0.03] border border-white/5 hover:bg-white/[0.08] hover:border-white/20 transition-all duration-300 active:scale-[0.98]"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="relative w-10 h-10 rounded-xl bg-white/5 p-2 flex items-center justify-center overflow-hidden shrink-0">
                                        <img 
                                            src={wallet.icon} 
                                            alt={wallet.name} 
                                            className="w-full h-full object-contain"
                                        />
                                        <div className="absolute inset-0 bg-gradient-to-tr from-color-primary/10 to-color-accent/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                                    </div>
                                    <div className="text-left">
                                        <h3 className="text-white font-bold tracking-tight text-sm">{wallet.name}</h3>
                                        {(wallet.name === 'Aptos Connect' || wallet.name === 'Continue with Google' || wallet.name === 'Continue with Apple') && (
                                            <span className="text-[8px] uppercase tracking-[0.15em] text-color-accent font-bold">Social Login Enabled</span>
                                        )}
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="w-7 h-7 rounded-full bg-white/5 flex items-center justify-center group-hover:bg-color-primary group-hover:text-white transition-all duration-300">
                                        <ChevronRight size={14} className="transform group-hover:translate-x-0.5 transition-transform" />
                                    </div>
                                </div>
                            </button>
                        ))}

                        {(!wallets || wallets.length === 0) && (
                            <div className="text-center py-6">
                                <p className="text-color-support/60 text-xs mb-3">No wallets detected</p>
                                <a 
                                    href="https://aptos.dev/guides/install-petra-wallet" 
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-2 text-color-primary hover:text-color-accent text-xs font-bold transition-colors"
                                >
                                    Get Petra Wallet <ExternalLink size={12} />
                                </a>
                            </div>
                        )}
                    </div>
                </div>

                <div className="p-5 pt-3 border-t border-white/5 bg-white/[0.02]">
                    <p className="text-center text-[9px] text-color-support/40 leading-relaxed font-medium">
                        Secure decentralized connection encrypted via Zero-Knowledge.
                    </p>
                </div>
            </div>
        </div>
    );
}
