"use client";
import Image from 'next/image';
import React, { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useWallet } from "@aptos-labs/wallet-adapter-react";
import { Shield, Menu, X, Settings, LogOut, Key, Globe, ExternalLink, ChevronDown, RefreshCw, PlusCircle, Home, Vault, FileText } from 'lucide-react';
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
            lockVault();
            disconnect();
        } else {
            setIsSelectorOpen(true);
        }
    };

    const navLinks = [
        { name: 'Home', href: '/', icon: Home },
        { name: 'Upload', href: '/vault', icon: PlusCircle },
        { name: 'Vault', href: '/dashboard', icon: FileText },
    ];

    const pathname = usePathname();

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
                        className={`w-full px-4 py-2.5 flex items-center gap-3 text-sm rounded-xl transition-all ${
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
                    className="w-full px-4 py-2.5 flex items-center gap-3 text-sm text-white/70 hover:text-white hover:bg-white/5 active:bg-white/10 rounded-xl transition-all"
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
                    className="w-full px-4 py-2.5 flex items-center gap-3 text-sm text-white/50 hover:text-white hover:bg-white/5 active:bg-white/10 rounded-xl transition-all"
                >
                    <Key size={18} />
                    Import Master Key
                </button>

                <button 
                    onClick={async () => {
                        if (!confirm("⚠️ Warning: Creating a new vault will replace your current local session. If you don't have a backup of your Master Key, you will lose access to existing files. Proceed?")) return;
                        
                        const addr = account?.address.toString();
                        console.log(`[Vault] Initiating Create New Vault for ${addr}`);
                        localStorage.removeItem(`soobin_vault_key_${addr}`);
                        localStorage.removeItem(`soobin_key_backed_up_${addr}`);
                        setIsSettingsOpen(false);
                        await ensureKey(true);
                        console.log(`[Vault] Create New Vault completed for ${addr}`);
                    }}
                    className="w-full px-4 py-2.5 flex items-center gap-3 text-sm text-white/50 hover:text-white hover:bg-white/5 active:bg-white/10 rounded-xl transition-all"
                >
                    <PlusCircle size={18} />
                    Create New Vault
                </button>

                <a 
                    href={`https://explorer.aptoslabs.com/account/${account?.address}?network=mainnet`}
                    target="_blank"
                    rel="noreferrer"
                    className="w-full px-4 py-2.5 flex items-center gap-3 text-sm text-white/50 hover:text-white hover:bg-white/5 active:bg-white/10 rounded-xl transition-all"
                >
                    <Globe size={18} />
                    View on Explorer
                </a>
            </div>

            {(connected && account) && (
                <div className="border-t border-white/5 p-2 mt-1">
                    <button 
                        onClick={() => {
                            lockVault();
                            disconnect();
                            setIsSettingsOpen(false);
                        }}
                        className="w-full px-4 py-2.5 flex items-center gap-3 text-sm text-white/30 hover:text-red-400 hover:bg-red-500/5 rounded-xl transition-all"
                    >
                        <LogOut size={18} />
                        Disconnect Wallet
                    </button>
                </div>
            )}
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
            )}            <header className={`nav-container fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${isScrolled ? 'pt-3 md:py-4' : 'pt-3 md:py-6'}`}>
                <div className="container mx-auto md:px-6">
                    <div className={`flex items-center justify-between mx-4 md:mx-auto max-w-4xl transition-all duration-500 px-4 md:px-6 py-2.5 md:py-3 rounded-full ${isScrolled
                        ? 'bg-[#0B1121]/80 backdrop-blur-xl border border-white/10 md:shadow-[0_8px_32px_rgba(0,0,0,0.4)]'
                        : 'bg-[#0B1121]/40 backdrop-blur-lg border border-white/5 shadow-lg'
                        }`}>

                            {/* Desktop Sidebar - Left Side Fixed (Lighthouse Style) */}
                            <div className="hidden md:flex fixed left-0 top-0 bottom-0 w-64 bg-[#0B1121]/40 backdrop-blur-3xl border-r border-white/5 flex-col z-[60] shadow-[4px_0_24px_rgba(0,0,0,0.3)]">
                                {/* Sidebar Header */}
                                <div className="p-8 pb-10">
                                    <Link href="/" className="flex items-center gap-3 cursor-pointer group">
                                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-color-primary to-color-accent flex items-center justify-center shadow-[0_0_20px_rgba(232,58,118,0.4)] group-hover:shadow-[0_0_35px_rgba(232,58,118,0.6)] transition-all duration-500">
                                            <Image
                                                src="/logo.png"
                                                alt="ShelbyVault Logo"
                                                width={36}
                                                height={36}
                                                className="rounded-xl w-full h-full p-1"
                                            />
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="font-heading font-bold text-lg tracking-tight text-white leading-tight">SoobinVault</span>
                                            <span className="text-[9px] font-bold text-color-primary uppercase tracking-[0.2em] opacity-80">Network</span>
                                        </div>
                                    </Link>
                                </div>

                                {/* Sidebar Navigation Groups */}
                                <div className="flex-1 px-4 space-y-8 overflow-y-auto custom-scrollbar">
                                    <div className="space-y-1">
                                        <p className="px-4 text-[10px] font-bold text-white/20 uppercase tracking-[0.2em] mb-4">Main Menu</p>
                                        {navLinks.map((link) => {
                                            const Icon = link.icon;
                                            const isActive = pathname === link.href;
                                            return (
                                                <Link
                                                    key={link.name}
                                                    href={link.href}
                                                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 group ${
                                                        isActive 
                                                            ? 'bg-color-primary/10 text-color-primary shadow-[0_0_15px_rgba(232,58,118,0.05)] border border-color-primary/10' 
                                                            : 'text-white/40 hover:text-white hover:bg-white/5'
                                                    }`}
                                                >
                                                    <div className={`transition-transform duration-300 group-hover:scale-110 ${isActive ? 'text-color-primary' : ''}`}>
                                                        <Icon size={18} className={isActive ? 'fill-current' : ''} />
                                                    </div>
                                                    <span className="text-xs font-bold uppercase tracking-widest">
                                                        {link.name}
                                                    </span>
                                                    {isActive && (
                                                        <div className="ml-auto w-1.5 h-1.5 rounded-full bg-color-primary shadow-[0_0_10px_rgba(232,58,118,1)]" />
                                                    )}
                                                </Link>
                                            );
                                        })}
                                    </div>

                                    {(connected && account) && (
                                        <div className="space-y-1">
                                            <p className="px-4 text-[10px] font-bold text-white/20 uppercase tracking-[0.2em] mb-4">System</p>
                                            <button
                                                onClick={() => setIsSettingsOpen(!isSettingsOpen)}
                                                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 group ${
                                                    isSettingsOpen 
                                                        ? 'bg-white/10 text-white shadow-[0_0_15px_rgba(255,255,255,0.05)] border border-white/10' 
                                                        : 'text-white/40 hover:text-white hover:bg-white/5'
                                                }`}
                                            >
                                                <div className={`transition-all duration-500 ${isSettingsOpen ? 'rotate-90 text-white' : ''}`}>
                                                    <Settings size={18} />
                                                </div>
                                                <span className="text-xs font-bold uppercase tracking-widest">
                                                    Settings
                                                </span>
                                                {isSettingsOpen && (
                                                    <div className="ml-auto w-1.5 h-1.5 rounded-full bg-white shadow-[0_0_10px_rgba(255,255,255,1)]" />
                                                )}
                                            </button>
                                        </div>
                                    )}
                                </div>

                                {/* Sidebar Footer */}
                                <div className="p-6 border-t border-white/5">
                                    <div className="bg-black/20 p-4 rounded-2xl border border-white/5 space-y-3">
                                        <div className="flex items-center gap-2">
                                            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                                            <span className="text-[9px] font-bold text-white/40 uppercase tracking-widest">Aptos Mainnet</span>
                                        </div>
                                        <div className="text-[8px] text-white/20 font-bold uppercase tracking-[0.2em] leading-relaxed">
                                            Zero-Knowledge Layer<br/>v2.4.0 • Secured
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Mobile Logo Only */}
                            <Link href="/" className="md:hidden flex items-center gap-3 cursor-pointer group">
                                <div className="w-8 h-8 md:w-9 md:h-9 rounded-xl bg-gradient-to-br from-color-primary to-color-accent flex items-center justify-center shadow-[0_0_20px_rgba(232,58,118,0.4)] group-hover:shadow-[0_0_30px_rgba(251,179,204,0.6)] transition-all duration-300">
                                    <Image
                                        src="/logo.png"
                                        alt="ShelbyVault Logo"
                                        width={36}
                                        height={36}
                                        className="rounded-xl w-full h-full p-1"
                                    />
                                </div>
                                <span className="font-heading font-bold text-lg md:text-xl tracking-tight text-white">SoobinVault</span>
                            </Link>

                            {/* Desktop Header Middle (Clean) */}
                            <div className="hidden md:flex items-center gap-4 ml-64">
                                <div className="flex items-center gap-3 bg-white/5 px-4 py-2 rounded-2xl border border-white/5 backdrop-blur-md">
                                    <Shield size={14} className="text-color-primary" />
                                    <span className="text-[10px] font-bold text-white/40 uppercase tracking-[0.2em]">Zero Knowledge Network</span>
                                </div>
                            </div>

                            <div className="flex items-center gap-4">
                                {/* Desktop Top Actions */}
                                <div className="hidden md:flex items-center gap-3">
                                    <MagneticButton
                                        className="bg-color-primary/10 border border-color-primary/30 text-color-primary text-[10px] px-6 py-2.5 font-bold uppercase tracking-widest shadow-[0_0_15px_rgba(232,58,118,0.1)] hover:bg-color-primary hover:text-white transition-all rounded-xl"
                                        onClick={handleWalletClick}
                                    >
                                        {isLoading ? "Wait..." : (connected && account) ? `${account.address.toString().slice(0, 6)}...${account.address.toString().slice(-4)}` : "Connect Wallet"}
                                    </MagneticButton>
                                </div>

                            {/* Mobile Actions */}
                            <div className="md:hidden flex items-center gap-2">
                                <MagneticButton
                                    className="bg-color-primary/10 border border-color-primary/30 text-color-primary text-[10px] px-3 py-2 font-bold uppercase tracking-widest shadow-[0_0_15px_rgba(232,58,118,0.1)]"
                                    onClick={handleWalletClick}
                                >
                                    {isLoading ? "Wait..." : (connected && account) ? `${account.address.toString().slice(0, 3)}...${account.address.toString().slice(-3)}` : "Connect"}
                                </MagneticButton>
                                
                                {/* Settings Dropdown Mobile - MOVED OUT OF HEADER TO TOP-LEVEL FRAGMENT BELOW */}
                            </div>
                        </div>
                    </div>
                </div>
            </header>

            {/* Mobile Settings Drawer (Premium Bottom Sheet Style) */}
            {isSettingsOpen && (
                <>
                    {/* Backdrop for focus */}
                    <div 
                        className="md:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] animate-in fade-in duration-300"
                        onClick={() => setIsSettingsOpen(false)}
                    />
                    <div className="md:hidden fixed inset-x-0 bottom-0 z-[101] animate-in slide-in-from-bottom duration-500 transform-gpu">
                        <div className="bg-[#0B1121]/95 backdrop-blur-3xl border-t border-white/10 rounded-t-[2.5rem] shadow-[0_-20px_50px_rgba(0,0,0,0.5)] overflow-hidden flex flex-col max-h-[75vh]">
                            {/* Handle Bar Area */}
                            <div className="w-full flex justify-center py-4 cursor-grab active:cursor-grabbing" onClick={() => setIsSettingsOpen(false)}>
                                <div className="w-12 h-1.5 bg-white/20 rounded-full" />
                            </div>
                            
                            {/* Scrollable Content */}
                            <div className="overflow-y-auto pb-24 px-2 scrollbar-hide">
                                <div className="text-center mb-4 px-6">
                                    <h3 className="text-xl font-bold text-white tracking-tight">Security Settings</h3>
                                    <p className="text-color-support/40 text-[10px] uppercase tracking-widest mt-1">Configure your zero-knowledge vault</p>
                                </div>
                                {renderSettingsContent()}
                            </div>
                        </div>
                    </div>
                </>
            )}

            {/* Premium Mobile Bottom Navigation (Google Drive Style) - Compact Height */}
            <nav className="md:hidden fixed bottom-0 left-0 right-0 z-[100]">
                <div className="bg-[#0B1121]/95 backdrop-blur-3xl border-t border-white/10 px-2 py-1.5 flex items-center justify-around shadow-[0_-15px_35px_rgba(0,0,0,0.6)] relative">
                    <Link 
                        href="/" 
                        className={`flex flex-col items-center gap-0.5 p-1 rounded-2xl transition-all duration-300 ${pathname === '/' ? 'text-color-primary' : 'text-white/40'}`}
                    >
                        <Home size={20} className={pathname === '/' ? 'fill-current' : ''} />
                        <span className="text-[9px] font-bold uppercase tracking-widest">Home</span>
                    </Link>

                    <Link 
                        href="/vault" 
                        className={`flex flex-col items-center gap-0.5 p-1 rounded-2xl transition-all duration-300 ${pathname === '/vault' ? 'text-color-primary' : 'text-white/40'}`}
                    >
                        <PlusCircle size={20} className={`${pathname === '/vault' ? 'text-color-primary drop-shadow-[0_0_10px_rgba(232,58,118,0.5)]' : 'text-color-accent'}`} />
                        <span className="text-[9px] font-bold uppercase tracking-widest">Upload</span>
                    </Link>

                    <Link 
                        href="/dashboard" 
                        className={`flex flex-col items-center gap-0.5 p-1 rounded-2xl transition-all duration-300 ${pathname === '/dashboard' ? 'text-color-primary' : 'text-white/40'}`}
                    >
                        <FileText size={20} className={pathname === '/dashboard' ? 'fill-current' : ''} />
                        <span className="text-[9px] font-bold uppercase tracking-widest">Vault</span>
                    </Link>

                    {(connected && account) && (
                        <button 
                            onClick={() => setIsSettingsOpen(!isSettingsOpen)}
                            className={`flex flex-col items-center gap-0.5 p-1 rounded-2xl transition-all duration-300 ${isSettingsOpen ? 'text-color-primary' : 'text-white/40'}`}
                        >
                            <Settings size={20} className={isSettingsOpen ? 'rotate-90' : ''} />
                            <span className="text-[9px] font-bold uppercase tracking-widest">Settings</span>
                        </button>
                    )}
                </div>
            </nav>
        </>
    );
}
