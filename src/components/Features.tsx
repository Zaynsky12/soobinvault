"use client";

import React, { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { GlassCard } from "./ui/GlassCard";
import { Shield, Network, Wallet } from "lucide-react";

gsap.registerPlugin(ScrollTrigger);

const features = [
    {
        icon: Shield,
        title: "Zero-Knowledge Architecture",
        description: "Military-grade AES-256-GCM encryption deployed locally. Your cryptographic keys never leave your device. We cannot access your data.",
        speed: 0.8
    },
    {
        icon: Network,
        title: "Mandatory PIN Protection",
        description: "Every session is secured by a user-defined 6-digit PIN, encrypting your local vault key with a hardware-grade approach.",
        speed: 1.2
    },
    {
        icon: Wallet,
        title: "Master Key Restoration",
        description: "Lose your PIN? No problem. Restore your entire vault seamlessly using your unique 64-character Master Key backup.",
        speed: 0.9
    }
];

export function Features() {
    const sectionRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const ctx = gsap.context(() => {
            gsap.fromTo(".feature-card",
                { y: 100, opacity: 0 },
                {
                    scrollTrigger: {
                        trigger: sectionRef.current,
                        start: "top 80%",
                    },
                    y: 0,
                    opacity: 1,
                    duration: 1,
                    stagger: 0.15,
                    ease: "power3.out"
                });

            gsap.fromTo(".feature-header",
                { y: 30, opacity: 0 },
                {
                    scrollTrigger: {
                        trigger: sectionRef.current,
                        start: "top 85%",
                    },
                    y: 0,
                    opacity: 1,
                    duration: 1,
                    ease: "power3.out"
                });

            // Feature Parallax Effects
            gsap.utils.toArray(".parallax-feature").forEach((element: any) => {
                const speed = parseFloat(element.dataset.speed || "1");
                gsap.to(element, {
                    y: () => -50 * speed,
                    ease: "none",
                    scrollTrigger: {
                        trigger: sectionRef.current,
                        start: "top bottom",
                        end: "bottom top",
                        scrub: true,
                    }
                });
            });
        }, sectionRef);

        return () => ctx.revert();
    }, []);

    return (
        <section id="features" ref={sectionRef} className="py-32 relative z-10 px-6 overflow-hidden">
            {/* Background 3D glass shapes for parallax - Performance optimized */}
            <div data-speed="1.8" className="parallax-feature absolute top-10 left-[-5%] w-64 h-64 rounded-full bg-[#FBB3CC]/10 glass-panel opacity-20 pointer-events-none will-change-transform" />
            <div data-speed="0.5" className="parallax-feature absolute bottom-20 right-0 w-80 h-80 rounded-[4rem] rotate-45 bg-[#E83A76]/10 glass-panel opacity-20 pointer-events-none will-change-transform" />
            <div data-speed="2.2" className="parallax-feature absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full border border-white/5 opacity-10 pointer-events-none will-change-transform" />

            <div className="container mx-auto max-w-6xl relative z-10">
                <div className="text-center mb-24 relative">
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 bg-[#FBB3CC]/10 blur-[30px] rounded-full pointer-events-none" />
                    <h2 className="feature-header text-5xl md:text-6xl font-bold mb-6 bg-clip-text text-transparent bg-gradient-to-r from-white via-color-support to-white/50">Core Capabilities</h2>
                    <p className="feature-header text-color-support/80 text-xl md:text-2xl max-w-2xl mx-auto font-light tracking-wide">From friction to flow experience storage without compromise.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 md:grid-rows-2 auto-rows-[minmax(250px,auto)] gap-6 md:gap-8">
                    {/* Large Feature 1 */}
                    <div data-speed="1.0" className="parallax-feature md:col-span-2 md:row-span-2">
                        <GlassCard largeCurve className="feature-card p-12 flex flex-col justify-end h-[500px] md:h-full bg-gradient-to-br from-[#111111]/80 to-transparent relative overflow-hidden group hover:border-[#FBB3CC]/40 transition-all duration-500">
                            <div className="absolute top-10 right-10 w-24 h-24 rounded-3xl glass-panel flex items-center justify-center text-color-accent bg-black/50 z-10 group-hover:scale-110 transition-transform duration-500 group-hover:shadow-[0_0_30px_rgba(251,179,204,0.3)]">
                                <Network size={40} strokeWidth={1.5} />
                            </div>

                            <div className="absolute -bottom-32 -left-32 w-96 h-96 bg-[radial-gradient(ellipse_at_center,rgba(251,179,204,0.2)_0%,transparent_70%)] opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" />

                            <div className="relative z-10 w-full md:w-3/4">
                                <div className="inline-flex px-4 py-1.5 rounded-full bg-[#1A1A1A] border border-white/5 text-[#A3A3A3] text-xs font-mono font-medium mb-6 uppercase tracking-widest">Protocol Core</div>
                                <h3 className="text-3xl md:text-4xl font-bold mb-4 text-white">Zero-Knowledge Architecture</h3>
                                <p className="text-[#A3A3A3] text-lg font-light leading-relaxed">
                                    Military-grade AES-256-GCM encryption deployed locally. Your cryptographic keys never leave your device. We cannot access your data—only you hold the power of decryption.
                                </p>
                            </div>
                        </GlassCard>
                    </div>

                    {/* Smaller Feature 2 */}
                    <div data-speed="1.2" className="parallax-feature md:col-span-1 md:row-span-1">
                        <GlassCard className="feature-card p-8 flex flex-col h-[280px] bg-[#1A0D12]/60 relative overflow-hidden group hover:border-[#E83A76]/30 transition-all duration-500">
                            <div className="w-14 h-14 rounded-2xl glass-panel flex items-center justify-center mb-6 text-[#E83A76] bg-black/40 group-hover:rotate-12 transition-transform duration-500">
                                <Network size={24} strokeWidth={2} />
                            </div>

                            <div className="relative z-10 mt-auto">
                                <h3 className="text-2xl font-semibold mb-2 text-white">Mandatory PIN</h3>
                                <p className="text-color-support/80 text-sm font-light">Every session is secured by a user-defined 6-digit PIN, encrypting your local vault key with a hardware-grade approach.</p>
                            </div>
                            <div className="absolute -top-10 -right-10 w-48 h-48 bg-[radial-gradient(ellipse_at_center,rgba(232,58,118,0.15)_0%,transparent_70%)] pointer-events-none" />
                        </GlassCard>
                    </div>

                    {/* Smaller Feature 3 */}
                    <div data-speed="0.8" className="parallax-feature md:col-span-1 md:row-span-1">
                        <GlassCard className="feature-card p-8 flex flex-col h-[280px] bg-[#1A0D12]/60 relative overflow-hidden group hover:border-[#F472B6]/30 transition-all duration-500">
                            <div className="w-14 h-14 rounded-2xl glass-panel flex items-center justify-center mb-6 text-[#F472B6] bg-black/40 group-hover:-rotate-12 transition-transform duration-500">
                                <Wallet size={24} strokeWidth={2} />
                            </div>

                            <div className="absolute bottom-0 right-0 w-full h-1/2 bg-gradient-to-t from-[#F472B6]/10 to-transparent pointer-events-none" />

                            <div className="relative z-10 mt-auto">
                                <h3 className="text-2xl font-semibold mb-2 text-white">Master Key Recovery</h3>
                                <p className="text-color-support/80 text-sm font-light">Seamlessly restore your vault using a 64-character backup if you forget your PIN or switch devices.</p>
                            </div>
                        </GlassCard>
                    </div>
                </div>
            </div>
        </section>
    );
}
