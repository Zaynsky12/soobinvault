import React from 'react';
import { Twitter, Github, MessageCircle } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';

export function Footer() {
    return (
        <footer className="w-full border-t border-white/10 bg-[#0B1121]/90 backdrop-blur-2xl relative z-10 pt-6 md:pt-16 pb-20 md:pb-8 overflow-hidden md:pl-64">
            {/* Decorative Glow */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1/2 h-[1px] bg-gradient-to-r from-transparent via-color-primary to-transparent opacity-50" />
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-color-primary/10 rounded-full blur-[100px] pointer-events-none -translate-y-1/2" />

            <div className="container mx-auto px-6 relative z-10">
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 md:gap-8 mb-6 md:mb-12">
                    {/* Brand */}
                    <div className="flex flex-col items-start text-left max-w-sm">
                        <div className="flex items-center gap-3 cursor-pointer group mb-3 md:mb-4">
                            <div className="w-8 h-8 md:w-10 md:h-10 rounded-xl bg-gradient-to-br from-color-primary to-color-accent flex items-center justify-center shadow-[0_0_20px_rgba(232,58,118,0.4)] group-hover:shadow-[0_0_30px_rgba(251,179,204,0.6)] transition-all duration-300">
                                <Image
                                    src="/logo.png"
                                    alt="soobinvault Logo"
                                    width={32}
                                    height={32}
                                    className="rounded-lg md:rounded-xl"
                                />
                            </div>
                            <span className="font-heading font-bold text-lg md:text-xl tracking-tight text-white">SoobinVault</span>
                        </div>
                        <p className="text-color-support/60 text-xs md:text-sm font-light leading-relaxed">
                            The ultimate decentralized storage protocol. Protect your digital legacy with unbreakable military-grade cryptography.
                        </p>
                    </div>

                    {/* Socials & Quick Links */}
                    <div className="flex flex-col items-start md:items-end gap-6">
                        <div className="flex gap-4">
                            <a href="#" className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-color-support hover:text-white hover:bg-color-primary/80 transition-all hover:scale-110 shadow-lg hover:shadow-[0_0_20px_rgba(232,58,118,0.4)]">
                                <Twitter size={18} />
                            </a>
                            <a href="https://github.com/Zaynsky12/soobinvault" target="_blank" rel="noopener noreferrer" className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-color-support hover:text-white hover:bg-color-primary/80 transition-all hover:scale-110 shadow-lg hover:shadow-[0_0_20px_rgba(232,58,118,0.4)]">
                                <Github size={18} />
                            </a>
                            <a href="#" className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-color-support hover:text-white hover:bg-color-primary/80 transition-all hover:scale-110 shadow-lg hover:shadow-[0_0_20px_rgba(232,58,118,0.4)]">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1971.3728.2914a.077.077 0 01-.0066.1277 12.2986 12.2986 0 01-1.873.8923.076.076 0 00-.0416.1061c.3608.698.7724 1.3628 1.226 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189z"/>
                                </svg>
                            </a>
                        </div>
                    </div>
                </div>

                <div className="pt-8 border-t border-white/10 text-center flex flex-col md:flex-row items-center justify-between gap-4">
                    <p className="text-color-support/40 text-xs">
                        © {new Date().getFullYear()} SoobinVault. All rights reserved.
                    </p>
                    <p className="text-color-support/40 text-xs flex items-center gap-1">
                        Made with <span className="text-color-primary">♥</span> By <a href="https://x.com/owsnpidc" target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:text-cyan-300 transition-colors font-semibold drop-shadow-[0_0_8px_rgba(34,211,238,0.8)]">Zayn</a>
                    </p>
                </div>
            </div>
        </footer>
    );
}
