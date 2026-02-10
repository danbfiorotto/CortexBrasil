'use client';

import { useState, useEffect, Fragment } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import api from '@/lib/api';

interface Budget {
    id: string;
    category: string;
    amount: number;
    month: string;
    spent?: number;
}

const formatBRL = (val: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(val);

export default function BudgetsCard() {
    const [isOpen, setIsOpen] = useState(false);
    const [budgets, setBudgets] = useState<Budget[]>([]);
    const [loading, setLoading] = useState(true);

    const [category, setCategory] = useState('');
    const [amount, setAmount] = useState<number>(0);

    const fetchBudgets = async () => {
        try {
            const currentMonth = new Date().toISOString().slice(0, 7);
            const response = await api.get(`/api/budgets/?month=${currentMonth}`);
            setBudgets(response.data);
        } catch (error) {
            console.error("Failed to fetch budgets", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchBudgets();
    }, []);

    const handleSave = async () => {
        try {
            const currentMonth = new Date().toISOString().slice(0, 7);
            const safeAmount = isNaN(Number(amount)) ? 0 : Number(amount);

            await api.post('/api/budgets/', {
                category,
                amount: safeAmount,
                month: currentMonth,
            });

            setIsOpen(false);
            fetchBudgets();
            setCategory('');
            setAmount(0);
        } catch (e) {
            console.error(e);
            alert("Erro ao salvar orçamento");
        }
    };

    const maxBudget = Math.max(...budgets.map(b => b.amount), 1);

    return (
        <section className="bg-graphite-card rounded-xl border border-graphite-border p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-[10px] font-bold text-slate-low uppercase tracking-widest">
                    Orçamentos Ativos
                </h3>
                <button
                    onClick={() => setIsOpen(true)}
                    className="text-[10px] font-bold uppercase tracking-widest text-royal-purple hover:text-royal-purple/80 transition-colors"
                >
                    + Definir
                </button>
            </div>

            <div className="space-y-3">
                {loading ? (
                    <div className="space-y-3 animate-pulse">
                        <div className="h-12 bg-graphite-border/30 rounded-lg" />
                        <div className="h-12 bg-graphite-border/30 rounded-lg" />
                    </div>
                ) : budgets.length === 0 ? (
                    <p className="text-slate-low text-xs italic">Nenhum orçamento definido.</p>
                ) : (
                    budgets.map((budget) => {
                        const pct = Math.min(100, Math.round(((budget.spent || 0) / budget.amount) * 100));
                        const isOverBudget = pct > 80;

                        return (
                            <div key={budget.id} className="p-3 bg-carbon-800 rounded border border-graphite-border">
                                <div className="flex justify-between items-center mb-2">
                                    <span className="text-[11px] font-bold text-slate-300 uppercase">
                                        {budget.category}
                                    </span>
                                    <span className={`text-[10px] font-bold ${isOverBudget ? 'text-crimson-bright' : 'text-emerald-vibrant'}`}>
                                        {formatBRL(budget.amount)}
                                    </span>
                                </div>
                                <div className="w-full bg-carbon-950 h-1 rounded-full">
                                    <div
                                        className={`h-full rounded-full transition-all duration-500 ${isOverBudget
                                                ? 'bg-crimson-bright shadow-[0_0_8px_rgba(244,63,94,0.3)]'
                                                : 'bg-emerald-vibrant shadow-[0_0_8px_rgba(16,185,129,0.3)]'
                                            }`}
                                        style={{ width: `${Math.max(pct, 5)}%` }}
                                    />
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            {/* Create Budget Dialog */}
            <Transition appear show={isOpen} as={Fragment}>
                <Dialog as="div" className="relative z-50" onClose={() => setIsOpen(false)}>
                    <Transition.Child
                        as={Fragment}
                        enter="ease-out duration-300"
                        enterFrom="opacity-0"
                        enterTo="opacity-100"
                        leave="ease-in duration-200"
                        leaveFrom="opacity-100"
                        leaveTo="opacity-0"
                    >
                        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" />
                    </Transition.Child>

                    <div className="fixed inset-0 overflow-y-auto">
                        <div className="flex min-h-full items-center justify-center p-4">
                            <Transition.Child
                                as={Fragment}
                                enter="ease-out duration-300"
                                enterFrom="opacity-0 scale-95"
                                enterTo="opacity-100 scale-100"
                                leave="ease-in duration-200"
                                leaveFrom="opacity-100 scale-100"
                                leaveTo="opacity-0 scale-95"
                            >
                                <Dialog.Panel className="w-full max-w-md bg-graphite-card border border-graphite-border rounded-xl p-6 shadow-2xl">
                                    <Dialog.Title className="text-lg font-bold text-crisp-white mb-6">
                                        Definir Orçamento
                                    </Dialog.Title>

                                    <div className="space-y-4">
                                        <div>
                                            <label className="text-[10px] font-bold text-slate-low uppercase tracking-widest block mb-2">
                                                Categoria
                                            </label>
                                            <input
                                                type="text"
                                                placeholder="Ex: Alimentação"
                                                value={category}
                                                onChange={(e) => setCategory(e.target.value)}
                                                className="w-full bg-charcoal-bg border border-graphite-border rounded-lg px-4 py-2.5 text-sm text-crisp-white placeholder:text-slate-low/50 focus:ring-1 focus:ring-royal-purple focus:border-royal-purple outline-none transition-colors"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-bold text-slate-low uppercase tracking-widest block mb-2">
                                                Valor Limite (R$)
                                            </label>
                                            <input
                                                type="number"
                                                placeholder="0.00"
                                                value={amount || ''}
                                                onChange={(e) => setAmount(Number(e.target.value) || 0)}
                                                min={0}
                                                className="w-full bg-charcoal-bg border border-graphite-border rounded-lg px-4 py-2.5 text-sm text-crisp-white placeholder:text-slate-low/50 focus:ring-1 focus:ring-royal-purple focus:border-royal-purple outline-none transition-colors"
                                            />
                                        </div>

                                        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-graphite-border">
                                            <button
                                                onClick={() => setIsOpen(false)}
                                                className="px-4 py-2 text-sm font-bold text-slate-low hover:text-crisp-white transition-colors rounded-lg border border-graphite-border hover:bg-graphite-border/30"
                                            >
                                                Cancelar
                                            </button>
                                            <button
                                                onClick={handleSave}
                                                className="px-4 py-2 text-sm font-bold text-crisp-white bg-royal-purple hover:bg-royal-purple/90 rounded-lg transition-colors shadow-lg shadow-royal-purple/20"
                                            >
                                                Salvar
                                            </button>
                                        </div>
                                    </div>
                                </Dialog.Panel>
                            </Transition.Child>
                        </div>
                    </div>
                </Dialog>
            </Transition>
        </section>
    );
}
