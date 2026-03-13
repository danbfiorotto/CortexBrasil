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
    const [editingBudget, setEditingBudget] = useState<Budget | null>(null);
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

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

    const openCreate = () => {
        setEditingBudget(null);
        setCategory('');
        setAmount(0);
        setIsOpen(true);
    };

    const openEdit = (budget: Budget) => {
        setEditingBudget(budget);
        setCategory(budget.category);
        setAmount(budget.amount);
        setIsOpen(true);
    };

    const handleClose = () => {
        setIsOpen(false);
        setEditingBudget(null);
        setCategory('');
        setAmount(0);
    };

    const handleSave = async () => {
        try {
            const currentMonth = new Date().toISOString().slice(0, 7);
            const safeAmount = isNaN(Number(amount)) ? 0 : Number(amount);

            await api.post('/api/budgets/', {
                category,
                amount: safeAmount,
                month: currentMonth,
            });

            handleClose();
            fetchBudgets();
        } catch (e) {
            console.error(e);
            alert("Erro ao salvar limite de gasto");
        }
    };

    const handleDelete = async (id: string) => {
        try {
            await api.delete(`/api/budgets/${id}`);
            setConfirmDeleteId(null);
            fetchBudgets();
        } catch (e) {
            console.error(e);
            alert("Erro ao excluir limite de gasto");
        }
    };

    return (
        <section className="bg-graphite-card rounded-xl border border-graphite-border p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-[10px] font-bold text-slate-low uppercase tracking-widest">
                    Limites de Gasto
                </h3>
                <button
                    onClick={openCreate}
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
                    <p className="text-slate-low text-xs italic">Nenhum limite definido.</p>
                ) : (
                    budgets.map((budget) => {
                        const spent = budget.spent || 0;
                        const pct = Math.min(100, Math.round((spent / budget.amount) * 100));
                        const isWarning = pct >= 80 && pct < 100;
                        const isOver = pct >= 100;
                        const barColor = isOver
                            ? 'bg-crimson-bright shadow-[0_0_8px_rgba(244,63,94,0.3)]'
                            : isWarning
                                ? 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.3)]'
                                : 'bg-emerald-vibrant shadow-[0_0_8px_rgba(16,185,129,0.3)]';
                        const labelColor = isOver ? 'text-crimson-bright' : isWarning ? 'text-amber-400' : 'text-emerald-vibrant';
                        const isConfirmingDelete = confirmDeleteId === budget.id;

                        return (
                            <div key={budget.id} className="p-3 bg-carbon-800 rounded border border-graphite-border">
                                <div className="flex justify-between items-center mb-1">
                                    <span className="text-[11px] font-bold text-slate-300 uppercase">
                                        {budget.category}
                                    </span>
                                    <div className="flex items-center gap-2">
                                        <span className={`text-[10px] font-bold ${labelColor}`}>
                                            {pct}%
                                        </span>
                                        <button
                                            onClick={() => openEdit(budget)}
                                            className="text-slate-low hover:text-crisp-white transition-colors"
                                            title="Editar"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
                                                <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                                            </svg>
                                        </button>
                                        {isConfirmingDelete ? (
                                            <div className="flex items-center gap-1">
                                                <button
                                                    onClick={() => handleDelete(budget.id)}
                                                    className="text-[9px] font-bold text-crimson-bright hover:text-crimson-bright/80 transition-colors"
                                                >
                                                    Confirmar
                                                </button>
                                                <button
                                                    onClick={() => setConfirmDeleteId(null)}
                                                    className="text-[9px] font-bold text-slate-low hover:text-crisp-white transition-colors"
                                                >
                                                    Cancelar
                                                </button>
                                            </div>
                                        ) : (
                                            <button
                                                onClick={() => setConfirmDeleteId(budget.id)}
                                                className="text-slate-low hover:text-crimson-bright transition-colors"
                                                title="Excluir"
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
                                                    <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                                                </svg>
                                            </button>
                                        )}
                                    </div>
                                </div>
                                <div className="w-full bg-carbon-950 h-1.5 rounded-full mb-1.5">
                                    <div
                                        className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                                        style={{ width: `${Math.max(pct, 2)}%` }}
                                    />
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-[10px] text-slate-low">
                                        {formatBRL(spent)} gastos
                                    </span>
                                    <span className="text-[10px] text-slate-low">
                                        limite {formatBRL(budget.amount)}
                                    </span>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            {/* Create / Edit Dialog */}
            <Transition appear show={isOpen} as={Fragment}>
                <Dialog as="div" className="relative z-50" onClose={handleClose}>
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
                                        {editingBudget ? 'Editar Limite de Gasto' : 'Definir Limite de Gasto'}
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
                                                disabled={!!editingBudget}
                                                className="w-full bg-charcoal-bg border border-graphite-border rounded-lg px-4 py-2.5 text-sm text-crisp-white placeholder:text-slate-low/50 focus:ring-1 focus:ring-royal-purple focus:border-royal-purple outline-none transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
                                                onClick={handleClose}
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
