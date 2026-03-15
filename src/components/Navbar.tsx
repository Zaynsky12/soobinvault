"use client";
import Image from 'next/image';
import React, { useEffect, useState } from 'react';
import { useWallet } from "@aptos-labs/wallet-adapter-react";
import { Shield, Menu, X } from 'lucide-react';
import gsap from 'gsap';
import Link from 'next/link';
import { MagneticButton } from './ui/MagneticButton';
import { WalletSelector } from './WalletSelector';

export default function Navbar(): React.ReactNode {
    const { disconnect, connected, account, isLoading } = useWallet();
    const [isScrolled, setIsScrolled] = useState(false);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [isSelectorOpen, setIsSelectorOpen] = useState(false);

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

    // Entrance animation
    useEffect(() => {
        gsap.fromTo('.nav-container',
            { y: -100, opacity: 0 },
            { y: 0, opacity: 1, duration: 1, ease: 'power3.out', delay: 0.2 }
        );
    }, []);

    const handleWalletClick = () => {
        if (connected) {
            disconnect();
        } else {
            setIsSelectorOpen(true);
        }
    };

    const navLinks = [
        { name: 'Home', href: '/' },
        { name: 'Vault', href: '/vault' },
        { name: 'Dashboard', href: '/dashboard' },
    ];

    return (
        <>
            <WalletSelector isOpen={isSelectorOpen} onClose={() => setIsSelectorOpen(false)} />
            <header className={`nav-container fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${isScrolled ? 'py-4' : 'py-6'}`}>
                <div className="container mx-auto px-6">
                    <div className={`flex items-center justify-between mx-auto max-w-6xl rounded-full transition-all duration-500 px-6 py-3 ${isScrolled
                        ? 'bg-[#0B1121]/70 backdrop-blur-xl border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.4)]'
                        : 'bg-transparent border border-transparent'
                        }`}>

                        {/* Logo */}
                        <Link href="/" className="flex items-center gap-3 cursor-pointer group">
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-color-primary to-color-accent flex items-center justify-center shadow-[0_0_20px_rgba(232,58,118,0.4)] group-hover:shadow-[0_0_30px_rgba(251,179,204,0.6)] transition-all duration-300">
                                <Image
                                    src="/logo.png"
                                    alt="ShelbyVault Logo"
                                    width={40}
                                    height={40}
                                    className="rounded-xl"
                                />
                            </div>
                            <span className="font-heading font-bold text-xl tracking-tight text-white">SoobinVault</span>
                        </Link>

                        {/* Desktop Links */}
                        <nav className="hidden md:flex items-center gap-8">
                            {navLinks.map((link) => (
                                <Link
                                    key={link.name}
                                    href={link.href}
                                    className="text-color-support/80 hover:text-white font-medium text-sm transition-colors duration-200 relative group"
                                >
                                    {link.name}
                                    <span className="absolute -bottom-1 left-0 w-0 h-[2px] bg-color-accent transition-all duration-300 group-hover:w-full rounded-full"></span>
                                </Link>
                            ))}
                        </nav>

                        {/* Wallet CTA & Mobile Toggle */}
                        <div className="flex items-center gap-4">
                            <div className="hidden md:block">
                                <MagneticButton
                                    className="bg-color-primary/10 border border-color-primary/30 text-color-primary hover:bg-color-primary hover:border-color-primary hover:text-[#1A0D12] text-sm px-6 py-2.5 shadow-[0_0_20px_rgba(251,179,204,0.15)] hover:shadow-[0_0_30px_rgba(251,179,204,0.4)]"
                                    onClick={handleWalletClick}
                                >
                                    {isLoading ? "Wait..." : connected && account ? `${account.address.toString().slice(0, 4)}...${account.address.toString().slice(-4)}` : "Connect Wallet"}
                                </MagneticButton>
                            </div>

                            {/* Mobile Menu Button */}
                            <button
                                className="md:hidden text-color-support hover:text-white p-2"
                                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                            >
                                {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
                            </button>
                        </div>
                    </div>

                    {/* Mobile Menu Dropdown */}
                    <div className={`md:hidden absolute top-full left-6 right-6 mt-2 rounded-[2rem] bg-[#0B1121]/95 backdrop-blur-2xl border border-white/10 overflow-hidden transition-all duration-300 origin-top shadow-2xl ${mobileMenuOpen ? 'scale-y-100 opacity-100' : 'scale-y-0 opacity-0'
                        }`}>
                        <div className="p-6 flex flex-col gap-6">
                            {navLinks.map((link) => (
                                <Link
                                    key={link.name}
                                    href={link.href}
                                    className="text-xl font-medium text-color-support hover:text-white"
                                    onClick={() => setMobileMenuOpen(false)}
                                >
                                    {link.name}
                                </Link>
                            ))}
                            <div className="pt-6 border-t border-white/10">
                                <button
                                    className="w-full bg-gradient-to-r from-color-primary to-color-accent text-white rounded-full py-4 font-bold shadow-[0_0_30px_rgba(232,58,118,0.3)]"
                                    onClick={() => {
                                        handleWalletClick();
                                        setMobileMenuOpen(false);
                                    }}
                                >
                                    {isLoading ? "Connecting..." : connected && account ? "Disconnect" : "Connect Wallet"}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </header>
        </>
    );
}
