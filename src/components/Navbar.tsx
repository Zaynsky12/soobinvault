"use client";
import Image from 'next/image';
import React, { useEffect, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { useWallet } from "@aptos-labs/wallet-adapter-react";
import { Shield, Menu, X, ExternalLink, ChevronDown, PlusCircle, Home, Vault, FileText, Store, User } from 'lucide-react';
import gsap from 'gsap';
import Link from 'next/link';
import { MagneticButton } from './ui/MagneticButton';
import { WalletSelector } from './WalletSelector';
import { useVaultKey } from '../context/VaultKeyContext';
import toast from 'react-hot-toast';

export default function Navbar(): React.ReactNode {
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const { disconnect, connected, account, isLoading } = useWallet();
    const { encryptionKey, keyFingerprint, lockVault, ensureKey } = useVaultKey();
    const [isScrolled, setIsScrolled] = useState(false);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [isSelectorOpen, setIsSelectorOpen] = useState(false);
    // Route Watcher: Close all modals/drawers when navigation occurs
    useEffect(() => {
        setMobileMenuOpen(false);
        setIsSelectorOpen(false);
    }, [pathname, searchParams]);

    useEffect(() => {
        const handleScroll = () => {
            if (window.scrollY > 50) {
                setIsScrolled(true);
            } else {
                setIsScrolled(false);
            }
        };

        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    // keyFingerprint is now managed by VaultKeyContext

    // Entrance animation
    useEffect(() => {
        gsap.fromTo('.nav-container',
            { y: -100, opacity: 0 },
            { y: 0, opacity: 1, duration: 1, ease: 'power3.out', delay: 0.2 }
        );
    }, []);

    const handleWalletClick = () => {
        if (connected) {
            lockVault();
            try {
                disconnect();
            } catch (e) {
                console.warn("Wallet already disconnected or encountered error:", e);
            }
        } else {
            setIsSelectorOpen(true);
        }
    };

    const navLinks = [
        { name: 'Home', href: '/', icon: Home },
        { name: 'Upload', href: '/upload', icon: PlusCircle },
        { name: 'Vault', href: '/vault', icon: FileText },
        { name: 'Account', href: '/account', icon: User },
    ];





    return (
        <>
            <WalletSelector isOpen={isSelectorOpen} onClose={() => setIsSelectorOpen(false)} />
            


            {/* Desktop Sidebar (Menu only) - High z-index to ensure clickability */}
            <div className="hidden md:flex fixed left-0 top-0 bottom-0 w-64 bg-[#0B1121]/40 backdrop-blur-3xl border-r border-white/5 flex-col z-[110] shadow-2xl pt-0 overflow-hidden">
                {/* Branding Section at the top of Sidebar */}
                <div className="p-8 pb-10 border-b border-white/5">
                    <Link href="/" className="flex items-center gap-4 cursor-pointer group">
                        <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-color-primary to-color-accent flex items-center justify-center shadow-[0_0_20px_rgba(232,58,118,0.3)] group-hover:shadow-[0_0_40px_rgba(232,58,118,0.5)] transition-all duration-500 border border-white/10">
                            <Image src="/logo.png" alt="Logo" width={40} height={40} className="rounded-xl w-full h-full p-1" />
                        </div>
                        <div className="flex flex-col">
                            <span className="font-bold text-xl tracking-tight text-white leading-tight">SoobinVault</span>
                            <span className="text-[9px] font-bold text-color-primary uppercase tracking-[0.3em] opacity-80 leading-none mt-1">Network</span>
                        </div>
                    </Link>
                </div>

                <nav className="flex-1 px-4 space-y-2 overflow-y-auto custom-scrollbar mt-6">
                    <p className="px-4 text-[10px] font-bold text-white/20 uppercase tracking-[0.2em] mb-4">Navigation</p>
                    <div className="space-y-1">
                        {navLinks.map((link) => {
                            const Icon = link.icon;
                            const isActive = pathname === link.href;
                            return (
                                <Link key={link.name} href={link.href} className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl transition-all duration-300 group ${isActive ? 'bg-color-primary/10 text-color-primary border border-color-primary/10' : 'text-white/40 hover:text-white hover:bg-white/5'}`}>
                                    <Icon size={20} className={isActive ? 'fill-current' : ''} />
                                    <span className="text-sm font-bold uppercase tracking-widest">{link.name}</span>
                                    {isActive && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-color-primary shadow-[0_0_10px_rgba(232,58,118,1)]" />}
                                </Link>
                            );
                        })}
                    </div>


                </nav>

                <div className="p-6 border-t border-white/5 bg-black/20 text-center">
                    <p className="text-[8px] text-white/10 font-bold uppercase tracking-[0.3em]">Zero-Knowledge Protected</p>
                </div>
            </div>

            {/* Desktop Top Header - Full Width (Covering Sidebar Area but at lower z-index than sidebar links if possible, or same) */}
            <header className={`hidden md:flex fixed top-0 left-0 right-0 z-[100] transition-all duration-500 border-b border-white/5 ${isScrolled ? 'bg-[#0B1121]/90 backdrop-blur-xl py-4' : 'bg-[#0B1121]/40 backdrop-blur-lg py-6'}`}>
                <div className="flex items-center justify-end w-full px-8">


                    {/* Right: Wallet Actions */}
                    <div className="flex items-center gap-4">
                        <MagneticButton
                            className="bg-color-primary/10 border border-color-primary/30 text-color-primary text-[10px] px-8 py-2.5 font-bold uppercase tracking-widest hover:bg-color-primary hover:text-white transition-all rounded-xl shadow-lg"
                            onClick={handleWalletClick}
                        >
                            {isLoading ? "..." : (connected && account) ? `${account.address.toString().slice(0, 4)}...${account.address.toString().slice(-4)}` : "Connect Wallet"}
                        </MagneticButton>
                    </div>
                </div>
            </header>

            {/* Mobile Header */}
            <header className="md:hidden nav-container fixed top-2 left-4 right-4 z-[50] transition-all duration-500">
                <div className={`flex items-center justify-between transition-all duration-500 px-4 py-2.5 rounded-full bg-[#0B1121]/80 backdrop-blur-xl border border-white/10 shadow-lg`}>
                    <Link href="/" className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-color-primary to-color-accent flex items-center justify-center">
                            <Image
                                src="/logo.png"
                                alt="Logo"
                                width={20}
                                height={20}
                            />
                        </div>
                        <span className="font-bold text-sm text-white">SoobinVault</span>
                    </Link>
                    <div className="flex items-center gap-2">

                        <MagneticButton
                            className="bg-color-primary/10 border border-color-primary/30 text-color-primary text-[9px] px-4 py-1.5 font-bold uppercase tracking-widest hover:bg-color-primary hover:text-white transition-all rounded-xl"
                            onClick={handleWalletClick}
                        >
                            {isLoading ? "..." : (connected && account) ? `${account.address.toString().slice(0, 4)}...` : "Connect"}
                        </MagneticButton>
                    </div>
                </div>
            </header>



            {/* Mobile Bottom Navigation - Top Layer */}
            <nav className="md:hidden fixed bottom-0 left-0 right-0 z-[120]">
                <div className="bg-[#0B1121]/95 backdrop-blur-3xl border-t border-white/10 px-2 py-1.5 flex items-center justify-around shadow-[0_-15px_35px_rgba(0,0,0,0.6)] relative">
                    {navLinks.map((link) => {
                        const Icon = link.icon;
                        const isActive = pathname === link.href;
                        return (
                            <Link 
                                key={link.name}
                                href={link.href}
                                className={`flex flex-col items-center gap-0.5 p-1 rounded-2xl transition-all duration-300 ${isActive ? 'text-color-primary' : 'text-white/40'}`}
                            >
                                <Icon size={20} className={isActive ? 'fill-current' : ''} />
                                <span className="text-[9px] font-bold uppercase tracking-widest">{link.name}</span>
                            </Link>
                        );
                    })}


                </div>
            </nav>
        </>
    );
}
