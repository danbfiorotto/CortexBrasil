'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { motion } from 'framer-motion';

interface Transaction {
    id: string;
    amount: number;
    category: string;
    description: string;
    date: string;
    is_installment: boolean;
    installment_info: string | null;
}

const CATEGORIES = [
    "Alimentação", "Transporte", "Moradia", "Lazer", "Saúde",
    "Educação", "Compras", "Serviços", "Outros"
];

const CATEGORY_ICONS: Record<string, string> = {
    'Alimentação': 'restaurant',
    'Transporte': 'commute',
    'Moradia': 'home',
    'Lazer': 'sports_esports',
    'Saúde': 'health_and_safety',
    'Educação': 'school',
    'Compras': 'shopping_cart',
    'Serviços': 'build',
    'Investimento': 'payments',
    'Renda': 'payments',
    'Outros': 'receipt_long',
};

const formatBRL = (val: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

export default function TransactionsPage() {
    const [data, setData] = useState<Transaction[]>([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [category, setCategory] = useState<string>('');
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    useEffect(() => {
        fetchTransactions();
    }, [page, category]);

    const fetchTransactions = async () => {
        setLoading(true);
        try {
            const params: Record<string, string | number> = { page, limit: 10 };
            if (category && category !== 'Todas') params.category = category;

            const res = await api.get('/api/dashboard/transactions', { params });
            setData(res.data.data);
            setTotalPages(res.data.meta.pages);
        } catch (error) {
            console.error("Failed to fetch transactions", error);
        } finally {
            setLoading(false);
        }
    };

    const toggleSelect = (id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    const toggleSelectAll = () => {
        if (selectedIds.size === data.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(data.map(tx => tx.id)));
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col h-full"
        >
            {/* AI Search Bar */}
            <div className="px-8 pt-8 pb-6">
                <div className="max-w-4xl mx-auto w-full">
                    <div className="relative group">
                        <div className="absolute -inset-[1px] bg-gradient-to-r from-royal-purple to-indigo-600 rounded-lg blur-[2px] opacity-30 group-focus-within:opacity-60 transition duration-500" />
                        <div className="relative flex items-center bg-graphite-card border border-graphite-border rounded-lg px-5 h-14 search-glow">
                            <span className="material-symbols-outlined text-royal-purple mr-4 text-xl">auto_awesome</span>
                            <input
                                className="bg-transparent border-none focus:ring-0 focus:outline-none text-crisp-white placeholder-slate-low/50 w-full text-base font-medium tracking-tight"
                                placeholder="Buscar transações com IA..."
                                type="text"
                            />
                            <div className="flex items-center gap-3">
                                <div className="hidden md:flex items-center gap-1">
                                    <kbd className="px-1.5 py-0.5 rounded border border-graphite-600 bg-charcoal-bg text-[10px] font-bold text-slate-low uppercase">CMD</kbd>
                                    <kbd className="px-1.5 py-0.5 rounded border border-graphite-600 bg-charcoal-bg text-[10px] font-bold text-slate-low uppercase">K</kbd>
                                </div>
                                <button className="bg-royal-purple hover:bg-royal-purple/90 text-crisp-white rounded px-4 py-1.5 text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2 shadow-lg shadow-royal-purple/20">
                                    Query
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Filter Bar */}
            <div className="px-8 py-3.5 flex flex-wrap items-center justify-between border-b border-graphite-border bg-carbon-800">
                <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
                    <div className="relative">
                        <select
                            value={category}
                            onChange={(e) => { setCategory(e.target.value); setPage(1); }}
                            className="appearance-none bg-graphite-card border border-graphite-border px-3 py-1.5 pr-8 rounded text-[10px] font-bold text-slate-low uppercase tracking-wider cursor-pointer hover:text-crisp-white transition-colors focus:ring-1 focus:ring-royal-purple outline-none"
                        >
                            <option value="">Todas Categorias</option>
                            {CATEGORIES.map(cat => (
                                <option key={cat} value={cat}>{cat}</option>
                            ))}
                        </select>
                        <span className="material-symbols-outlined absolute right-2 top-1/2 -translate-y-1/2 text-sm text-slate-low pointer-events-none">
                            keyboard_arrow_down
                        </span>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <span className="text-[10px] font-bold text-slate-low uppercase tracking-widest">
                        Pág {page}/{totalPages}
                    </span>
                </div>
            </div>

            {/* Table */}
            <div className="flex-1 overflow-auto px-8 py-6">
                {loading ? (
                    <div className="flex items-center justify-center py-20">
                        <div className="flex flex-col items-center gap-4">
                            <div className="w-8 h-8 border-4 border-royal-purple border-t-transparent rounded-full animate-spin" />
                            <p className="text-slate-low text-xs">Carregando transações...</p>
                        </div>
                    </div>
                ) : (
                    <>
                        <div className="min-w-[700px] bg-graphite-card border border-graphite-border rounded-xl overflow-hidden shadow-2xl">
                            <table className="w-full border-separate border-spacing-0">
                                <thead className="sticky top-0 z-20">
                                    <tr className="text-left bg-carbon-800">
                                        <th className="py-4 px-6 border-b border-graphite-700 w-10">
                                            <input
                                                type="checkbox"
                                                checked={selectedIds.size === data.length && data.length > 0}
                                                onChange={toggleSelectAll}
                                                className="rounded-sm bg-charcoal-bg border-graphite-600 text-royal-purple focus:ring-royal-purple cursor-pointer"
                                            />
                                        </th>
                                        <th className="py-4 px-4 border-b border-graphite-700 text-[10px] font-black text-slate-low uppercase tracking-[0.15em]">Data</th>
                                        <th className="py-4 px-4 border-b border-graphite-700 text-[10px] font-black text-slate-low uppercase tracking-[0.15em]">Descrição</th>
                                        <th className="py-4 px-4 border-b border-graphite-700 text-[10px] font-black text-slate-low uppercase tracking-[0.15em]">Categoria</th>
                                        <th className="py-4 px-4 border-b border-graphite-700 text-[10px] font-black text-slate-low uppercase tracking-[0.15em] text-right">Valor</th>
                                        <th className="py-4 px-6 border-b border-graphite-700 text-[10px] font-black text-slate-low uppercase tracking-[0.15em]">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-graphite-border">
                                    {data.map((tx) => {
                                        const isIncome = tx.amount > 0;
                                        const iconName = CATEGORY_ICONS[tx.category] || 'receipt_long';
                                        const isSelected = selectedIds.has(tx.id);

                                        return (
                                            <tr
                                                key={tx.id}
                                                className={`group hover:bg-royal-purple/5 transition-colors ${isSelected ? 'bg-royal-purple/5' : ''}`}
                                            >
                                                <td className="py-4 px-6 border-b border-graphite-border">
                                                    <input
                                                        type="checkbox"
                                                        checked={isSelected}
                                                        onChange={() => toggleSelect(tx.id)}
                                                        className="rounded-sm bg-charcoal-bg border-graphite-600 text-royal-purple focus:ring-royal-purple cursor-pointer"
                                                    />
                                                </td>
                                                <td className="py-4 px-4 border-b border-graphite-border text-[11px] font-bold text-slate-low tracking-tight">
                                                    {new Date(tx.date).toLocaleDateString('pt-BR').toUpperCase()}
                                                </td>
                                                <td className="py-4 px-4 border-b border-graphite-border">
                                                    <div className="flex items-center gap-3">
                                                        <div className="size-8 rounded bg-charcoal-bg flex items-center justify-center border border-graphite-700 text-slate-low group-hover:text-royal-purple transition-colors">
                                                            <span className="material-symbols-outlined text-lg">{iconName}</span>
                                                        </div>
                                                        <span className="text-xs font-bold text-crisp-white tracking-tight uppercase">
                                                            {tx.description}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="py-4 px-4 border-b border-graphite-border">
                                                    <span className={`px-2 py-1 rounded-sm text-[9px] font-black uppercase tracking-widest ${isIncome
                                                            ? 'bg-emerald-vibrant/10 text-emerald-vibrant border border-emerald-vibrant/30'
                                                            : tx.is_installment
                                                                ? 'bg-royal-purple/10 text-royal-purple border border-royal-purple/30'
                                                                : 'bg-crimson-bright/10 text-crimson-bright border border-crimson-bright/30'
                                                        }`}>
                                                        {tx.category}
                                                    </span>
                                                </td>
                                                <td className={`py-4 px-4 border-b border-graphite-border text-xs font-black text-right ${isIncome ? 'text-emerald-vibrant' : 'text-crimson-bright'
                                                    }`}>
                                                    {isIncome ? '+ ' : '- '}{formatBRL(Math.abs(tx.amount))}
                                                </td>
                                                <td className="py-4 px-6 border-b border-graphite-border">
                                                    <div className="flex items-center gap-2">
                                                        <div className={`size-1.5 rounded-full ${isIncome
                                                                ? 'bg-emerald-vibrant shadow-[0_0_8px_rgba(16,185,129,0.4)]'
                                                                : 'bg-emerald-vibrant shadow-[0_0_8px_rgba(16,185,129,0.4)]'
                                                            }`} />
                                                        <span className="text-[9px] font-black text-emerald-vibrant uppercase tracking-widest">
                                                            {tx.is_installment ? tx.installment_info || 'Parcelado' : 'Cleared'}
                                                        </span>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        {/* Pagination */}
                        <div className="mt-8 flex justify-between items-center text-[10px] font-bold text-slate-low uppercase tracking-[0.2em] pb-8">
                            <span>Página {page} de {totalPages}</span>
                            <div className="flex gap-4">
                                <button
                                    disabled={page === 1}
                                    onClick={() => setPage(p => Math.max(1, p - 1))}
                                    className="hover:text-royal-purple transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                                >
                                    Anterior
                                </button>
                                <button
                                    disabled={page === totalPages}
                                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                    className="hover:text-royal-purple transition-colors text-crisp-white disabled:opacity-30 disabled:cursor-not-allowed"
                                >
                                    Próxima
                                </button>
                            </div>
                        </div>
                    </>
                )}
            </div>

            {/* Floating Action Bar */}
            {selectedIds.size > 0 && (
                <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50">
                    <div className="glass-panel rounded-lg shadow-2xl px-6 py-3.5 flex items-center gap-8 min-w-[480px]">
                        <div className="flex items-center gap-4">
                            <div className="bg-royal-purple size-5 rounded-sm flex items-center justify-center text-[10px] font-black text-crisp-white">
                                {String(selectedIds.size).padStart(2, '0')}
                            </div>
                            <span className="text-xs font-black text-crisp-white uppercase tracking-wider">
                                Selecionadas
                            </span>
                        </div>
                        <div className="h-6 w-px bg-graphite-700" />
                        <div className="flex items-center gap-5">
                            <button className="flex items-center gap-2 text-slate-low hover:text-crisp-white transition-colors text-[10px] font-black uppercase tracking-widest">
                                <span className="material-symbols-outlined text-base">edit</span>
                                Categorizar
                            </button>
                            <button className="flex items-center gap-2 text-slate-low hover:text-crisp-white transition-colors text-[10px] font-black uppercase tracking-widest">
                                <span className="material-symbols-outlined text-base">flag</span>
                                Marcar
                            </button>
                            <button className="flex items-center gap-2 text-slate-low hover:text-crisp-white transition-colors text-[10px] font-black uppercase tracking-widest">
                                <span className="material-symbols-outlined text-base">export_notes</span>
                                Exportar
                            </button>
                        </div>
                        <button
                            onClick={() => setSelectedIds(new Set())}
                            className="ml-auto text-slate-600 hover:text-crisp-white transition-colors"
                        >
                            <span className="material-symbols-outlined text-base">close</span>
                        </button>
                    </div>
                </div>
            )}
        </motion.div>
    );
}
