'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Cookies from 'js-cookie';
import { motion, AnimatePresence } from 'framer-motion';

const NAV_ITEMS = [
    { name: 'Dashboard', href: '/dashboard' },
    { name: 'Transações', href: '/dashboard/transactions' },
    { name: 'Contas', href: '/dashboard/accounts' },
    { name: 'Investimentos', href: '/dashboard/investments' },
];

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const router = useRouter();
    const pathname = usePathname();
    const [authorized, setAuthorized] = useState(false);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

    useEffect(() => {
        const token = Cookies.get('token');
        if (!token) {
            router.push('/login');
        } else {
            setAuthorized(true);
        }
    }, [router]);

    const handleLogout = () => {
        Cookies.remove('token');
        router.push('/login');
    };

    if (!authorized) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-charcoal-bg">
                <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 1 }}
                    className="w-8 h-8 border-t-2 border-royal-purple rounded-full"
                />
            </div>
        );
    }

    return (
        <div className="h-screen flex flex-col overflow-hidden bg-charcoal-bg text-crisp-white">
            {/* Top Header Bar */}
            <header className="flex items-center justify-between border-b border-graphite-border px-8 py-3 bg-graphite-card shrink-0">
                {/* Left: Logo + Nav */}
                <div className="flex items-center gap-4">
                    <div className="size-8 text-royal-purple">
                        <svg fill="none" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
                            <path
                                d="M8.57829 8.57829C5.52816 11.6284 3.451 15.5145 2.60947 19.7452C1.76794 23.9758 2.19984 28.361 3.85056 32.3462C5.50128 36.3314 8.29667 39.7376 11.8832 42.134C15.4698 44.5305 19.6865 45.8096 24 45.8096C28.3135 45.8096 32.5302 44.5305 36.1168 42.134C39.7033 39.7375 42.4987 36.3314 44.1494 32.3462C45.8002 28.361 46.2321 23.9758 45.3905 19.7452C44.549 15.5145 42.4718 11.6284 39.4217 8.57829L24 24L8.57829 8.57829Z"
                                fill="currentColor"
                            />
                        </svg>
                    </div>
                    <h1 className="text-lg font-bold leading-tight tracking-[0.2em] uppercase text-crisp-white">
                        Cortex Brasil
                    </h1>
                </div>

                {/* Center: Nav Links (Desktop) */}
                <nav className="hidden md:flex items-center gap-10">
                    {NAV_ITEMS.map((item) => {
                        const isActive = pathname === item.href;
                        return (
                            <a
                                key={item.name}
                                href={item.href}
                                className={
                                    isActive
                                        ? 'text-sm font-semibold text-royal-purple border-b-2 border-royal-purple pb-1'
                                        : 'text-sm font-medium text-slate-low hover:text-crisp-white transition-colors'
                                }
                            >
                                {item.name}
                            </a>
                        );
                    })}
                </nav>

                {/* Right: Actions + User */}
                <div className="flex items-center gap-4">
                    <button className="p-2 rounded-lg bg-graphite-border/30 text-slate-low hover:text-crisp-white transition-colors">
                        <span className="material-symbols-outlined text-[20px]">notifications</span>
                    </button>
                    <button className="p-2 rounded-lg bg-graphite-border/30 text-slate-low hover:text-crisp-white transition-colors">
                        <span className="material-symbols-outlined text-[20px]">settings</span>
                    </button>
                    <div className="h-8 w-[1px] bg-graphite-border" />

                    <div className="flex items-center gap-3">
                        <div className="hidden sm:flex flex-col items-end">
                            <span className="text-xs font-bold text-crisp-white">Usuário</span>
                            <span className="text-[10px] text-royal-purple font-bold tracking-widest">PREMIUM</span>
                        </div>
                        <div className="bg-royal-purple/20 border border-royal-purple/50 rounded-full size-9 flex items-center justify-center">
                            <span className="material-symbols-outlined text-royal-purple text-[20px]">person</span>
                        </div>
                    </div>

                    {/* Mobile Menu Toggle */}
                    <button
                        className="md:hidden p-2 rounded-lg bg-graphite-border/30 text-slate-low hover:text-crisp-white transition-colors"
                        onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                    >
                        <span className="material-symbols-outlined text-[20px]">
                            {mobileMenuOpen ? 'close' : 'menu'}
                        </span>
                    </button>
                </div>
            </header>

            {/* Mobile Nav Dropdown */}
            <AnimatePresence>
                {mobileMenuOpen && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="md:hidden bg-graphite-card border-b border-graphite-border overflow-hidden"
                    >
                        <nav className="flex flex-col gap-1 p-4">
                            {NAV_ITEMS.map((item) => {
                                const isActive = pathname === item.href;
                                return (
                                    <a
                                        key={item.name}
                                        href={item.href}
                                        onClick={() => setMobileMenuOpen(false)}
                                        className={`px-4 py-3 rounded-lg text-sm font-medium transition-colors ${isActive
                                            ? 'bg-royal-purple/10 text-royal-purple border border-royal-purple/20'
                                            : 'text-slate-low hover:text-crisp-white hover:bg-graphite-border/20'
                                            }`}
                                    >
                                        {item.name}
                                    </a>
                                );
                            })}
                            <button
                                onClick={handleLogout}
                                className="px-4 py-3 rounded-lg text-sm font-medium text-crimson-bright hover:bg-crimson-bright/10 text-left transition-colors mt-2"
                            >
                                Sair
                            </button>
                        </nav>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Main Content */}
            <main className="flex-1 overflow-y-auto custom-scrollbar">
                <AnimatePresence mode="wait">
                    <motion.div
                        key={pathname}
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -12 }}
                        transition={{ duration: 0.25 }}
                    >
                        {children}
                    </motion.div>
                </AnimatePresence>
            </main>
        </div>
    );
}
