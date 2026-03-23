"use client";

import React, { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { GlassCard } from './ui/GlassCard';

gsap.registerPlugin(ScrollTrigger);

export function Protocol() {
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const ctx = gsap.context(() => {
            gsap.fromTo(".protocol-step",
                { y: 30, opacity: 0, scale: 0.95 },
                {
                    scrollTrigger: {
                        trigger: ".protocol-container",
                        start: "top 85%",
                    },
                    y: 0,
                    opacity: 1,
                    scale: 1,
                    stagger: 0.15,
                    duration: 0.7,
                    ease: "back.out(1.5)"
                });
        }, containerRef);

        return () => ctx.revert();
    }, []);

    return (
        <section ref={containerRef} id="protocol" className="py-24 relative z-10 px-6">
            <div className="container mx-auto">
                <div className="protocol-container relative max-w-2xl mx-auto">
                    <h2 className="text-4xl md:text-5xl font-bold text-white mb-16 text-center bg-clip-text text-transparent bg-gradient-to-r from-color-support to-white">Deployment Protocol</h2>

                    <div className="flex flex-col gap-6 relative">
                        {/* Vertical Connecting Line */}
                        <div className="absolute top-8 bottom-8 left-1/2 md:left-[56px] w-[2px] bg-gradient-to-b from-[#38BDF8]/40 via-[#A855F7]/40 to-transparent -translate-x-1/2 z-0" />

                        {[
                            { step: '01', title: 'Initialize Session', desc: 'Securely link your Aptos wallet to authenticate without vulnerable passwords or centralized databases.' },
                            { step: '02', title: 'Unlock Secure Vault', desc: 'Sign the cryptographic message and set your 6-digit local PIN to encrypt your master vault key.' },
                            { step: '03', title: 'Manage Assets', desc: 'Drag and drop your files to encrypt them locally and distribute them across the decentralized network.' }
                        ].map((item, i) => (
                            <GlassCard key={i} className="protocol-step relative z-10 p-6 flex flex-col md:flex-row items-center text-center md:text-left gap-6 bg-[#0A0A0A]/90 border border-white/5 hover:border-color-accent/40 transition-all duration-300 group">
                                <div className="shrink-0 w-16 h-16 rounded-2xl bg-black flex items-center justify-center text-color-accent font-mono font-bold text-2xl shadow-[0_0_20px_rgba(232,58,118,0.15)] border border-white/10 group-hover:border-color-accent/50 z-10 transition-colors">
                                    {item.step}
                                </div>
                                <div className="flex-grow z-10">
                                    <h4 className="text-white font-semibold text-xl mb-2">{item.title}</h4>
                                    <p className="text-[#A3A3A3] text-sm font-light leading-relaxed">{item.desc}</p>
                                </div>
                            </GlassCard>
                        ))}
                    </div>
                </div>
            </div>
        </section>
    );
}
