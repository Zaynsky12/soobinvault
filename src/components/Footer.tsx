import React from 'react';
import { Shield, Twitter, Github, MessageCircle } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
export function Footer() {
    return (
        <footer className="w-full border-t border-white/10 bg-[#0B1121]/90 backdrop-blur-2xl relative z-10 pt-20 pb-10 overflow-hidden">
            {/* Decorative Glow */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1/2 h-[1px] bg-gradient-to-r from-transparent via-color-primary to-transparent opacity-50" />
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[300px] bg-color-primary/10 rounded-full blur-[100px] pointer-events-none -translate-y-1/2" />

            <div className="container mx-auto px-6 grid grid-cols-1 md:grid-cols-2 gap-18 mb-16 relative z-10">
                <div className="col-span-1 md:col-span-1 flex flex-col items-start">
                    <div className="flex items-center gap-3 cursor-pointer group">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-color-primary to-color-accent flex items-center justify-center shadow-[0_0_20px_rgba(232,58,118,0.4)] group-hover:shadow-[0_0_30px_rgba(251,179,204,0.6)] transition-all duration-300">
                            <Image
                                src="/logo.png"  // Path starting from the root of the public folder
                                alt="soobinvault Logo"
                                width={40}
                                height={40}
                                className="rounded-xl"
                            />                        </div>
                        <span className="font-heading font-bold text-xl tracking-tight text-white">SoobinVault</span>
                    </div>
                    <p className="text-color-support/70 text-sm font-light leading-relaxed mb-8">
                        The ultimate decentralized storage protocol. Protect your digital legacy with unbreakable military-grade cryptography and fractional node distribution.
                    </p>
                    <div className="flex gap-4">
                        <a href="#" className="w-10 h-10 rounded-full glass-panel flex items-center justify-center text-color-support hover:text-white hover:bg-white/10 transition-all hover:scale-110">
                            <Twitter size={18} />
                        </a>
                        <a href="#" className="w-10 h-10 rounded-full glass-panel flex items-center justify-center text-color-support hover:text-white hover:bg-white/10 transition-all hover:scale-110">
                            <Github size={18} />
                        </a>
                        <a href="#" className="w-10 h-10 rounded-full glass-panel flex items-center justify-center text-color-support hover:text-white hover:bg-white/10 transition-all hover:scale-110">
                            <MessageCircle size={18} />
                        </a>
                    </div>
                </div>


                {/* <div className="col-span-1 flex flex-col gap-4 border border-white">
                    <h4 className="text-white font-medium mb-2">Protocol</h4>
                    <Link href="#dashboard" className="text-color-support/70 hover:text-color-primary transition-colors text-sm">Dashboard</Link>
                    <Link href="#vault" className="text-color-support/70 hover:text-color-primary transition-colors text-sm">Storage Vault</Link>
                    <Link href="#features" className="text-color-support/70 hover:text-color-primary transition-colors text-sm">Capabilities</Link>
                    <Link href="#" className="text-color-support/70 hover:text-color-primary transition-colors text-sm">Node Network</Link>
                </div> */}

                {/* <div className="col-span-1 flex flex-col gap-4">
                    <h4 className="text-white font-medium mb-2">Developers</h4>
                    <Link href="#" className="text-color-support/70 hover:text-color-primary transition-colors text-sm">Documentation</Link>
                    <Link href="#" className="text-color-support/70 hover:text-color-primary transition-colors text-sm">GitHub Repo</Link>
                    <Link href="#" className="text-color-support/70 hover:text-color-primary transition-colors text-sm">Aptos SDK</Link>
                    <Link href="#" className="text-color-support/70 hover:text-color-primary transition-colors text-sm">Whitepaper</Link>
                </div> */}

                {/* <div className="col-span-1 flex flex-col gap-4">
                    <h4 className="text-white font-medium mb-2">Legal</h4>
                    <Link href="#" className="text-color-support/70 hover:text-color-primary transition-colors text-sm">Privacy Policy</Link>
                    <Link href="#" className="text-color-support/70 hover:text-color-primary transition-colors text-sm">Terms of Service</Link>
                    <Link href="#" className="text-color-support/70 hover:text-color-primary transition-colors text-sm">Cookie Policy</Link>
                </div> */}
            </div>

            <div className="container mx-auto px-6 pt-8 border-t border-white/10 text-center flex flex-col md:flex-row items-center justify-between">
                <p className="text-color-support/50 text-xs mb-4 md:mb-0">
                    © Made By <a href="https://x.com/owsnpidc" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 transition-colors font-medium">Zayn</a>
                </p>
            </div>
        </footer>
    );
}
