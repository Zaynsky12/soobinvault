"use client";

import React, { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { MagneticButton } from "./ui/MagneticButton";
import { useWallet } from "@aptos-labs/wallet-adapter-react";

gsap.registerPlugin(ScrollTrigger);

export function Hero() {
    const container = useRef<HTMLDivElement>(null);
    const { connect, disconnect, connected, account, isLoading } = useWallet();

    useEffect(() => {
        const ctx = gsap.context(() => {
            // Entrance animation
            gsap.from(".animate-in", {
                y: 50,
                opacity: 0,
                duration: 1.2,
                stagger: 0.15,
                ease: "power3.out",
            });

            // Animate the path line
            gsap.fromTo("#path-line",
                { strokeDashoffset: 1000 },
                { strokeDashoffset: 0, duration: 2, ease: "power2.inOut" }
            );

            // Scroll Parallax (Lighter weight)
            gsap.utils.toArray(".scroll-parallax").forEach((element: any) => {
                const speed = parseFloat(element.dataset.speed || "1");
                gsap.to(element, {
                    y: () => -100 * speed,
                    ease: "none",
                    scrollTrigger: {
                        trigger: container.current,
                        start: "top top",
                        end: "bottom top",
                        scrub: true,
                    }
                });
            });

            // Removed mouse tracking closure for performance
        }, container);

        return () => ctx.revert();
    }, []);

    const handleWalletClick = () => {
        if (connected) {
            disconnect();
        } else {
            connect("Petra" as any); // Type cast to prevent strict literal type issues if wallet names differ slightly
        }
    };

    return (
        <section ref={container} className="relative min-h-screen flex items-center justify-center overflow-hidden pt-20 perspective-1000">
            {/* High-Tech Cyber Grid Overlay */}
            <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff0a_1px,transparent_1px),linear-gradient(to_bottom,#ffffff0a_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] pointer-events-none z-0" />

            {/* Decorative Parallax Shapes - Removed mix-blend-screen for performance */}
            <div data-speed="0.8" className="scroll-parallax absolute top-1/4 left-[10%] w-32 h-32 rounded-full glass-panel opacity-40 pointer-events-none will-change-transform" />
            <div data-speed="1.5" className="scroll-parallax absolute top-1/3 right-[15%] w-48 h-48 rounded-[3rem] rotate-12 glass-panel opacity-30 pointer-events-none will-change-transform" />
            <div data-speed="0.4" className="scroll-parallax absolute bottom-1/4 left-[20%] w-24 h-24 rounded-full glass-panel opacity-50 pointer-events-none will-change-transform" />
            <div data-speed="2.0" className="scroll-parallax absolute bottom-1/3 right-[10%] w-40 h-40 rounded-[2rem] -rotate-12 glass-panel opacity-40 pointer-events-none will-change-transform" />

            {/* Guided Path Background Pattern */}
            <div data-speed="0.2" className="scroll-parallax absolute inset-0 z-0 opacity-20 pointer-events-none flex items-center justify-center">
                <svg
                    className="w-full h-full max-w-6xl"
                    viewBox="0 0 1000 500"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                >
                    <path
                        id="path-line"
                        d="M-100,250 C100,250 150,100 300,100 C450,100 500,400 700,400 C800,400 900,250 1100,250"
                        stroke="#E8F5E9"
                        strokeWidth="2"
                        strokeDasharray="1000"
                        vectorEffect="non-scaling-stroke"
                    />
                </svg>
            </div>

            <div className="relative z-10 container mx-auto px-6 text-center max-w-4xl">
                <div className="animate-in inline-flex items-center gap-3 px-4 py-1.5 rounded-full bg-[#111111]/80 border border-white/5 shadow-2xl mb-10">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.8)]" />
                    <span className="text-xs font-mono font-medium text-color-support uppercase tracking-widest">Build on Shelby</span>
                </div>

                <h1 className="animate-in text-5xl md:text-7xl font-bold mb-6 text-transparent bg-clip-text bg-gradient-to-br from-white via-white to-color-support drop-shadow-lg leading-[1.1] tracking-tight">
                    Unbreakable Storage for the Decentralized Web.
                </h1>

                <p className="animate-in text-xl md:text-2xl text-[#A3A3A3] mb-12 max-w-2xl mx-auto font-normal leading-relaxed">
                    Store, share, and <span className="text-white font-semibold">stream</span> your files on the world's most powerful <span className="text-color-accent">cryptographic</span> storage network.
                </p>

                <div className="animate-in flex flex-col sm:flex-row items-center justify-center gap-4">
                    <MagneticButton
                        className="bg-color-accent text-white w-full sm:w-auto text-lg font-bold shadow-[0_0_30px_-5px_#E83A76] hover:shadow-[0_0_50px_-5px_#E83A76] rounded-2xl"
                        onClick={handleWalletClick}
                    >
                        {isLoading ? "Connecting..." : connected && account ? `Connected: ${account.address.toString().slice(0, 6)}...` : "Connect Petra Wallet"}
                    </MagneticButton>
                    <a 
                        href="https://docs.shelby.xyz/" 
                        target="_blank" 
                        rel="noopener noreferrer" 
                        className="text-color-support hover:text-white transition-colors duration-200 font-semibold px-8 py-4 w-full sm:w-auto glass-panel rounded-2xl hover:bg-white/10 relative overflow-hidden group flex items-center justify-center"
                    >
                        <span className="relative z-10">Explore Documentation</span>
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
                    </a>
                </div>
            </div>

            {/* Ambient gradient glows - Reduced blur and removed blend modes for performance */}
            <div className="absolute top-1/4 left-1/4 w-[400px] h-[400px] bg-color-primary/10 rounded-full blur-[80px] pointer-events-none will-change-transform" />
            <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-color-accent/10 rounded-full blur-[80px] pointer-events-none will-change-transform" />
        </section>
    );
}
