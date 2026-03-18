import React from 'react';
import { Twitter, Github, MessageCircle } from 'lucide-react';
import Image from 'next/image';

export function Footer() {
    return (
        <footer className="w-full border-t border-white/10 bg-[#0B1121]/90 backdrop-blur-2xl relative z-10 overflow-hidden">
            {/* Decorative Glow */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1/2 h-[1px] bg-gradient-to-r from-transparent via-color-primary to-transparent opacity-50" />
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[200px] bg-color-primary/10 rounded-full blur-[100px] pointer-events-none -translate-y-1/2" />

            <div className="relative z-10 flex flex-col items-center text-center gap-5 py-10 px-6 max-w-sm mx-auto md:max-w-none md:flex-row md:justify-between md:items-center md:py-8 md:px-10 md:max-w-5xl">

                {/* Logo + Brand */}
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-color-primary to-color-accent flex items-center justify-center shadow-[0_0_16px_rgba(232,58,118,0.35)] shrink-0">
                        <Image
                            src="/logo.png"
                            alt="SoobinVault Logo"
                            width={36}
                            height={36}
                            className="rounded-xl"
                        />
                    </div>
                    <span className="font-heading font-bold text-base tracking-tight text-white">SoobinVault</span>
                </div>

                {/* Copyright */}
                <p className="text-color-support/50 text-xs">
                    © Made by{' '}
                    <a
                        href="https://x.com/owsnpidc"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-400 hover:text-blue-300 transition-colors font-medium"
                    >
                        Zayn
                    </a>
                </p>

                {/* Social Icons */}
                <div className="flex items-center gap-3">
                    <a href="#" className="w-9 h-9 rounded-full glass-panel flex items-center justify-center text-color-support hover:text-white hover:bg-white/10 transition-all hover:scale-110">
                        <Twitter size={16} />
                    </a>
                    <a href="#" className="w-9 h-9 rounded-full glass-panel flex items-center justify-center text-color-support hover:text-white hover:bg-white/10 transition-all hover:scale-110">
                        <Github size={16} />
                    </a>
                    <a href="#" className="w-9 h-9 rounded-full glass-panel flex items-center justify-center text-color-support hover:text-white hover:bg-white/10 transition-all hover:scale-110">
                        <MessageCircle size={16} />
                    </a>
                </div>
            </div>
        </footer>
    );
}
