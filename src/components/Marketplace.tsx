"use client";

import React, { useState, useEffect, useRef } from 'react';
import gsap from 'gsap';
import { Search, BrainCircuit, Database, Star, Clock, ShoppingCart, Filter, DownloadCloud, Tag, Banknote, ShieldAlert } from 'lucide-react';
import { useWallet } from "@aptos-labs/wallet-adapter-react";
import toast from 'react-hot-toast';

const MOCK_DATASETS = [
    {
        id: "blob-84f9...2c1",
        title: "Medical MRI Scans 4K (Brain)",
        description: "High quality anonymized MRI scans for training computer vision models in neuro-oncology.",
        price: 5.0,
        size: "2.4 GB",
        seller: "0x4f...8a2",
        category: "Computer Vision",
        downloads: 142,
        rating: 4.8,
        isFree: false
    },
    {
        id: "blob-19c2...d44",
        title: "Indonesian Multilingual NLP Corpus",
        description: "Over 10 million tokens of conversational Indonesian across 15 provincial dialects.",
        price: 2.5,
        size: "840 MB",
        seller: "0x1a...e72",
        category: "NLP",
        downloads: 87,
        rating: 4.9,
        isFree: false
    },
    {
        id: "blob-77a1...b90",
        title: "Autonomous Driving Lidar Raw",
        description: "Raw point-cloud data from 100 hours of city driving in dense traffic conditions.",
        price: 12.0,
        size: "15 GB",
        seller: "0x9b...1f4",
        category: "Sensors",
        downloads: 34,
        rating: 4.5,
        isFree: false
    },
    {
        id: "blob-32d5...f88",
        title: "Financial Time Series (Crypto)",
        description: "Tick-by-tick order book data for top 10 cryptocurrencies over a 2-year span.",
        price: 8.0,
        size: "4.1 GB",
        seller: "0x5c...3e1",
        category: "Finance",
        downloads: 215,
        rating: 4.7,
        isFree: false
    },
    {
        id: "blob-55e4...a11",
        title: "Customer Support Audio Interactions",
        description: "Anonymized audio logs suitable for sentiment analysis and speech-to-text fine-tuning.",
        price: 3.5,
        size: "1.2 GB",
        seller: "0x2d...9c3",
        category: "Audio",
        downloads: 62,
        rating: 4.6,
        isFree: false
    },
    {
        id: "blob-99f2...c33",
        title: "Synthesised Protein Structures",
        description: "Simulated genetic data for predicting protein-folding mechanisms.",
        price: 0.0,
        size: "300 MB",
        seller: "0x8e...4b5",
        category: "Biology",
        downloads: 504,
        rating: 4.9,
        isFree: true
    }
];

export function Marketplace() {
    const { account } = useWallet();
    const [searchQuery, setSearchQuery] = useState("");
    const [activeCategory, setActiveCategory] = useState("All");
    const containerRef = useRef<HTMLDivElement>(null);

    const categories = ["All", "NLP", "Computer Vision", "Audio", "Sensors", "Finance", "Biology"];

    const filteredDatasets = MOCK_DATASETS.filter(ds => 
        (activeCategory === "All" || ds.category === activeCategory) &&
        (ds.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
         ds.description.toLowerCase().includes(searchQuery.toLowerCase()))
    );

    useEffect(() => {
        const ctx = gsap.context(() => {
            gsap.fromTo(".dataset-card",
                { y: 30, opacity: 0 },
                {
                    y: 0,
                    opacity: 1,
                    stagger: 0.1,
                    duration: 0.6,
                    ease: "power2.out"
                });
        }, containerRef);
        return () => ctx.revert();
    }, [filteredDatasets]);

    const handlePurchase = (dataset: any) => {
        if (!account) {
            toast.error("Please connect your wallet first.");
            return;
        }
        
        toast.promise(
            new Promise((resolve) => setTimeout(resolve, 2000)),
            {
                loading: 'Initializing micropayment channel...',
                success: `Successfully purchased access to ${dataset.title}!`,
                error: 'Transaction rejected.',
            }
        );
    };

    return (
        <section ref={containerRef} className="py-12 md:py-24 relative z-10 px-6 min-h-screen">
            <div className="container mx-auto max-w-6xl">
                
                {/* Header */}
                <div className="flex flex-col md:flex-row justify-between items-center mb-12 gap-6">
                    <div>
                        <h2 className="text-4xl md:text-5xl font-bold mb-4 text-white tracking-tight flex items-center gap-4">
                            Data Marketplace
                        </h2>
                        <p className="text-blue-200/60 text-lg max-w-2xl font-light">
                            Discover, purchase, and integrate high-quality datasets using trustless micropayments on ShelbyUSD.
                        </p>
                    </div>
                </div>

                {/* Search & Filter Bar */}
                <div className="bg-[#0B1121]/60 backdrop-blur-3xl border border-indigo-500/20 rounded-3xl p-4 md:p-6 mb-12 shadow-[0_10px_40px_rgba(59,130,246,0.1)]">
                    <div className="flex flex-col md:flex-row gap-4">
                        {/* Search Input */}
                        <div className="relative flex-1 group">
                            <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                                <Search size={20} className="text-blue-400/50 group-focus-within:text-blue-400 transition-colors" />
                            </div>
                            <input
                                type="text"
                                placeholder="Search autonomous driving, NLP corpus..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full bg-black/40 border border-white/5 focus:border-blue-500/50 rounded-2xl py-4 flex pl-12 pr-4 text-white text-base outline-none transition-all placeholder:text-white/20 shadow-inner"
                            />
                        </div>
                        
                        {/* Categories Horizontal Scroll */}
                        <div className="flex items-center gap-2 overflow-x-auto pb-2 md:pb-0 scrollbar-hide">
                            <div className="px-3 shrink-0 text-white/30">
                                <Filter size={18} />
                            </div>
                            {categories.map((category) => (
                                <button
                                    key={category}
                                    onClick={() => setActiveCategory(category)}
                                    className={`px-5 py-2.5 rounded-full text-xs font-bold uppercase tracking-widest whitespace-nowrap transition-all duration-300 shrink-0 ${
                                        activeCategory === category 
                                        ? 'bg-blue-600 text-white shadow-[0_0_15px_rgba(37,99,235,0.4)] border border-blue-400' 
                                        : 'bg-white/5 text-white/40 hover:text-white hover:bg-white/10 border border-white/5'
                                    }`}
                                >
                                    {category}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredDatasets.length === 0 ? (
                        <div className="col-span-full py-20 flex flex-col items-center justify-center text-white/40">
                            <Database size={48} className="mb-4 opacity-20" />
                            <p className="text-xl">No datasets found matching your criteria.</p>
                        </div>
                    ) : (filteredDatasets.map((dataset, idx) => (
                        <div key={idx} className="dataset-card group bg-[#0A0F1E]/80 backdrop-blur-2xl border border-indigo-500/20 hover:border-indigo-500/50 rounded-3xl overflow-hidden transition-all duration-500 hover:shadow-[0_20px_50px_rgba(59,130,246,0.15)] flex flex-col hover:-translate-y-1">
                            
                            {/* Card Header (Category & Rating) */}
                            <div className="px-6 pt-6 pb-4 flex justify-between items-start border-b border-white/5">
                                <div className="flex gap-2 items-center">
                                    <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center border border-blue-500/20">
                                        <BrainCircuit size={16} className="text-blue-400" />
                                    </div>
                                    <span className="text-[10px] font-bold uppercase tracking-widest text-blue-400">
                                        {dataset.category}
                                    </span>
                                </div>
                                <div className="flex items-center gap-1 bg-yellow-500/10 px-2 py-1 rounded-md border border-yellow-500/20">
                                    <Star size={12} className="text-yellow-400 fill-yellow-400" />
                                    <span className="text-xs font-bold text-yellow-400">{dataset.rating}</span>
                                </div>
                            </div>

                            {/* Card Body */}
                            <div className="p-6 flex-1 flex flex-col">
                                <h3 className="text-xl font-bold text-white mb-2 leading-tight group-hover:text-blue-300 transition-colors">
                                    {dataset.title}
                                </h3>
                                <p className="text-sm text-blue-100/50 mb-6 leading-relaxed flex-1">
                                    {dataset.description}
                                </p>

                                {/* Metadata Row */}
                                <div className="flex items-center justify-between text-xs text-white/40 mb-6 font-mono font-medium">
                                    <span className="flex items-center gap-1.5"><Database size={14} /> {dataset.size}</span>
                                    <span className="flex items-center gap-1.5"><DownloadCloud size={14} /> {dataset.downloads}</span>
                                    <span className="flex items-center gap-1.5"><ShieldAlert size={14} /> {dataset.seller.substring(0,6)}..</span>
                                </div>

                                {/* Action Row */}
                                <div className="flex items-center justify-between pt-4 border-t border-white/5">
                                    <div className="flex flex-col">
                                        <span className="text-[10px] uppercase tracking-widest text-white/30 font-bold mb-1">Access</span>
                                        {dataset.isFree ? (
                                            <span className="text-lg font-bold text-green-400">FREE</span>
                                        ) : (
                                            <div className="flex items-end gap-1">
                                                <span className="text-2xl font-black text-white leading-none">{dataset.price.toFixed(1)}</span>
                                                <span className="text-[10px] font-bold text-indigo-400 mb-0.5 tracking-widest">SUSD</span>
                                            </div>
                                        )}
                                    </div>

                                    <button 
                                        onClick={() => handlePurchase(dataset)}
                                        className={`px-6 py-3 rounded-xl font-bold text-xs uppercase tracking-widest transition-all duration-300 flex items-center gap-2 shadow-lg ${
                                            dataset.isFree 
                                            ? 'bg-white/10 text-white hover:bg-white/20 border border-white/20' 
                                            : 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:shadow-[0_0_20px_rgba(59,130,246,0.5)] border border-blue-400/30 group-hover:scale-105 active:scale-95'
                                        }`}
                                    >
                                        <ShoppingCart size={16} />
                                        {dataset.isFree ? 'Download' : 'Purchase'}
                                    </button>
                                </div>
                            </div>

                        </div>
                    )))}
                </div>

            </div>
        </section>
    );
}
