'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Cookies from 'js-cookie';
import { LayoutDashboard, Wallet, LogOut, Menu, X, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';

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

    const navItems = [
        { name: 'Visão Geral', href: '/dashboard', icon: LayoutDashboard },
        { name: 'Transações', href: '/dashboard/transactions', icon: Wallet },
    ];

    if (!authorized) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white">
                <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 1 }}
                    className="w-8 h-8 border-t-2 border-blue-500 rounded-full"
                />
            </div>
        );
    }

    return (
        <div className="min-h-screen flex bg-slate-50 dark:bg-[#020617] text-slate-900 dark:text-slate-100 transition-colors duration-500">
            {/* Sidebar for Desktop */}
            <motion.aside
                initial={{ x: -250 }}
                animate={{ x: 0 }}
                className="hidden md:flex flex-col w-72 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-r border-slate-200 dark:border-slate-800 h-screen sticky top-0 shadow-lg z-20"
            >
                <div className="p-8 flex items-center gap-3">
                    <div className="bg-gradient-to-tr from-blue-600 to-indigo-600 rounded-xl p-2 shadow-lg shadow-blue-500/30">
                        <LayoutDashboard className="text-white w-6 h-6" />
                    </div>
                    <div>
                        <h1 className="font-bold text-xl tracking-tight">Cortex</h1>
                        <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Brasil</p>
                    </div>
                </div>

                <nav className="flex-1 px-4 space-y-2 py-6">
                    {navItems.map((item) => {
                        const isActive = pathname === item.href;
                        return (
                            <a
                                key={item.name}
                                href={item.href}
                                className={clsx(
                                    "flex items-center justify-between px-4 py-3.5 rounded-xl font-medium transition-all duration-200 group relative overflow-hidden",
                                    isActive
                                        ? "bg-blue-600 text-white shadow-md shadow-blue-500/25"
                                        : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white"
                                )}
                            >
                                <div className="flex items-center gap-3 relative z-10">
                                    <item.icon className={clsx("w-5 h-5", isActive ? "text-white" : "text-slate-400 group-hover:text-blue-500")} />
                                    {item.name}
                                </div>
                                {isActive && <ChevronRight className="w-4 h-4 text-white/50" />}
                            </a>
                        );
                    })}
                </nav>

                <div className="p-4 border-t border-slate-200 dark:border-slate-800">
                    <button
                        onClick={handleLogout}
                        className="flex items-center gap-3 px-4 py-3 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/10 rounded-xl font-medium w-full transition-colors"
                    >
                        <LogOut className="w-5 h-5" />
                        Sair
                    </button>
                </div>
            </motion.aside>

            {/* Mobile Header */}
            <div className="md:hidden fixed top-0 w-full bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 p-4 flex justify-between items-center z-50">
                <div className="flex items-center gap-2">
                    <div className="bg-blue-600 rounded-lg p-1.5">
                        <LayoutDashboard className="text-white w-5 h-5" />
                    </div>
                    <span className="font-bold text-lg">Cortex</span>
                </div>
                <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
                    {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
                </button>
            </div>

            {/* Main Content */}
            <main className="flex-1 p-4 md:p-8 pt-20 md:pt-8 overflow-y-auto w-full relative">
                <div className="absolute inset-0 bg-[url('/grid.svg')] bg-center [mask-image:linear-gradient(180deg,white,rgba(255,255,255,0))] opacity-10 pointer-events-none"></div>
                <div className="max-w-7xl mx-auto relative z-10">
                    <AnimatePresence mode='wait'>
                        <motion.div
                            key={pathname}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                            transition={{ duration: 0.3 }}
                        >
                            {children}
                        </motion.div>
                    </AnimatePresence>
                </div>
            </main>
        </div>
    );
}
