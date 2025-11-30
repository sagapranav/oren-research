'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';

const sampleReports = [
  {
    category: 'Technology',
    title: 'The AI Bubble',
    pdfUrl: '/sample-reports/The AI Bubble.pdf',
    thumbnail: '/sample-reports/ai-bubble-thumb.png',
  },
  {
    category: 'Finance',
    title: 'Stablecoins',
    pdfUrl: '/sample-reports/Stablecoins.pdf',
    thumbnail: '/sample-reports/Stablecoins.png',
  },
  {
    category: 'Technology',
    title: 'The 1 Trillion Bet',
    pdfUrl: '/sample-reports/The 1 Trillion Bet.pdf',
    thumbnail: '/sample-reports/The 1 Trillion Bet.png',
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#0a0a0b] text-white overflow-x-hidden overflow-y-auto">
      {/* Background Grid */}
      <div
        className="fixed inset-0 pointer-events-none z-0"
        style={{
          backgroundImage: 'linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
        }}
      />

      {/* Ambient Glow */}
      <div
        className="fixed top-[-200px] left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full pointer-events-none z-0 opacity-40"
        style={{
          background: 'radial-gradient(circle, rgba(5, 150, 105, 0.15) 0%, transparent 70%)',
          filter: 'blur(80px)',
        }}
      />

      <div className="relative z-10 max-w-[1200px] mx-auto px-6">
        {/* Navigation */}
        <nav className="py-6 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center text-[#0a0a0b] font-bold text-sm">
              O
            </div>
            <span className="font-semibold text-lg tracking-tight">OREN <span className="text-emerald-500">/research</span></span>
          </div>
        </nav>

        {/* Hero Section */}
        <section className="py-12 text-center">
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-5xl md:text-7xl font-bold tracking-tight mb-6"
          >
            <span
              style={{
                background: 'linear-gradient(180deg, #fafafa 0%, #a1a1aa 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}
            >
              OREN
            </span>
            <span className="text-emerald-500"> /research</span>
          </motion.h1>

          <motion.ul
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.5 }}
            className="text-left max-w-[360px] mx-auto mb-10 text-[15px] text-zinc-400 space-y-2"
          >
            <li className="flex items-center gap-3">
              <span className="text-emerald-500">→</span>
              Multi-agent system with central orchestrator
            </li>
            <li className="flex items-center gap-3">
              <span className="text-emerald-500">→</span>
              Specialized agents spawned based on task complexity
            </li>
            <li className="flex items-center gap-3">
              <span className="text-emerald-500">→</span>
              Watch agents work in real-time
            </li>
            <li className="flex items-center gap-3">
              <span className="text-emerald-500">→</span>
              Export reports as PDF
            </li>
            <li className="flex items-center gap-3">
              <span className="text-emerald-500">→</span>
              Bring your own API keys 
            </li>
          </motion.ul>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.5 }}
          >
            <Link href="/research">
              <motion.button
                whileHover={{ scale: 1.02, y: -2 }}
                whileTap={{ scale: 0.98 }}
                className="inline-flex items-center gap-2 px-7 py-3.5 bg-emerald-600 hover:bg-emerald-500 text-[#0a0a0b] font-semibold rounded-lg transition-colors hover:shadow-[0_8px_30px_rgba(5,150,105,0.3)]"
              >
                Start Researching
                <ArrowRight size={18} />
              </motion.button>
            </Link>
          </motion.div>
        </section>

        {/* Sample Reports Section */}
        <section className="py-10">
          <div className="flex justify-between items-center mb-10">
            <span className="text-xs uppercase tracking-widest text-zinc-500 font-semibold">
              Sample Reports
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {sampleReports.map((report, index) => (
              <motion.a
                key={index}
                href={report.pdfUrl}
                target="_blank"
                rel="noopener noreferrer"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 + index * 0.1, duration: 0.5 }}
                whileHover={{ y: -4, transition: { duration: 0.2 } }}
                className="group bg-[#151518] border border-white/[0.06] rounded-2xl overflow-hidden transition-colors duration-300 hover:border-emerald-500/30 relative block"
              >
                {/* Thumbnail Preview */}
                <div className="relative w-full h-[240px] bg-[#1a1a1e] overflow-hidden">
                  <img
                    src={report.thumbnail}
                    alt={report.title}
                    className="w-full h-full object-cover object-top transition-transform duration-300 group-hover:scale-[1.02]"
                  />
                  {/* Gradient overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-[#151518] via-transparent to-transparent opacity-60" />
                  {/* Hover overlay */}
                  <div className="absolute inset-0 bg-emerald-500/0 group-hover:bg-emerald-500/10 transition-colors flex items-center justify-center">
                    <span className="opacity-0 group-hover:opacity-100 transition-opacity bg-emerald-600 text-[#0a0a0b] px-4 py-2 rounded-lg font-semibold text-sm flex items-center gap-2 shadow-lg">
                      <ArrowRight size={16} />
                      Read Report
                    </span>
                  </div>
                </div>

                {/* Card Content */}
                <div className="p-5 pb-8">
                  <span className="text-[11px] uppercase tracking-wider text-emerald-500 bg-emerald-500/10 px-2.5 py-1 rounded-full font-semibold">
                    {report.category}
                  </span>

                  <h3 className="text-base font-semibold tracking-tight text-emerald-500 leading-snug mt-3">
                    {report.title}
                  </h3>
                </div>
              </motion.a>
            ))}
          </div>
        </section>

        {/* Footer spacing */}
        <div className="h-40" />
      </div>
    </div>
  );
}
