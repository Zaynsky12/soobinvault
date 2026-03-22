"use client";
import Image from 'next/image';
import React, { useEffect, useState } from 'react';
import { useWallet } from "@aptos-labs/wallet-adapter-react";
import { Shield, Menu, X, Settings, LogOut, Key, Globe, ExternalLink, ChevronDown, RefreshCw } from 'lucide-react';
import gsap from 'gsap';
import Link from 'next/link';
import { MagneticButton } from './ui/MagneticButton';
import { WalletSelector } from './WalletSelector';
import { useVaultKey } from '../context/VaultKeyContext';
import toast from 'react-hot-toast';

export default function Navbar(): React.ReactNode {
    const { disconnect, connected, account, isLoading } = useWallet();
    const { encryptionKey, lockVault, ensureKey, importKeyManual, requestPin } = useVaultKey();
    const [isScrolled, setIsScrolled] = useState(false);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [isSelectorOpen, setIsSelectorOpen] = useState(false);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [keyFingerprint, setKeyFingerprint] = useState<string | null>(null);
    const [showBackupWarning, setShowBackupWarning] = useState(false);
    const [isKeyBackedUp, setIsKeyBackedUp] = useState(true);

    useEffect(() => {
        if (typeof window !== 'undefined' && account) {
            setIsKeyBackedUp(!!localStorage.getItem(`soobin_key_backed_up_${account.address}`));
        }
    }, [account, isSettingsOpen, showBackupWarning]);

    useEffect(() => {
        const handleRequireBackup = () => {
            setShowBackupWarning(true);
        };
        const handleOpenSettings = () => {
            setIsSettingsOpen(true);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        };
        window.addEventListener('vault:requireBackup', handleRequireBackup);
        window.addEventListener('vault:openSettings', handleOpenSettings);
        return () => {
            window.removeEventListener('vault:requireBackup', handleRequireBackup);
            window.removeEventListener('vault:openSettings', handleOpenSettings);
        };
    }, []);

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

    // Generate fingerprint when key changes
    useEffect(() => {
        const genFingerprint = async () => {
            if (encryptionKey) {
                try {
                    const keyBuffer = await window.crypto.subtle.exportKey('raw', encryptionKey);
                    const keyHash = await window.crypto.subtle.digest('SHA-256', keyBuffer);
                    const fingerprint = Array.from(new Uint8Array(keyHash)).slice(0, 4).map(b => b.toString(16).padStart(2, '0')).join('');
                    setKeyFingerprint(fingerprint);
                } catch (e) {
                    console.error("Fingerprint failed");
                }
            } else {
                setKeyFingerprint(null);
            }
        };
        genFingerprint();
    }, [encryptionKey]);

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
            lockVault();
        } else {
            setIsSelectorOpen(true);
        }
    };

    const navLinks = [
        { name: 'Home', href: '/' },
        { name: 'Vault', href: '/vault' },
        { name: 'Dashboard', href: '/dashboard' },
    ];

    const renderSettingsContent = () => (
        <div className="w-full h-full">
            <div className="px-4 py-4 border-b border-white/5 bg-white/5">
                <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest mb-1 text-center">Security Protocol</p>
                <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-white/80">Vault Status</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${encryptionKey ? 'bg-green-500/20 text-green-400' : 'bg-orange-500/20 text-orange-400'}`}>
                        {encryptionKey ? 'UNLOCKED' : 'LOCKED'}
                    </span>
                </div>
                {keyFingerprint && (
                    <div className="flex items-center justify-between mt-2">
                        <span className="text-xs font-medium text-white/80">Session Hash</span>
                        <code className="text-[10px] text-color-primary font-mono bg-color-primary/10 px-1.5 py-0.5 rounded uppercase tracking-wider">{keyFingerprint}</code>
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 gap-1 p-2">
                {!encryptionKey && (
                    <button 
                        onClick={() => {
                            ensureKey(false);
                            setIsSettingsOpen(false);
                        }}
                        className="w-full px-4 py-3.5 flex items-center gap-3 text-sm text-white/70 hover:text-white hover:bg-white/5 active:bg-white/10 rounded-xl transition-all"
                    >
                        <Key size={18} />
                        Unlock Secure Vault
                    </button>
                )}
                
                {encryptionKey && (
                    <button 
                        onClick={async () => {
                            const keyBuffer = await window.crypto.subtle.exportKey('raw', encryptionKey);
                            const base64 = btoa(String.fromCharCode(...new Uint8Array(keyBuffer)));
                            await navigator.clipboard.writeText(base64);
                            if (account) {
                                localStorage.setItem(`soobin_key_backed_up_${account.address}`, 'true');
                                setIsKeyBackedUp(true);
                            }
                            toast.success("Master Key copied and secured!");
                            setIsSettingsOpen(false);
                        }}
                        className={`w-full px-4 py-3.5 flex items-center gap-3 text-sm rounded-xl transition-all ${
                            !isKeyBackedUp 
                                ? 'text-white bg-color-primary/20 border border-color-primary/40 shadow-[0_0_15px_rgba(232,58,118,0.2)] animate-pulse hover:bg-color-primary/30' 
                                : 'text-color-primary hover:bg-white/5 active:bg-white/10'
                        }`}
                    >
                        <Shield size={18} />
                        Backup Master Key
                    </button>
                )}

                <button 
                    onClick={() => {
                        window.dispatchEvent(new CustomEvent('vault:refresh'));
                        setIsSettingsOpen(false);
                        toast.success("Synchronizing with decentralized network...");
                    }}
                    className="w-full px-4 py-3.5 flex items-center gap-3 text-sm text-white/70 hover:text-white hover:bg-white/5 active:bg-white/10 rounded-xl transition-all"
                >
                    <RefreshCw size={18} />
                    Sync Assets
                </button>

                <button 
                    onClick={async () => {
                        setIsSettingsOpen(false);
                        const key = await requestPin("Paste your Master Key here to restore your session:");
                        if (key) {
                            // Wait for the exit animation of the first modal to complete
                            setTimeout(() => {
                                importKeyManual(key);
                            }, 500);
                        }
                    }}
                    className="w-full px-4 py-3.5 flex items-center gap-3 text-sm text-white/50 hover:text-white hover:bg-white/5 active:bg-white/10 rounded-xl transition-all"
                >
                    <Key size={18} />
                    Import Master Key
                </button>

                <a 
                    href={`https://explorer.aptoslabs.com/account/${account?.address}?network=mainnet`}
                    target="_blank"
                    rel="noreferrer"
                    className="w-full px-4 py-3.5 flex items-center gap-3 text-sm text-white/50 hover:text-white hover:bg-white/5 active:bg-white/10 rounded-xl transition-all"
                >
                    <Globe size={18} />
                    View on Explorer
                </a>
            </div>

            <div className="border-t border-white/5 p-2 mt-1">
                {encryptionKey && (
                    <button 
                        onClick={() => {
                            lockVault();
                            setIsSettingsOpen(false);
                        }}
                        className="w-full px-4 py-3.5 flex items-center gap-3 text-sm text-red-500/60 hover:text-red-500 hover:bg-red-500/5 rounded-xl transition-all"
                    >
                        <LogOut size={18} />
                        Lock Session
                    </button>
                )}
                <button 
                    onClick={() => {
                        disconnect();
                        setIsSettingsOpen(false);
                        lockVault();
                    }}
                    className="w-full px-4 py-3.5 flex items-center gap-3 text-sm text-white/30 hover:text-red-400 hover:bg-red-500/5 rounded-xl transition-all"
                >
                    <LogOut size={18} />
                    Disconnect Wallet
                </button>
            </div>
        </div>
    );

    return (
        <>
            <WalletSelector isOpen={isSelectorOpen} onClose={() => setIsSelectorOpen(false)} />
            
            {/* Master Key Backup Warning Overlay */}
            {showBackupWarning && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md px-4 animate-in fade-in duration-500">
                    <div className="bg-gradient-to-b from-[#1a0b14] to-[#0A0A0A] border border-color-primary/30 p-8 rounded-3xl max-w-md w-full shadow-[0_0_50px_rgba(232,58,118,0.2)] text-center relative overflow-hidden">
                        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-color-primary via-color-accent to-color-primary animate-pulse" />
                        
                        <div className="w-20 h-20 bg-color-primary/10 rounded-full flex items-center justify-center mx-auto mb-6 border border-color-primary/20 shadow-[0_0_30px_rgba(232,58,118,0.3)]">
                            <Shield size={40} className="text-color-primary" />
                        </div>
                        
                        <h2 className="text-2xl font-bold text-white mb-4">Secure Your Vault</h2>
                        <p className="text-color-support/80 text-sm mb-8 leading-relaxed">
                            Your decentralized Master Key has been generated. <strong className="text-white">If you lose this key, you will permanently lose access to all your files.</strong> Please copy and store it in a safe place immediately.
                        </p>
                        
                        <button 
                            onClick={() => {
                                setShowBackupWarning(false);
                                setIsSettingsOpen(true);
                            }}
                            className="w-full py-4 rounded-xl bg-gradient-to-r from-color-primary to-color-accent text-white font-bold uppercase tracking-widest text-sm hover:scale-[1.02] transition-all shadow-[0_0_20px_rgba(232,58,118,0.4)]"
                        >
                            Open Settings to Backup
                        </button>
                    </div>
                </div>
            )}

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

                        <div className="flex items-center gap-4">
                            {/* Desktop Actions */}
                            <div className="hidden md:flex items-center gap-3">
                                {connected && (
                                    <div className="relative">
                                        <button
                                            onClick={() => setIsSettingsOpen(!isSettingsOpen)}
                                            className={`p-2.5 rounded-xl border transition-all duration-300 ${isSettingsOpen ? 'bg-white/10 border-white/20 text-white' : 'bg-white/5 border-white/5 text-white/40 hover:text-white hover:border-white/10'}`}
                                        >
                                            <Settings size={20} className={isSettingsOpen ? 'rotate-90' : ''} />
                                        </button>

                                        {/* Settings Dropdown Desktop */}
                                        {isSettingsOpen && (
                                            <div className="absolute right-0 mt-4 w-72 bg-[#0B1121]/95 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-300">
                                                {renderSettingsContent()}
                                            </div>
                                        )}
                                    </div>
                                )}

                                <MagneticButton
                                    className="bg-color-primary/10 border border-color-primary/30 text-color-primary hover:bg-color-primary hover:border-color-primary hover:text-[#1A0D12] text-sm px-6 py-2.5 shadow-[0_0_20px_rgba(251,179,204,0.15)] hover:shadow-[0_0_30px_rgba(251,179,204,0.4)]"
                                    onClick={handleWalletClick}
                                >
                                    {isLoading ? "Wait..." : (connected && account) ? `${account.address.toString().slice(0, 4)}...${account.address.toString().slice(-4)}` : "Connect Wallet"}
                                </MagneticButton>
                            </div>

                            {/* Mobile Actions */}
                            <div className="flex md:hidden items-center gap-2">
                                {connected && (
                                    <div className="relative">
                                        <button
                                            onClick={() => setIsSettingsOpen(!isSettingsOpen)}
                                            className={`p-2 rounded-xl border transition-all duration-300 ${isSettingsOpen ? 'bg-white/10 border-white/20 text-white shadow-[0_0_15px_rgba(255,255,255,0.1)]' : 'bg-white/5 border-transparent text-white/40'}`}
                                        >
                                            <Settings size={20} className={isSettingsOpen ? 'rotate-90' : ''} />
                                        </button>
                                        
                                        {/* Settings Dropdown Mobile */}
                                        {isSettingsOpen && (
                                            <div className="fixed inset-x-6 top-[85px] max-h-[calc(100vh-120px)] overflow-y-auto bg-[#0B1121]/95 backdrop-blur-3xl border border-white/10 rounded-2xl shadow-2xl z-[60] animate-in fade-in zoom-in-95 duration-300 transform-gpu scrollbar-hide">
                                                {renderSettingsContent()}
                                            </div>
                                        )}
                                    </div>
                                )}

                                <button
                                    className="text-color-support hover:text-white p-2 bg-white/5 rounded-xl border border-transparent"
                                    onClick={() => {
                                        setMobileMenuOpen(!mobileMenuOpen);
                                        setIsSettingsOpen(false);
                                    }}
                                >
                                    {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
                                </button>
                            </div>
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
                            <div className="pt-6 border-t border-white/10 flex flex-col gap-4">
                                <button
                                    className="w-full bg-gradient-to-r from-color-primary to-color-accent text-white rounded-full py-4 font-bold shadow-[0_0_30px_rgba(232,58,118,0.3)]"
                                    onClick={() => {
                                        handleWalletClick();
                                        setMobileMenuOpen(false);
                                    }}
                                >
                                    {isLoading ? "Connecting..." : (connected && account) ? "Disconnect Wallet" : "Connect Wallet"}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </header>
        </>
    );
}
