'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { motion } from 'framer-motion';

import HUD from '@/components/HUD';
import CommitmentMountain from '@/components/CommitmentMountain';
import GoalsCard from '@/components/GoalsCard';
import BudgetsCard from '@/components/BudgetsCard';
import PulseFeed from '@/components/PulseFeed';

interface Transaction {
    id: string;
    amount: number;
    category: string;
    description: string;
    date: string;
    is_installment: boolean;
}

interface DashboardData {
    user: string;
    recent_transactions: Transaction[];
}

const CATEGORY_ICONS: Record<string, string> = {
    'Alimentação': 'restaurant',
    'Transporte': 'commute',
    'Moradia': 'home',
    'Lazer': 'sports_esports',
    'Saúde': 'health_and_safety',
    'Educação': 'school',
    'Compras': 'shopping_bag',
    'Serviços': 'build',
    'Investimento': 'trending_up',
    'Renda': 'arrow_downward',
};

const formatBRL = (val: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

const container = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.08 } },
};

const item = {
    hidden: { opacity: 0, y: 16 },
    show: { opacity: 1, y: 0 },
};

export default function DashboardPage() {
    const [data, setData] = useState<DashboardData | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const res = await api.get('/api/dashboard/summary');
                setData(res.data);
            } catch (error) {
                console.error("Failed to fetch dashboard data", error);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, []);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-[80vh]">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-10 h-10 border-4 border-royal-purple border-t-transparent rounded-full animate-spin" />
                    <p className="text-slate-low text-sm animate-pulse">Carregando Cortex...</p>
                </div>
            </div>
        );
    }

    if (!data) {
        return (
            <div className="flex items-center justify-center h-[80vh]">
                <p className="text-slate-low">Erro ao carregar dados.</p>
            </div>
        );
    }

    return (
        <div className="flex flex-1 overflow-hidden">
            {/* Main scrollable content */}
            <div className="flex-1 flex flex-col overflow-y-auto custom-scrollbar p-6 space-y-6">
                <motion.div variants={container} initial="hidden" animate="show" className="space-y-6">
                    {/* HUD Metrics */}
                    <motion.div variants={item}>
                        <HUD />
                    </motion.div>

                    {/* Main Grid: 2/3 + 1/3 */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {/* Left Column */}
                        <div className="lg:col-span-2 space-y-6">
                            <motion.div variants={item}>
                                <CommitmentMountain />
                            </motion.div>

                            <motion.div variants={item}>
                                <GoalsCard />
                            </motion.div>
                        </div>

                        {/* Right Column: Intelligence */}
                        <aside className="space-y-6">
                            <motion.div variants={item}>
                                <PulseFeed />
                            </motion.div>

                            <motion.div variants={item}>
                                <BudgetsCard />
                            </motion.div>
                        </aside>
                    </div>
                </motion.div>
            </div>

            {/* Right Sidebar Panel: Transactions + Wealth */}
            <div className="w-80 bg-graphite-card border-l border-graphite-border hidden xl:flex flex-col shrink-0 shadow-2xl">
                <div className="p-6 space-y-6 flex flex-col h-full overflow-y-auto custom-scrollbar">
                    {/* Semantic Search */}
                    <div className="space-y-2">
                        <p className="text-[10px] font-bold text-slate-low uppercase tracking-[0.2em] px-1">
                            Busca Semântica
                        </p>
                        <div className="relative">
                            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-low text-[18px]">
                                search
                            </span>
                            <input
                                className="w-full bg-charcoal-bg border-graphite-border border rounded-lg pl-10 pr-4 py-2.5 text-xs focus:ring-1 focus:ring-royal-purple placeholder:text-slate-low/50 text-crisp-white outline-none transition-colors"
                                placeholder="Ex: 'Gastos com Uber em Jan'"
                                type="text"
                            />
                        </div>
                    </div>

                    {/* Recent Transactions */}
                    <div className="flex-1 overflow-y-auto custom-scrollbar space-y-4">
                        <p className="text-[10px] font-bold text-slate-low uppercase tracking-[0.2em] px-1">
                            Transações Recentes
                        </p>
                        <div className="space-y-1">
                            {data.recent_transactions.slice(0, 8).map((tx) => {
                                const isIncome = tx.amount > 0;
                                const iconName = CATEGORY_ICONS[tx.category] || 'receipt_long';

                                return (
                                    <div
                                        key={tx.id}
                                        className="flex items-center justify-between p-3 rounded-lg hover:bg-graphite-border/30 transition-colors cursor-pointer group border border-transparent hover:border-graphite-border"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className={`size-9 rounded-lg flex items-center justify-center border ${isIncome
                                                    ? 'bg-emerald-vibrant/5 border-emerald-vibrant/20'
                                                    : 'bg-charcoal-bg border-graphite-border'
                                                }`}>
                                                <span className={`material-symbols-outlined text-[18px] ${isIncome
                                                        ? 'text-emerald-vibrant'
                                                        : 'text-slate-low group-hover:text-royal-purple transition-colors'
                                                    }`}>
                                                    {isIncome ? 'arrow_downward' : iconName}
                                                </span>
                                            </div>
                                            <div>
                                                <p className="text-xs font-bold text-crisp-white">{tx.description}</p>
                                                <p className="text-[9px] text-slate-low uppercase tracking-tighter">
                                                    {new Date(tx.date).toLocaleDateString('pt-BR')}
                                                </p>
                                            </div>
                                        </div>
                                        <p className={`text-xs font-bold ${isIncome ? 'text-emerald-vibrant' : 'text-crimson-bright'}`}>
                                            {isIncome ? '+' : '-'}{formatBRL(Math.abs(tx.amount))}
                                        </p>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Wealth Summary */}
                    <div className="pt-6 border-t border-graphite-border">
                        <div className="p-5 rounded-xl bg-gradient-to-br from-royal-purple/10 to-transparent border border-royal-purple/20 space-y-3">
                            <p className="text-[10px] font-bold text-slate-low uppercase tracking-widest">
                                Patrimônio Líquido Total
                            </p>
                            <p className="text-xl font-bold tracking-tight text-crisp-white">
                                {formatBRL(data.recent_transactions.reduce((acc, tx) => acc + tx.amount, 0))}
                            </p>
                            <div className="flex items-center gap-1.5 text-[10px] font-black text-emerald-vibrant tracking-widest uppercase">
                                <span className="material-symbols-outlined text-[14px]">trending_up</span>
                                Visão Geral
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
