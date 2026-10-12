const fs = require('fs');
const path = require('path');

const targetDir = 'C:/Users/ADMIN/Desktop/projects/xamp/filive-website';

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function writeFile(relativePath, content) {
  const fullPath = path.join(targetDir, relativePath);
  ensureDir(path.dirname(fullPath));
  fs.writeFileSync(fullPath, content.trim() + '\n', 'utf8');
  console.log(`Created: ${relativePath}`);
}

// 1. globals.css
writeFile('src/app/globals.css', `@import "tailwindcss";

@layer base {
  :root {
    --bg-dark: #07090e;
    --card-dark: #0f1422;
    --card-border: rgba(255, 255, 255, 0.08);
    --primary-pink: #ef0083;
    --primary-violet: #8b5cf6;
    --primary-cyan: #06b6d4;
  }

  html {
    scroll-behavior: smooth;
    background-color: #07090e;
    color: #f1f5f9;
  }

  body {
    background-color: #07090e;
    color: #f1f5f9;
    overflow-x: hidden;
  }
}

/* Custom glow and glassmorphic utilities */
.glow-pink {
  box-shadow: 0 0 35px -5px rgba(239, 0, 131, 0.45);
}

.glow-purple {
  box-shadow: 0 0 35px -5px rgba(139, 92, 246, 0.45);
}

.glow-cyan {
  box-shadow: 0 0 35px -5px rgba(6, 182, 212, 0.45);
}

.gradient-text-pink {
  background: linear-gradient(135deg, #ff2a6d 0%, #ef0083 50%, #8b5cf6 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.gradient-text-cyan {
  background: linear-gradient(135deg, #06b6d4 0%, #3b82f6 50%, #8b5cf6 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.glass-nav {
  background: rgba(7, 9, 14, 0.85);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.glass-card {
  background: rgba(15, 20, 34, 0.7);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.glass-card-hover {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.glass-card-hover:hover {
  transform: translateY(-5px);
  border-color: rgba(239, 0, 131, 0.35);
  box-shadow: 0 15px 35px -10px rgba(239, 0, 131, 0.25);
}

@keyframes floatSlow {
  0%, 100% {
    transform: translateY(0px);
  }
  50% {
    transform: translateY(-8px);
  }
}

.animate-float {
  animation: floatSlow 4s ease-in-out infinite;
}

@keyframes pulseGlow {
  0%, 100% {
    opacity: 0.3;
    transform: scale(1);
  }
  50% {
    opacity: 0.6;
    transform: scale(1.08);
  }
}

.animate-pulse-glow {
  animation: pulseGlow 5s ease-in-out infinite;
}
`);

// 2. layout.tsx
writeFile('src/app/layout.tsx', `import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FiLive - Next-Gen Live Streaming & Audio Party Room Platform",
  description: "Connect, stream and celebrate in real-time. Enjoy interactive multi-seat party rooms, HD live streaming, 3D animated gifts and in-room mini games.",
  keywords: ["FiLive", "Live Streaming", "Party Room", "Audio Chat", "Voice Room", "Gifts", "Live Stream App"],
  icons: {
    icon: "/favicon.ico",
  },
  openGraph: {
    title: "FiLive - Next-Gen Live Streaming & Audio Party Room Platform",
    description: "Join millions in real-time audio party rooms, HD video streams, and interactive entertainment.",
    url: "https://filive.in",
    siteName: "FiLive",
    images: [
      {
        url: "https://filive.in/og-image.png",
        width: 1200,
        height: 630,
        alt: "FiLive App",
      },
    ],
    locale: "en_US",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-[#07090E] text-slate-100 antialiased selection:bg-[#EF0083] selection:text-white">
        {children}
      </body>
    </html>
  );
}
`);

// 3. Navbar Component
writeFile('src/components/Navbar.tsx', `'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Menu, X, Sparkles, Download, Radio, Users, Gift, Gamepad2, Shield } from 'lucide-react';

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <header
      className={\`fixed top-0 left-0 right-0 z-50 transition-all duration-300 \${
        scrolled ? 'glass-nav py-3.5 shadow-xl shadow-black/40' : 'bg-transparent py-5'
      }\`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="relative w-10 h-10 rounded-xl bg-gradient-to-tr from-[#FF2A6D] via-[#EF0083] to-[#8B5CF6] p-0.5 flex items-center justify-center shadow-lg shadow-[#EF0083]/30 group-hover:shadow-[#EF0083]/60 transition-all duration-300">
              <div className="w-full h-full bg-[#0B0F19] rounded-[10px] flex items-center justify-center">
                <Radio className="w-5 h-5 text-[#FF2A6D] animate-pulse" />
              </div>
              <span className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-400 rounded-full border-2 border-[#0B0F19] animate-ping" />
              <span className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-400 rounded-full border-2 border-[#0B0F19]" />
            </div>
            <div className="flex flex-col">
              <span className="text-2xl font-black tracking-tight text-white flex items-center">
                Fi<span className="gradient-text-pink">Live</span>
              </span>
              <span className="text-[10px] font-semibold text-slate-400 tracking-wider uppercase -mt-1">
                Entertainment
              </span>
            </div>
          </Link>

          {/* Desktop Navigation Links */}
          <nav className="hidden md:flex items-center gap-8">
            <Link
              href="#features"
              className="text-sm font-medium text-slate-300 hover:text-white transition-colors flex items-center gap-1.5"
            >
              Features
            </Link>
            <Link
              href="#party-rooms"
              className="text-sm font-medium text-slate-300 hover:text-white transition-colors flex items-center gap-1.5"
            >
              Party Rooms
            </Link>
            <Link
              href="#live-stream"
              className="text-sm font-medium text-slate-300 hover:text-white transition-colors flex items-center gap-1.5"
            >
              Live Stream
            </Link>
            <Link
              href="#gifting"
              className="text-sm font-medium text-slate-300 hover:text-white transition-colors flex items-center gap-1.5"
            >
              Gifting & Games
            </Link>
            <Link
              href="#how-it-works"
              className="text-sm font-medium text-slate-300 hover:text-white transition-colors"
            >
              How It Works
            </Link>
          </nav>

          {/* Download CTA Button */}
          <div className="hidden md:flex items-center gap-4">
            <a
              href="#download"
              className="relative group overflow-hidden rounded-full p-[1px] font-semibold text-sm transition-transform duration-300 hover:scale-105 active:scale-95"
            >
              <span className="absolute inset-0 bg-gradient-to-r from-[#FF2A6D] via-[#EF0083] to-[#8B5CF6] rounded-full animate-pulse-glow" />
              <span className="relative flex items-center gap-2 px-6 py-2.5 rounded-full bg-[#0F1422] group-hover:bg-[#0F1422]/70 text-white transition-colors">
                <Download className="w-4 h-4 text-[#FF2A6D]" />
                <span>Download App</span>
              </span>
            </a>
          </div>

          {/* Mobile Hamburger Button */}
          <div className="flex md:hidden">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-lg bg-white/5 border border-white/10 text-slate-200 hover:text-white focus:outline-none"
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>

        {/* Mobile Dropdown Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden mt-4 pt-4 pb-6 px-4 rounded-2xl glass-card border border-white/10 flex flex-col gap-4 animate-in fade-in slide-in-from-top-4 duration-200">
            <Link
              href="#features"
              onClick={() => setMobileMenuOpen(false)}
              className="text-base font-medium text-slate-300 hover:text-white py-2 flex items-center gap-3"
            >
              <Sparkles className="w-4 h-4 text-[#FF2A6D]" />
              Features
            </Link>
            <Link
              href="#party-rooms"
              onClick={() => setMobileMenuOpen(false)}
              className="text-base font-medium text-slate-300 hover:text-white py-2 flex items-center gap-3"
            >
              <Users className="w-4 h-4 text-[#8B5CF6]" />
              Party Rooms
            </Link>
            <Link
              href="#live-stream"
              onClick={() => setMobileMenuOpen(false)}
              className="text-base font-medium text-slate-300 hover:text-white py-2 flex items-center gap-3"
            >
              <Radio className="w-4 h-4 text-[#06B6D4]" />
              Live Stream
            </Link>
            <Link
              href="#gifting"
              onClick={() => setMobileMenuOpen(false)}
              className="text-base font-medium text-slate-300 hover:text-white py-2 flex items-center gap-3"
            >
              <Gift className="w-4 h-4 text-[#F59E0B]" />
              Gifts & Mini Games
            </Link>
            <Link
              href="#how-it-works"
              onClick={() => setMobileMenuOpen(false)}
              className="text-base font-medium text-slate-300 hover:text-white py-2 flex items-center gap-3"
            >
              <Gamepad2 className="w-4 h-4 text-emerald-400" />
              How It Works
            </Link>
            <a
              href="#download"
              onClick={() => setMobileMenuOpen(false)}
              className="w-full mt-2 py-3 rounded-xl bg-gradient-to-r from-[#FF2A6D] to-[#EF0083] text-center font-bold text-white shadow-lg shadow-[#EF0083]/30 flex items-center justify-center gap-2"
            >
              <Download className="w-4 h-4" />
              Download FiLive App
            </a>
          </div>
        )}
      </div>
    </header>
  );
}
`);

// 4. Hero Section Component
writeFile('src/components/Hero.tsx', `'use client';

import React from 'react';
import { Sparkles, Download, Play, Star, Users, Radio, Mic, Heart, Gift, Volume2, ShieldCheck } from 'lucide-react';
import PhoneMockup from './PhoneMockup';

export default function Hero() {
  return (
    <section className="relative pt-32 pb-20 md:pt-44 md:pb-32 overflow-hidden">
      {/* Background Ambient Glow Orbs */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-gradient-to-tr from-[#EF0083]/20 via-[#8B5CF6]/15 to-transparent rounded-full blur-[120px] pointer-events-none -z-10" />
      <div className="absolute top-12 left-10 w-[350px] h-[350px] bg-[#06B6D4]/10 rounded-full blur-[100px] pointer-events-none -z-10" />
      <div className="absolute bottom-10 right-10 w-[400px] h-[400px] bg-[#FF2A6D]/15 rounded-full blur-[110px] pointer-events-none -z-10" />

      {/* Grid Pattern Overlay */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] -z-10 pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">
          
          {/* Left Column: Headline, Copy & CTAs */}
          <div className="lg:col-span-7 flex flex-col items-start text-left">
            {/* Tag Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-gradient-to-r from-[#EF0083]/15 to-[#8B5CF6]/15 border border-[#EF0083]/30 backdrop-blur-md mb-6 animate-float">
              <span className="w-2 h-2 rounded-full bg-[#FF2A6D] animate-ping" />
              <span className="text-xs sm:text-sm font-semibold gradient-text-pink flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-[#FF2A6D]" />
                #1 Audio Party Room & Live Streaming App
              </span>
            </div>

            {/* Main Title */}
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-black tracking-tight text-white leading-[1.1] mb-6">
              Connect, Stream &amp; <br />
              <span className="gradient-text-pink">Celebrate</span> in{' '}
              <span className="relative inline-block">
                Real-Time
                <svg
                  className="absolute -bottom-2 left-0 w-full h-3 text-[#FF2A6D]/40 -z-10"
                  viewBox="0 0 100 20"
                  preserveAspectRatio="none"
                >
                  <path d="M0,15 Q50,0 100,15" fill="none" stroke="currentColor" strokeWidth="6" />
                </svg>
              </span>
            </h1>

            {/* Subheading */}
            <p className="text-base sm:text-lg text-slate-300 max-w-2xl mb-8 leading-relaxed font-normal">
              Step into the world of FiLive — where voice rooms come alive, talent shines on HD live streams, and 3D animated gifts spark excitement. Host parties with up to 12 open mic seats, play in-room games, and build your community.
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-wrap items-center gap-4 w-full sm:w-auto mb-10">
              {/* Google Play / Android CTA */}
              <a
                href="#download"
                className="flex items-center gap-3.5 px-6 py-3.5 rounded-2xl bg-gradient-to-r from-[#FF2A6D] via-[#EF0083] to-[#8B5CF6] text-white font-bold shadow-xl shadow-[#EF0083]/25 hover:shadow-[#EF0083]/50 hover:scale-105 active:scale-95 transition-all duration-300"
              >
                <div className="w-7 h-7 bg-white/20 rounded-lg flex items-center justify-center">
                  <Play className="w-4 h-4 fill-white text-white ml-0.5" />
                </div>
                <div className="flex flex-col text-left">
                  <span className="text-[10px] text-white/80 font-medium uppercase tracking-wider">Download On</span>
                  <span className="text-sm font-extrabold leading-tight">Google Play</span>
                </div>
              </a>

              {/* Direct APK Download */}
              <a
                href="#download"
                className="flex items-center gap-3.5 px-6 py-3.5 rounded-2xl glass-card text-white font-bold hover:border-[#EF0083]/50 hover:bg-white/[0.08] hover:scale-105 active:scale-95 transition-all duration-300"
              >
                <div className="w-7 h-7 bg-white/10 rounded-lg flex items-center justify-center">
                  <Download className="w-4 h-4 text-[#06B6D4]" />
                </div>
                <div className="flex flex-col text-left">
                  <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">Fast Direct</span>
                  <span className="text-sm font-extrabold leading-tight">Android APK</span>
                </div>
              </a>
            </div>

            {/* Trust Metric Badges */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 pt-6 border-t border-white/10 w-full">
              <div>
                <p className="text-2xl sm:text-3xl font-extrabold text-white">100K+</p>
                <p className="text-xs text-slate-400 font-medium mt-0.5">Active Users</p>
              </div>
              <div>
                <p className="text-2xl sm:text-3xl font-extrabold text-white">50K+</p>
                <p className="text-xs text-slate-400 font-medium mt-0.5">Daily Streams</p>
              </div>
              <div>
                <div className="flex items-center gap-1">
                  <p className="text-2xl sm:text-3xl font-extrabold text-white">4.8</p>
                  <Star className="w-5 h-5 fill-amber-400 text-amber-400" />
                </div>
                <p className="text-xs text-slate-400 font-medium mt-0.5">App Store Rating</p>
              </div>
              <div>
                <p className="text-2xl sm:text-3xl font-extrabold text-white">150+</p>
                <p className="text-xs text-slate-400 font-medium mt-0.5">Countries</p>
              </div>
            </div>
          </div>

          {/* Right Column: 3D Interactive Phone Mockup */}
          <div className="lg:col-span-5 flex justify-center items-center relative">
            <PhoneMockup />
          </div>

        </div>
      </div>
    </section>
  );
}
`);

// 5. PhoneMockup Component
writeFile('src/components/PhoneMockup.tsx', `'use client';

import React from 'react';
import { Mic, Volume2, Heart, Gift, Users, Sparkles, MessageCircle, Crown, Flame } from 'lucide-react';

export default function PhoneMockup() {
  return (
    <div className="relative w-full max-w-[340px] sm:max-w-[370px] aspect-[9/18.5] rounded-[48px] p-3.5 bg-gradient-to-b from-slate-700/60 via-slate-800/40 to-slate-900/80 shadow-2xl shadow-purple-950/50 border border-white/20 backdrop-blur-xl">
      {/* Phone Screen Container */}
      <div className="relative w-full h-full rounded-[38px] overflow-hidden bg-gradient-to-b from-[#140C29] via-[#0E091E] to-[#07090E] border border-white/10 flex flex-col justify-between p-4">
        
        {/* Dynamic Island / Speaker notch */}
        <div className="absolute top-2.5 left-1/2 -translate-x-1/2 w-28 h-4 bg-black rounded-full flex items-center justify-center gap-2 z-30">
          <div className="w-2 h-2 rounded-full bg-slate-800" />
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
        </div>

        {/* Top Header Row inside App */}
        <div className="pt-5 flex items-center justify-between z-20">
          <div className="flex items-center gap-2 bg-white/10 backdrop-blur-md px-2.5 py-1 rounded-full border border-white/10">
            <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-[#FF2A6D] to-[#8B5CF6] flex items-center justify-center text-[10px] font-bold text-white">
              Y
            </div>
            <div className="flex flex-col">
              <span className="text-[11px] font-bold text-white flex items-center gap-1">
                yashu <Crown className="w-3 h-3 text-amber-400 fill-amber-400" />
              </span>
              <span className="text-[9px] text-emerald-400 font-semibold flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-ping" />
                Live Party #1000031
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 bg-black/40 px-2.5 py-1 rounded-full border border-white/10">
            <Users className="w-3.5 h-3.5 text-slate-300" />
            <span className="text-[11px] font-bold text-white">1,482</span>
          </div>
        </div>

        {/* Floating SVGA Gift Combo Banner */}
        <div className="my-2 bg-gradient-to-r from-[#FF2A6D]/80 via-[#EF0083]/90 to-[#8B5CF6]/80 p-2 rounded-2xl border border-white/30 shadow-lg shadow-[#EF0083]/40 flex items-center justify-between animate-float z-20">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center text-lg shadow-inner">
              🚀
            </div>
            <div className="flex flex-col">
              <span className="text-[11px] font-black text-white flex items-center gap-1">
                Super Rocket Combo! <Flame className="w-3 h-3 text-amber-300 fill-amber-300" />
              </span>
              <span className="text-[9px] text-amber-200 font-bold">Rahul sent to All 6 Seats!</span>
            </div>
          </div>
          <div className="px-2 py-0.5 rounded-full bg-black/40 text-[11px] font-black text-amber-300">
            x99
          </div>
        </div>

        {/* 6 Party Audio Seats Grid */}
        <div className="grid grid-cols-3 gap-2.5 my-auto z-20">
          {[
            { name: 'Anya', seat: '1', mic: true, avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=120' },
            { name: 'Rahul', seat: '2', mic: true, avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=120' },
            { name: 'Priya', seat: '3', mic: false, avatar: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=120' },
            { name: 'Aarav', seat: '4', mic: true, avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=120' },
            { name: 'Neha', seat: '5', mic: false, avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120' },
            { name: 'Vikram', seat: '6', mic: true, avatar: 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=120' },
          ].map((user, i) => (
            <div key={i} className="flex flex-col items-center group">
              <div className="relative">
                {/* Active Mic Pulsing Ring */}
                {user.mic && (
                  <span className="absolute -inset-1 rounded-full bg-emerald-500/50 animate-ping opacity-75" />
                )}
                <div
                  className={\`relative w-14 h-14 rounded-full p-[2px] \${
                    user.mic
                      ? 'bg-gradient-to-tr from-emerald-400 to-teal-300'
                      : 'bg-white/20'
                  }\`}
                >
                  <img
                    src={user.avatar}
                    alt={user.name}
                    className="w-full h-full rounded-full object-cover"
                  />
                  {/* Seat Number Badge */}
                  <span className="absolute -top-1 -left-1 px-1.5 py-0.2 bg-[#EF0083] text-[9px] font-black text-white rounded-full border border-black shadow">
                    #{user.seat}
                  </span>
                  {/* Mic status badge */}
                  <span
                    className={\`absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center border border-black shadow \${
                      user.mic ? 'bg-emerald-500 text-black' : 'bg-rose-500 text-white'
                    }\`}
                  >
                    <Mic className="w-2.5 h-2.5" />
                  </span>
                </div>
              </div>
              <span className="text-[10px] font-semibold text-slate-200 mt-1 truncate max-w-[60px]">
                {user.name}
              </span>
            </div>
          ))}
        </div>

        {/* Live Chat Ticker */}
        <div className="flex flex-col gap-1.5 my-2 z-20">
          <div className="px-2.5 py-1 rounded-xl bg-black/40 backdrop-blur-md border border-white/5 flex items-center gap-1.5 text-[10px]">
            <span className="font-bold text-[#FF2A6D]">Anya:</span>
            <span className="text-slate-200">Thanks for the super rocket!! 💖</span>
          </div>
          <div className="px-2.5 py-1 rounded-xl bg-black/40 backdrop-blur-md border border-white/5 flex items-center gap-1.5 text-[10px]">
            <span className="font-bold text-amber-400">Vikram:</span>
            <span className="text-slate-200">Play next song please 🎶</span>
          </div>
        </div>

        {/* Bottom Bar: Input & Gift Button */}
        <div className="flex items-center justify-between gap-2 pt-2 border-t border-white/10 z-20">
          <div className="flex-1 bg-white/10 px-3 py-1.5 rounded-full flex items-center gap-1.5 text-slate-400 text-[11px]">
            <MessageCircle className="w-3.5 h-3.5" />
            <span>Say something...</span>
          </div>
          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-[#FF2A6D] to-[#EF0083] flex items-center justify-center shadow-lg shadow-[#EF0083]/40 cursor-pointer hover:scale-110 transition-transform">
            <Gift className="w-4 h-4 text-white" />
          </div>
          <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-slate-300">
            <Volume2 className="w-4 h-4" />
          </div>
        </div>

        {/* Glowing Background Radial */}
        <div className="absolute inset-0 bg-radial from-purple-900/30 via-transparent to-black pointer-events-none z-10" />
      </div>

      {/* Floating Badges outside phone */}
      <div className="absolute -top-4 -right-4 glass-card px-3.5 py-1.5 rounded-2xl flex items-center gap-2 border border-white/20 shadow-xl animate-float">
        <Sparkles className="w-4 h-4 text-[#FF2A6D]" />
        <span className="text-xs font-bold text-white">Ultra Low-Latency</span>
      </div>

      <div className="absolute -bottom-4 -left-4 glass-card px-3.5 py-1.5 rounded-2xl flex items-center gap-2 border border-white/20 shadow-xl animate-float" style={{ animationDelay: '1.5s' }}>
        <span className="text-xs font-bold text-emerald-400">🟢 12 Active Seats</span>
      </div>
    </div>
  );
}
`);

// 6. Features Grid Section
writeFile('src/components/Features.tsx', `'use client';

import React from 'react';
import { Users, Radio, Gift, Gamepad2, PhoneCall, Trophy, Shield, Sparkles } from 'lucide-react';

const features = [
  {
    icon: Users,
    title: 'Multi-Seat Party Rooms',
    description:
      'Host high-fidelity audio rooms with up to 8 or 12 active mic seats. Seamlessly manage mics, invite guests, lock seats, and set personalized theme backgrounds.',
    gradient: 'from-[#FF2A6D] to-[#EF0083]',
    glowColor: 'hover:border-[#EF0083]/50',
    tag: 'Audio Rooms',
  },
  {
    icon: Radio,
    title: 'HD Live Video Streaming',
    description:
      'Broadcast your talents in crisp 1080p video with real-time Agora RTC streaming. Engage with audience comments, instant beauty filters, and interactive PK battles.',
    gradient: 'from-[#8B5CF6] to-[#6366F1]',
    glowColor: 'hover:border-[#8B5CF6]/50',
    tag: 'Broadcasting',
  },
  {
    icon: Gift,
    title: '3D & SVGA Animated Gifts',
    description:
      'Send mesmerizing full-screen animated gifts, luxury supercars, rockets, and lucky combos. Multi-recipient gifting allows sending to all active mic users in one tap!',
    gradient: 'from-[#F59E0B] to-[#F97316]',
    glowColor: 'hover:border-[#F59E0B]/50',
    tag: 'Virtual Gifting',
  },
  {
    icon: Gamepad2,
    title: 'Interactive In-Room Mini Games',
    description:
      'Play multiplayer casual games like Ludo, Lucky Wheel, and card games right inside the party room without interrupting your voice conversation.',
    gradient: 'from-[#06B6D4] to-[#3B82F6]',
    glowColor: 'hover:border-[#06B6D4]/50',
    tag: 'Social Gaming',
  },
  {
    icon: PhoneCall,
    title: '1-on-1 Voice & Video Calls',
    description:
      'Connect privately with creators and friends. Enjoy encrypted, crystal-clear 1-on-1 calls with real-time beauty effects and custom call rates.',
    gradient: 'from-emerald-400 to-teal-500',
    glowColor: 'hover:border-emerald-500/50',
    tag: 'Private Calls',
  },
  {
    icon: Trophy,
    title: 'Creator Economy & Host Agency',
    description:
      'Turn your passion into income! Earn coins and beans from fan gifts, level up your Charm & Wealth badges, track daily earnings, and withdraw securely.',
    gradient: 'from-[#EC4899] to-[#8B5CF6]',
    glowColor: 'hover:border-[#EC4899]/50',
    tag: 'Monetization',
  },
];

export default function Features() {
  return (
    <section id="features" className="py-24 relative overflow-hidden">
      {/* Background radial gradient */}
      <div className="absolute top-1/2 right-0 w-[500px] h-[500px] bg-[#8B5CF6]/10 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-[#EF0083]/10 rounded-full blur-[140px] pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Heading */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-white/5 border border-white/10 text-xs font-semibold text-[#FF2A6D] mb-4">
            <Sparkles className="w-3.5 h-3.5" />
            CORE CAPABILITIES
          </div>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-black text-white tracking-tight mb-4">
            Everything You Need to <span className="gradient-text-pink">Connect &amp; Shine</span>
          </h2>
          <p className="text-slate-400 text-base sm:text-lg">
            Built from the ground up for creators, gamers, and party lovers. Explore the high-performance features that power the FiLive social ecosystem.
          </p>
        </div>

        {/* Features 6-Card Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((feat, index) => {
            const Icon = feat.icon;
            return (
              <div
                key={index}
                className={\`glass-card glass-card-hover p-8 rounded-3xl relative overflow-hidden group border border-white/10 \${feat.glowColor}\`}
              >
                {/* Top Corner Badge */}
                <div className="flex items-center justify-between mb-6">
                  <div
                    className={\`w-14 h-14 rounded-2xl bg-gradient-to-tr \${feat.gradient} flex items-center justify-center shadow-lg shadow-black/40 group-hover:scale-110 transition-transform duration-300\`}
                  >
                    <Icon className="w-7 h-7 text-white" />
                  </div>
                  <span className="text-xs font-bold text-slate-400 bg-white/5 px-3 py-1 rounded-full border border-white/5">
                    {feat.tag}
                  </span>
                </div>

                <h3 className="text-xl font-bold text-white mb-3 group-hover:text-[#FF2A6D] transition-colors">
                  {feat.title}
                </h3>
                <p className="text-sm text-slate-400 leading-relaxed font-normal">
                  {feat.description}
                </p>

                {/* Subtle Hover Gradient Glow */}
                <div
                  className={\`absolute -right-16 -bottom-16 w-32 h-32 bg-gradient-to-tr \${feat.gradient} opacity-0 group-hover:opacity-15 rounded-full blur-2xl transition-opacity duration-500\`}
                />
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
`);

// 7. Interactive Showcase Section
writeFile('src/components/InteractiveShowcase.tsx', `'use client';

import React, { useState } from 'react';
import { Users, Radio, Gift, Gamepad2, Crown, CheckCircle2, ArrowRight } from 'lucide-react';

const tabs = [
  {
    id: 'party',
    name: 'Party Audio Rooms',
    icon: Users,
    headline: 'Crystal-Clear Audio with Multi-Seat Mic Freedom',
    description:
      'Hop on open audio seats with friends across the world. Control your mic, play background songs from your local library, pin your room to trending charts, and manage room moderators with simple host controls.',
    points: [
      'Up to 12 active high-definition audio seats',
      'Individual & host "Mute All" / "Unmute All" controls',
      'Custom room wallpapers, badges & entry effects',
      'Seat lock, admin delegation & kick controls',
    ],
    image: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=800&auto=format&fit=crop',
    badge: '🎙️ Live Audio',
  },
  {
    id: 'live',
    name: 'HD Live Video',
    icon: Radio,
    headline: 'Real-Time HD Video Broadcast with Instant Reaction',
    description:
      'Go live in seconds and broadcast to thousands of fans. Take advantage of low latency video streaming powered by Agora RTC, interactive comment streams, audience ranking boards, and beauty enhancement filters.',
    points: [
      'Sub-second real-time video delivery',
      'Dynamic audience viewer stack with entrance animations',
      'Daily charm rankings & revenue tracking',
      'Interactive comment stream with VIP badges',
    ],
    image: 'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=800&auto=format&fit=crop',
    badge: '📹 Live Video',
  },
  {
    id: 'gifting',
    name: 'Animated SVGA Gifts',
    icon: Gift,
    headline: 'Full-Screen SVGA Effects with Multi-Recipient Power',
    description:
      'Reward your favorite creators with jaw-dropping animated gifts. With FiLive unique Multi-Recipient gifting, you can select "All Active Mics" or "All Room Members" to send gifts simultaneously with live coin total calculations!',
    points: [
      'Stunning SVGA rocket, supercar & lucky gift animations',
      'Multi-Recipient "Mic All" and "Home All" selection',
      'Live total coin calculation & instant gift combo counters',
      'Generous rewards & host level progression',
    ],
    image: 'https://images.unsplash.com/photo-1513151233558-d860c5398176?w=800&auto=format&fit=crop',
    badge: '🎁 Gifting System',
  },
  {
    id: 'games',
    name: 'In-Room Mini Games',
    icon: Gamepad2,
    headline: 'Real-Time Social Games While Voice Chatting',
    description:
      'Spice up your parties with integrated social mini games. Play classic board games like Ludo, spin the Lucky Wheel, and challenge room participants without leaving your voice call.',
    points: [
      'Multiplayer Ludo & casual party games',
      'Spin the Lucky Wheel for coins and surprises',
      'Play together while speaking on active mic',
      'Leaderboards and win-streak celebrations',
    ],
    image: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop',
    badge: '🎲 Social Gaming',
  },
];

export default function InteractiveShowcase() {
  const [activeTab, setActiveTab] = useState('party');
  const current = tabs.find((t) => t.id === activeTab) || tabs[0];

  return (
    <section id="party-rooms" className="py-24 relative overflow-hidden bg-gradient-to-b from-transparent via-[#0B0F19]/60 to-transparent">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Section Title */}
        <div className="text-center max-w-3xl mx-auto mb-14">
          <span className="text-xs font-bold text-[#FF2A6D] uppercase tracking-wider bg-[#FF2A6D]/10 px-4 py-1.5 rounded-full border border-[#FF2A6D]/20">
            ENTERTAINMENT REDEFINED
          </span>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-black text-white tracking-tight mt-4 mb-4">
            Step Into the <span className="gradient-text-pink">World of FiLive</span>
          </h2>
          <p className="text-slate-400 text-base sm:text-lg">
            Switch between interactive experiences to see how FiLive brings creators, listeners, and gamers together in real time.
          </p>
        </div>

        {/* Navigation Tabs */}
        <div className="flex flex-wrap items-center justify-center gap-3 mb-14">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isSelected = tab.id === activeTab;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={\`flex items-center gap-2.5 px-6 py-3 rounded-2xl font-bold text-sm transition-all duration-300 \${
                  isSelected
                    ? 'bg-gradient-to-r from-[#FF2A6D] to-[#EF0083] text-white shadow-lg shadow-[#EF0083]/30 scale-105'
                    : 'glass-card text-slate-300 hover:text-white hover:bg-white/10'
                }\`}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.name}</span>
              </button>
            );
          })}
        </div>

        {/* Tab Content Panel */}
        <div className="glass-card rounded-3xl p-6 sm:p-10 lg:p-12 border border-white/10 shadow-2xl relative overflow-hidden">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
            
            {/* Left Column: Description & Bullet Points */}
            <div className="lg:col-span-7 flex flex-col items-start text-left">
              <span className="px-3.5 py-1 rounded-full text-xs font-bold bg-white/10 text-emerald-400 border border-white/10 mb-4">
                {current.badge}
              </span>
              <h3 className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-white mb-5 leading-tight">
                {current.headline}
              </h3>
              <p className="text-slate-300 text-base leading-relaxed mb-8">
                {current.description}
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full mb-8">
                {current.points.map((pt, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 text-[#FF2A6D] shrink-0 mt-0.5" />
                    <span className="text-sm font-medium text-slate-200">{pt}</span>
                  </div>
                ))}
              </div>

              <a
                href="#download"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 text-white font-bold text-sm transition-all duration-200"
              >
                <span>Try this in FiLive App</span>
                <ArrowRight className="w-4 h-4" />
              </a>
            </div>

            {/* Right Column: Visual Mockup */}
            <div className="lg:col-span-5 relative">
              <div className="relative rounded-2xl overflow-hidden aspect-[4/3] border border-white/15 shadow-2xl group">
                <img
                  src={current.image}
                  alt={current.name}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#07090E] via-transparent to-black/30" />
                
                {/* Overlay Badge */}
                <div className="absolute bottom-4 left-4 right-4 p-4 rounded-xl bg-black/60 backdrop-blur-md border border-white/15 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-3 rounded-full bg-emerald-400 animate-ping" />
                    <span className="text-xs font-bold text-white">Live Real-Time Sync</span>
                  </div>
                  <span className="text-xs font-bold text-[#FF2A6D]">Agora RTC HD</span>
                </div>
              </div>
            </div>

          </div>
        </div>

      </div>
    </section>
  );
}
`);

// 8. How It Works Section
writeFile('src/components/HowItWorks.tsx', `'use client';

import React from 'react';
import { DownloadCloud, UserCheck, Flame, Sparkles } from 'lucide-react';

const steps = [
  {
    step: '01',
    icon: DownloadCloud,
    title: 'Download & Quick Sign-In',
    description: 'Get FiLive from Google Play or download the direct APK. Complete your profile in seconds with simple phone or social authentication.',
    gradient: 'from-[#FF2A6D] to-[#EF0083]',
  },
  {
    step: '02',
    icon: UserCheck,
    title: 'Explore or Host a Room',
    description: 'Hop into trending party rooms, take an open microphone seat, or start your own HD live broadcast with 1 simple tap.',
    gradient: 'from-[#8B5CF6] to-[#6366F1]',
  },
  {
    step: '03',
    icon: Flame,
    title: 'Interact, Gift & Level Up',
    description: 'Send SVGA animated gifts, climb daily charm leaderboards, earn coins and beans, and build a thriving community.',
    gradient: 'from-[#06B6D4] to-emerald-400',
  },
];

export default function HowItWorks() {
  return (
    <section id="how-it-works" className="py-24 relative overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Section Heading */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <span className="text-xs font-bold text-[#06B6D4] uppercase tracking-wider bg-[#06B6D4]/10 px-4 py-1.5 rounded-full border border-[#06B6D4]/20">
            SIMPLE ONBOARDING
          </span>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-black text-white tracking-tight mt-4 mb-4">
            Get Started in <span className="gradient-text-cyan">3 Easy Steps</span>
          </h2>
          <p className="text-slate-400 text-base sm:text-lg">
            Joining the FiLive family takes less than 60 seconds. Start streaming and voice chatting today!
          </p>
        </div>

        {/* Steps Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
          {steps.map((st, index) => {
            const Icon = st.icon;
            return (
              <div
                key={index}
                className="glass-card p-8 rounded-3xl border border-white/10 relative overflow-hidden flex flex-col justify-between group hover:border-white/30 transition-all duration-300"
              >
                <div>
                  <div className="flex items-center justify-between mb-8">
                    <span className="text-4xl font-black text-white/20 group-hover:text-white/40 transition-colors">
                      {st.step}
                    </span>
                    <div className={\`w-12 h-12 rounded-xl bg-gradient-to-tr \${st.gradient} flex items-center justify-center shadow-lg shadow-black/40\`}>
                      <Icon className="w-6 h-6 text-white" />
                    </div>
                  </div>

                  <h3 className="text-xl font-bold text-white mb-3">
                    {st.title}
                  </h3>
                  <p className="text-sm text-slate-400 leading-relaxed font-normal">
                    {st.description}
                  </p>
                </div>

                <div className="mt-8 pt-4 border-t border-white/5 flex items-center gap-2 text-xs font-semibold text-slate-400">
                  <Sparkles className="w-3.5 h-3.5 text-[#FF2A6D]" />
                  <span>Instant Setup</span>
                </div>
              </div>
            );
          })}
        </div>

      </div>
    </section>
  );
}
`);

// 9. Download CTA Section
writeFile('src/components/DownloadCTA.tsx', `'use client';

import React from 'react';
import { Download, Play, Apple, QrCode, Sparkles, ShieldCheck } from 'lucide-react';

export default function DownloadCTA() {
  return (
    <section id="download" className="py-24 relative overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        <div className="relative rounded-[40px] overflow-hidden p-8 sm:p-14 lg:p-16 bg-gradient-to-tr from-[#1B0A2A] via-[#110D25] to-[#0A1224] border border-white/15 shadow-2xl">
          {/* Ambient Lighting Orbs inside banner */}
          <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-[#EF0083]/25 rounded-full blur-[100px] pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-[#8B5CF6]/20 rounded-full blur-[100px] pointer-events-none" />

          <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
            
            {/* Left Column: Heading and Download buttons */}
            <div className="lg:col-span-8 flex flex-col items-start text-left">
              <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-white/10 border border-white/15 text-xs font-bold text-white mb-6">
                <Sparkles className="w-3.5 h-3.5 text-[#FF2A6D]" />
                AVAILABLE NOW ON ANDROID &amp; IOS
              </div>

              <h2 className="text-3xl sm:text-4xl md:text-5xl font-black text-white tracking-tight mb-6 leading-tight">
                Ready to Join the <br />
                <span className="gradient-text-pink">FiLive Entertainment</span> Revolution?
              </h2>

              <p className="text-slate-300 text-base sm:text-lg max-w-xl mb-10 leading-relaxed font-normal">
                Download the official FiLive app now. Jump into active voice rooms, send spectacular 3D gifts, play games, and meet incredible people from around the globe.
              </p>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-4 w-full sm:w-auto">
                {/* Google Play */}
                <a
                  href="https://play.google.com/store"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3.5 px-6 py-3.5 rounded-2xl bg-white text-black font-bold shadow-xl hover:bg-slate-100 hover:scale-105 active:scale-95 transition-all duration-300"
                >
                  <Play className="w-6 h-6 fill-black text-black" />
                  <div className="flex flex-col text-left">
                    <span className="text-[10px] text-slate-600 font-semibold uppercase tracking-wider">Get It On</span>
                    <span className="text-sm font-extrabold leading-tight">Google Play</span>
                  </div>
                </a>

                {/* Apple App Store */}
                <a
                  href="https://apple.com/app-store"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3.5 px-6 py-3.5 rounded-2xl glass-card text-white font-bold hover:border-white/40 hover:bg-white/10 hover:scale-105 active:scale-95 transition-all duration-300"
                >
                  <Apple className="w-6 h-6 fill-white text-white" />
                  <div className="flex flex-col text-left">
                    <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Download On</span>
                    <span className="text-sm font-extrabold leading-tight">App Store</span>
                  </div>
                </a>

                {/* Direct APK */}
                <a
                  href="/download/filive.apk"
                  className="flex items-center gap-3 px-6 py-3.5 rounded-2xl bg-gradient-to-r from-[#FF2A6D] to-[#EF0083] text-white font-bold shadow-lg shadow-[#EF0083]/30 hover:scale-105 active:scale-95 transition-all duration-300"
                >
                  <Download className="w-5 h-5" />
                  <span>Direct APK Download</span>
                </a>
              </div>

              <div className="flex items-center gap-4 mt-8 text-xs text-slate-400">
                <span className="flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  100% Safe &amp; Verified APK
                </span>
                <span>•</span>
                <span>Latest Version 2.4.0</span>
                <span>•</span>
                <span>Requires Android 6.0+ / iOS 13+</span>
              </div>
            </div>

            {/* Right Column: Scan to Download QR Code Card */}
            <div className="lg:col-span-4 flex justify-center">
              <div className="glass-card p-6 rounded-3xl border border-white/20 shadow-2xl flex flex-col items-center text-center max-w-[260px]">
                <div className="w-44 h-44 bg-white p-3 rounded-2xl shadow-inner flex items-center justify-center">
                  {/* Generated QR Code Graphic */}
                  <img
                    src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=https://filive.in/download&color=110D25"
                    alt="Scan to Download FiLive"
                    className="w-full h-full object-contain"
                  />
                </div>
                <span className="text-sm font-bold text-white mt-4 flex items-center gap-1.5">
                  <QrCode className="w-4 h-4 text-[#FF2A6D]" />
                  Scan to Download
                </span>
                <span className="text-xs text-slate-400 mt-1">
                  Point your phone camera to install instantly
                </span>
              </div>
            </div>

          </div>
        </div>

      </div>
    </section>
  );
}
`);

// 10. Footer Component
writeFile('src/components/Footer.tsx', `'use client';

import React from 'react';
import Link from 'next/link';
import { Radio, Heart, Shield, Mail, Phone, MapPin, Send } from 'lucide-react';

export default function Footer() {
  return (
    <footer className="border-t border-white/10 bg-[#07090E] pt-16 pb-12 relative overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-10 mb-14">
          
          {/* Col 1: Brand Info */}
          <div className="lg:col-span-2 flex flex-col items-start">
            <Link href="/" className="flex items-center gap-2.5 mb-4 group">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-[#FF2A6D] to-[#8B5CF6] flex items-center justify-center shadow-lg shadow-[#EF0083]/30">
                <Radio className="w-5 h-5 text-white" />
              </div>
              <span className="text-2xl font-black text-white">
                Fi<span className="gradient-text-pink">Live</span>
              </span>
            </Link>

            <p className="text-sm text-slate-400 leading-relaxed max-w-sm mb-6">
              FiLive is the premier next-generation social live streaming and audio party room entertainment platform. Connect, chat, gift, and play in real-time.
            </p>

            <div className="flex items-center gap-3">
              <a
                href="https://facebook.com"
                target="_blank"
                rel="noreferrer"
                className="w-9 h-9 rounded-full bg-white/5 hover:bg-white/15 border border-white/10 flex items-center justify-center text-slate-300 hover:text-white transition-colors"
                aria-label="Facebook"
              >
                f
              </a>
              <a
                href="https://instagram.com"
                target="_blank"
                rel="noreferrer"
                className="w-9 h-9 rounded-full bg-white/5 hover:bg-white/15 border border-white/10 flex items-center justify-center text-slate-300 hover:text-white transition-colors"
                aria-label="Instagram"
              >
                ig
              </a>
              <a
                href="https://youtube.com"
                target="_blank"
                rel="noreferrer"
                className="w-9 h-9 rounded-full bg-white/5 hover:bg-white/15 border border-white/10 flex items-center justify-center text-slate-300 hover:text-white transition-colors"
                aria-label="YouTube"
              >
                yt
              </a>
              <a
                href="https://t.me"
                target="_blank"
                rel="noreferrer"
                className="w-9 h-9 rounded-full bg-white/5 hover:bg-white/15 border border-white/10 flex items-center justify-center text-slate-300 hover:text-white transition-colors"
                aria-label="Telegram"
              >
                tg
              </a>
            </div>
          </div>

          {/* Col 2: Product Links */}
          <div>
            <h4 className="text-sm font-bold uppercase tracking-wider text-white mb-4">Product</h4>
            <ul className="flex flex-col gap-2.5 text-sm text-slate-400">
              <li>
                <Link href="#party-rooms" className="hover:text-white transition-colors">
                  Audio Party Rooms
                </Link>
              </li>
              <li>
                <Link href="#live-stream" className="hover:text-white transition-colors">
                  HD Live Video
                </Link>
              </li>
              <li>
                <Link href="#gifting" className="hover:text-white transition-colors">
                  3D SVGA Gifting
                </Link>
              </li>
              <li>
                <Link href="#features" className="hover:text-white transition-colors">
                  In-Room Games
                </Link>
              </li>
              <li>
                <Link href="#download" className="hover:text-white transition-colors">
                  Download FiLive App
                </Link>
              </li>
            </ul>
          </div>

          {/* Col 3: Company */}
          <div>
            <h4 className="text-sm font-bold uppercase tracking-wider text-white mb-4">Company</h4>
            <ul className="flex flex-col gap-2.5 text-sm text-slate-400">
              <li>
                <Link href="/about" className="hover:text-white transition-colors">
                  About Us
                </Link>
              </li>
              <li>
                <Link href="/guidelines" className="hover:text-white transition-colors">
                  Community Rules
                </Link>
              </li>
              <li>
                <Link href="/creator-agency" className="hover:text-white transition-colors">
                  Become a Host / Agency
                </Link>
              </li>
              <li>
                <Link href="/safety" className="hover:text-white transition-colors">
                  Safety Center
                </Link>
              </li>
            </ul>
          </div>

          {/* Col 4: Legal & Policies */}
          <div>
            <h4 className="text-sm font-bold uppercase tracking-wider text-white mb-4">Legal</h4>
            <ul className="flex flex-col gap-2.5 text-sm text-slate-400">
              <li>
                <Link href="/privacy" className="hover:text-white transition-colors">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link href="/terms" className="hover:text-white transition-colors">
                  Terms of Service
                </Link>
              </li>
              <li>
                <Link href="/refund" className="hover:text-white transition-colors">
                  Coins &amp; Refund Policy
                </Link>
              </li>
              <li>
                <Link href="/contact" className="hover:text-white transition-colors">
                  Contact &amp; Grievance
                </Link>
              </li>
            </ul>
          </div>

        </div>

        {/* Bottom Bar */}
        <div className="pt-8 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <p>© 2026 FiLive (filive.in). All rights reserved.</p>
          <div className="flex items-center gap-6">
            <Link href="/privacy" className="hover:text-slate-300 transition-colors">
              Privacy Policy
            </Link>
            <Link href="/terms" className="hover:text-slate-300 transition-colors">
              Terms of Service
            </Link>
            <a href="mailto:support@filive.in" className="hover:text-slate-300 transition-colors">
              support@filive.in
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
`);

// 11. Main page.tsx
writeFile('src/app/page.tsx', `import React from 'react';
import Navbar from '@/components/Navbar';
import Hero from '@/components/Hero';
import Features from '@/components/Features';
import InteractiveShowcase from '@/components/InteractiveShowcase';
import HowItWorks from '@/components/HowItWorks';
import DownloadCTA from '@/components/DownloadCTA';
import Footer from '@/components/Footer';

export default function HomePage() {
  return (
    <main className="min-h-screen bg-[#07090E] text-slate-100 relative">
      <Navbar />
      <Hero />
      <Features />
      <InteractiveShowcase />
      <HowItWorks />
      <DownloadCTA />
      <Footer />
    </main>
  );
}
`);

// 12. Privacy Policy Page
writeFile('src/app/privacy/page.tsx', `import React from 'react';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

export default function PrivacyPolicyPage() {
  return (
    <main className="min-h-screen bg-[#07090E] text-slate-100">
      <Navbar />
      <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-36 pb-20">
        <h1 className="text-3xl sm:text-5xl font-black text-white mb-4">
          Privacy <span className="gradient-text-pink">Policy</span>
        </h1>
        <p className="text-sm text-slate-400 mb-8">Last Updated: October 2026</p>

        <div className="glass-card p-8 sm:p-12 rounded-3xl border border-white/10 space-y-6 text-slate-300 leading-relaxed text-sm sm:text-base">
          <h2 className="text-xl font-bold text-white">1. Introduction</h2>
          <p>
            Welcome to FiLive (filive.in). We respect your privacy and are committed to protecting the personal information you share with us. This Privacy Policy explains how we collect, use, disclose, and safeguard your data when you use the FiLive mobile application and website.
          </p>

          <h2 className="text-xl font-bold text-white">2. Information We Collect</h2>
          <ul className="list-disc pl-5 space-y-2">
            <li><strong>Account Information:</strong> Name, mobile phone number, profile photo, bio, and gender when you register.</li>
            <li><strong>Audio & Video Data:</strong> Streams and voice interactions that you broadcast during public sessions.</li>
            <li><strong>Transactions & Coins:</strong> Records of coin purchases, gifts sent and received, and creator bean balances.</li>
            <li><strong>Device & Usage Data:</strong> Device model, OS version, IP address, and FCM notification tokens.</li>
          </ul>

          <h2 className="text-xl font-bold text-white">3. How We Use Your Information</h2>
          <p>
            We use your data to facilitate live streaming, multi-seat party rooms, virtual gifting, security verification, content moderation, customer support, and system performance optimizations.
          </p>

          <h2 className="text-xl font-bold text-white">4. Data Security</h2>
          <p>
            We implement industry-standard encryption protocols and secure storage measures to safeguard your personal data from unauthorized access, alteration, or disclosure.
          </p>

          <h2 className="text-xl font-bold text-white">5. Contact Us</h2>
          <p>
            If you have any questions or grievances regarding this Privacy Policy, please contact our Data Protection Team at <span className="text-[#FF2A6D] font-bold">support@filive.in</span>.
          </p>
        </div>
      </div>
      <Footer />
    </main>
  );
}
`);

// 13. Terms of Service Page
writeFile('src/app/terms/page.tsx', `import React from 'react';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-[#07090E] text-slate-100">
      <Navbar />
      <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-36 pb-20">
        <h1 className="text-3xl sm:text-5xl font-black text-white mb-4">
          Terms of <span className="gradient-text-pink">Service</span>
        </h1>
        <p className="text-sm text-slate-400 mb-8">Last Updated: October 2026</p>

        <div className="glass-card p-8 sm:p-12 rounded-3xl border border-white/10 space-y-6 text-slate-300 leading-relaxed text-sm sm:text-base">
          <h2 className="text-xl font-bold text-white">1. Agreement to Terms</h2>
          <p>
            By accessing or using the FiLive application or website (filive.in), you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use our services.
          </p>

          <h2 className="text-xl font-bold text-white">2. User Eligibility & Code of Conduct</h2>
          <p>
            You must be at least 18 years old to use FiLive. Users agree not to post, broadcast, or transmit any illegal, obscene, harassing, defamatory, or copyright-infringing content. Violation of community standards results in immediate account suspension.
          </p>

          <h2 className="text-xl font-bold text-white">3. Virtual Currency & Gifting</h2>
          <p>
            Coins, beans, and virtual gifts are digital items meant for social entertainment within FiLive. All coin purchases are final and non-refundable. Host earnings and bean withdrawals are subject to verification and platform policies.
          </p>

          <h2 className="text-xl font-bold text-white">4. Termination</h2>
          <p>
            We reserve the right to suspend or terminate accounts that breach platform rules, abuse services, or compromise community safety without prior notice.
          </p>

          <h2 className="text-xl font-bold text-white">5. Governing Law & Contact</h2>
          <p>
            These Terms are governed by applicable laws. For legal inquiries or support, contact <span className="text-[#FF2A6D] font-bold">support@filive.in</span>.
          </p>
        </div>
      </div>
      <Footer />
    </main>
  );
}
`);

console.log('All FiLive Website files generated successfully!');
