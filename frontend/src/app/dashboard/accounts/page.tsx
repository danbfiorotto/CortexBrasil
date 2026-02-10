'use client';

import { useEffect, useState, useCallback } from 'react';
import Cookies from 'js-cookie';
import { motion, AnimatePresence } from 'framer-motion';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

const ACCOUNT_TYPE_MAP: Record<string, { label: string; icon: string; color: string }> = {
    CHECKING: { label: 'Conta Corrente', icon: '🏦', color: 'text-emerald-400' },
    CREDIT: { label: 'Cartão de Crédito', icon: '💳', color: 'text-violet-400' },
    INVESTMENT: { label: 'Investimento', icon: '📈', color: 'text-amber-400' },
    CASH: { label: 'Dinheiro', icon: '💵', color: 'text-green-400' },
};

interface Account {
    id: string;
    name: string;
    type: string;
    initial_balance: number;
    current_balance: number;
}

export default function AccountsPage() {
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [totalBalance, setTotalBalance] = useState(0);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [formData, setFormData] = useState({ name: '', type: 'CHECKING', initial_balance: 0 });
    const [submitting, setSubmitting] = useState(false);

    const fetchAccounts = useCallback(async () => {
        const token = Cookies.get('token');
        try {
            const res = await fetch(`${API_URL}/api/accounts/`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) {
                const data = await res.json();
                setAccounts(data.accounts);
                setTotalBalance(data.total_balance);
            }
        } catch (error) {
            console.error('Failed to fetch accounts:', error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchAccounts();
    }, [fetchAccounts]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        const token = Cookies.get('token');
        try {
            const res = await fetch(`${API_URL}/api/accounts/`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify(formData),
            });
            if (res.ok) {
                setShowForm(false);
                setFormData({ name: '', type: 'CHECKING', initial_balance: 0 });
                await fetchAccounts();
            }
        } catch (error) {
            console.error('Failed to create account:', error);
        } finally {
            setSubmitting(false);
        }
    };

    const formatCurrency = (value: number) =>
        new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

    return (
        <div className="p-6 md:p-10 max-w-6xl mx-auto space-y-8">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight">Contas</h2>
                    <p className="text-sm text-slate-low mt-1">
                        Gerencie suas contas bancárias e carteiras
                    </p>
                </div>
                <button
                    onClick={() => setShowForm(!showForm)}
                    className="px-4 py-2 rounded-xl bg-royal-purple hover:bg-royal-purple/80 text-sm font-semibold transition-all flex items-center gap-2"
                >
                    <span className="text-lg">+</span> Nova Conta
                </button>
            </div>

            {/* Total Balance Card */}
            <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                className="glass-panel rounded-2xl p-6"
            >
                <p className="text-xs uppercase tracking-widest text-slate-low mb-1">Patrimônio Líquido</p>
                <p className={`text-3xl font-bold ${totalBalance >= 0 ? 'text-emerald-400 subtle-glow-emerald' : 'text-crimson-bright subtle-glow-crimson'}`}>
                    {formatCurrency(totalBalance)}
                </p>
            </motion.div>

            {/* New Account Form */}
            <AnimatePresence>
                {showForm && (
                    <motion.form
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        onSubmit={handleSubmit}
                        className="glass-panel rounded-2xl p-6 space-y-4 overflow-hidden"
                    >
                        <h3 className="text-lg font-semibold">Criar Nova Conta</h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                                <label className="text-xs text-slate-low uppercase tracking-wider block mb-1">Nome</label>
                                <input
                                    type="text"
                                    placeholder="Ex: Nubank, Itaú"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    className="w-full bg-charcoal-bg border border-graphite-border rounded-xl px-4 py-2.5 text-sm focus:border-royal-purple focus:outline-none transition-colors"
                                    required
                                />
                            </div>
                            <div>
                                <label className="text-xs text-slate-low uppercase tracking-wider block mb-1">Tipo</label>
                                <select
                                    value={formData.type}
                                    onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                                    className="w-full bg-charcoal-bg border border-graphite-border rounded-xl px-4 py-2.5 text-sm focus:border-royal-purple focus:outline-none transition-colors"
                                >
                                    <option value="CHECKING">🏦 Conta Corrente</option>
                                    <option value="CREDIT">💳 Cartão de Crédito</option>
                                    <option value="INVESTMENT">📈 Investimento</option>
                                    <option value="CASH">💵 Dinheiro</option>
                                </select>
                            </div>
                            <div>
                                <label className="text-xs text-slate-low uppercase tracking-wider block mb-1">Saldo Inicial</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    value={formData.initial_balance}
                                    onChange={(e) => setFormData({ ...formData, initial_balance: parseFloat(e.target.value) || 0 })}
                                    className="w-full bg-charcoal-bg border border-graphite-border rounded-xl px-4 py-2.5 text-sm focus:border-royal-purple focus:outline-none transition-colors"
                                />
                            </div>
                        </div>
                        <div className="flex justify-end gap-3">
                            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-slate-low hover:text-crisp-white transition-colors">
                                Cancelar
                            </button>
                            <button
                                type="submit"
                                disabled={submitting}
                                className="px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-sm font-semibold transition-all disabled:opacity-50"
                            >
                                {submitting ? 'Salvando...' : 'Criar Conta'}
                            </button>
                        </div>
                    </motion.form>
                )}
            </AnimatePresence>

            {/* Account Cards Grid */}
            {loading ? (
                <div className="flex justify-center py-12">
                    <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1 }} className="w-8 h-8 border-t-2 border-royal-purple rounded-full" />
                </div>
            ) : accounts.length === 0 ? (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass-panel rounded-2xl p-12 text-center">
                    <p className="text-4xl mb-4">🏦</p>
                    <p className="text-lg font-semibold mb-1">Nenhuma conta cadastrada</p>
                    <p className="text-sm text-slate-low">Crie sua primeira conta para começar a organizar suas finanças.</p>
                </motion.div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {accounts.map((acc, i) => {
                        const typeInfo = ACCOUNT_TYPE_MAP[acc.type] || ACCOUNT_TYPE_MAP.CASH;
                        return (
                            <motion.div
                                key={acc.id}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: i * 0.08 }}
                                className="glass-panel rounded-2xl p-5 hover:border-royal-purple/40 transition-all group cursor-pointer"
                            >
                                <div className="flex items-center justify-between mb-4">
                                    <div className="flex items-center gap-3">
                                        <span className="text-2xl">{typeInfo.icon}</span>
                                        <div>
                                            <p className="font-semibold">{acc.name}</p>
                                            <p className="text-xs text-slate-low">{typeInfo.label}</p>
                                        </div>
                                    </div>
                                </div>
                                <p className={`text-xl font-bold ${acc.current_balance >= 0 ? 'text-emerald-400' : 'text-crimson-bright'}`}>
                                    {formatCurrency(acc.current_balance)}
                                </p>
                                <div className="mt-3 pt-3 border-t border-graphite-border/50">
                                    <p className="text-[10px] text-slate-low uppercase tracking-wider">
                                        Saldo Inicial: {formatCurrency(acc.initial_balance)}
                                    </p>
                                </div>
                            </motion.div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
