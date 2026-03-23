"use client";

import React, { useState, useEffect, useRef } from 'react';
import { Lock, X, ShieldCheck } from 'lucide-react';
import gsap from 'gsap';

interface VaultPinOverlayProps {
    isOpen: boolean;
    title: string;
    allowReset?: boolean;
    required?: boolean;
    onSubmit: (pin: string) => void;
    onCancel: () => void;
}

export function VaultPinOverlay({ isOpen, title, allowReset, required, onSubmit, onCancel }: VaultPinOverlayProps) {
    const [pin, setPin] = useState('');
    const overlayRef = useRef<HTMLDivElement>(null);
    const modalRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isOpen) {
            setPin('');
            // Kill any outgoing animations to prevent them from hiding the newly opened modal
            gsap.killTweensOf([overlayRef.current, modalRef.current]);

            gsap.fromTo(overlayRef.current,
                { opacity: 0 },
                { opacity: 1, duration: 0.3, ease: 'power2.out' }
            );
            gsap.fromTo(modalRef.current,
                { scale: 0.9, y: 20, opacity: 0 },
                { scale: 1, y: 0, opacity: 1, duration: 0.4, ease: 'back.out(1.5)', delay: 0.1 }
            );
            // Auto-focus input
            setTimeout(() => inputRef.current?.focus(), 100);
        }
    }, [isOpen, title]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Escape' && !required) {
            handleCancel();
        } else if (e.key === 'Enter') {
            handleSubmit();
        }
    };

    const handleSubmit = () => {
        if (pin.length < 4) return;

        gsap.to(modalRef.current, {
            scale: 0.95, opacity: 0, duration: 0.2, ease: 'power2.in',
            onComplete: () => onSubmit(pin)
        });
        gsap.to(overlayRef.current, { opacity: 0, duration: 0.3, delay: 0.1 });
    };

    const handleCancel = () => {
        gsap.to(modalRef.current, {
            scale: 0.95, opacity: 0, duration: 0.2, ease: 'power2.in',
            onComplete: onCancel
        });
        gsap.to(overlayRef.current, { opacity: 0, duration: 0.3, delay: 0.1 });
    };

    if (!isOpen) return null;

    return (
        <div
            ref={overlayRef}
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-md px-4"
        >
            <div
                ref={modalRef}
                className="bg-gradient-to-b from-[#1a0b14] to-[#0A0A0A] border border-color-primary/30 p-8 rounded-3xl max-w-md w-full shadow-[0_0_50px_rgba(232,58,118,0.2)] text-center relative overflow-hidden"
            >
                {/* Decorative Top Bar */}
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-color-primary via-color-accent to-color-primary animate-pulse" />

                {!required && (
                    <button
                        onClick={handleCancel}
                        className="absolute top-4 right-4 text-white/40 hover:text-white transition-colors"
                    >
                        <X size={20} />
                    </button>
                )}

                <div className="w-16 h-16 bg-color-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-6 border border-color-primary/20 shadow-[0_0_30px_rgba(232,58,118,0.3)]">
                    <Lock size={32} className="text-color-primary" />
                </div>

                <h2 className="text-xl font-bold text-white mb-2">{title}</h2>
                <p className={`text-sm mb-8 min-h-[20px] ${title.toLowerCase().includes('incorrect') ? 'text-red-400 font-medium animate-pulse' : 'text-color-support/80'}`}>
                    {title.toLowerCase().includes('master key')
                        ? "Please carefully paste your previously backed up Key string."
                        : title.toLowerCase().includes('incorrect')
                            ? "The password you entered was incorrect. Please try again or import your Master Key."
                            : title.toLowerCase().includes('create')
                                ? "Create a secure 6-digit PIN to secure your vault on this device."
                                : "Enter your secure 6-digit Vault PIN to access your session keys."}
                </p>

                <div className="mb-8">
                    <input
                        ref={inputRef}
                        type="password"
                        value={pin}
                        onChange={(e) => setPin(e.target.value)}
                        onKeyDown={handleKeyDown}
                        maxLength={200}
                        placeholder="Enter here..."
                        className="w-full bg-[#0B1121]/50 border border-white/10 rounded-xl px-4 py-4 text-center text-xl text-white focus:outline-none focus:border-color-primary/50 focus:shadow-[0_0_20px_rgba(232,58,118,0.2)] transition-all placeholder:text-white/20"
                    />
                </div>

                <button
                    onClick={handleSubmit}
                    disabled={pin.length < 4}
                    className="w-full py-4 rounded-xl bg-gradient-to-r from-color-primary to-color-accent text-white font-bold uppercase tracking-widest text-sm hover:scale-[1.02] transition-all shadow-[0_0_20px_rgba(232,58,118,0.4)] disabled:opacity-50 disabled:hover:scale-100 flex items-center justify-center gap-2"
                >
                    <ShieldCheck size={18} />
                    {title.toLowerCase().includes('master key') ? "Confirm Master Key" : "Confirm Security PIN"}
                </button>

                {allowReset && (
                    <button
                        onClick={() => {
                            gsap.to(modalRef.current, {
                                scale: 0.95, opacity: 0, duration: 0.2, ease: 'power2.in',
                                onComplete: () => onSubmit("__IMPORT__")
                            });
                            gsap.to(overlayRef.current, { opacity: 0, duration: 0.3, delay: 0.1 });
                        }}
                        className="w-full mt-4 py-3 rounded-xl border border-white/10 text-white/50 hover:text-color-primary hover:border-color-primary/30 hover:bg-color-primary/5 transition-all text-sm font-medium"
                    >
                        Import Master Key
                    </button>
                )}
            </div>
        </div>
    );
}
