'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import api from '@/lib/api';

interface OnboardingModalProps {
    isOpen: boolean;
    onComplete: (income: number) => void;
}

export default function OnboardingModal({ isOpen, onComplete }: OnboardingModalProps) {
    const [income, setIncome] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const numIncome = parseFloat(income.replace(/[^\d]/g, '')) / 100;

        if (numIncome <= 0 || isNaN(numIncome)) {
            setError('Por favor, insira um valor válido.');
            return;
        }

        setLoading(true);
        setError('');

        try {
            await api.post('/api/dashboard/profile', { monthly_income: numIncome });
            onComplete(numIncome);
        } catch (err) {
            console.error('Failed to update profile', err);
            setError('Ocorreu um erro ao salvar. Tente novamente.');
        } finally {
            setLoading(false);
        }
    };

    const formatCurrency = (value: string) => {
        const digits = value.replace(/\D/g, '');
        const amount = parseFloat(digits) / 100;
        return new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL',
        }).format(amount || 0);
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 bg-charcoal-bg/90 backdrop-blur-md"
                    />

                    {/* Modal Content */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9, y: 20 }}
                        className="relative w-full max-w-md bg-graphite-card border border-royal-purple/30 rounded-2xl p-8 shadow-2xl"
                    >
                        <div className="flex flex-col items-center text-center gap-6">
                            {/* Icon/Logo */}
                            <div className="size-16 bg-royal-purple/10 rounded-2xl flex items-center justify-center border border-royal-purple/20">
                                <span className="material-symbols-outlined text-royal-purple text-4xl subtle-glow-purple">
                                    account_balance_wallet
                                </span>
                            </div>

                            <div className="space-y-2">
                                <h2 className="text-2xl font-bold tracking-tight text-crisp-white">Bem-vindo ao Cortex!</h2>
                                <p className="text-sm text-slate-low leading-relaxed">
                                    Para calibrarmos seus indicadores de saúde financeira, precisamos saber qual sua **renda mensal média**.
                                </p>
                            </div>

                            <form onSubmit={handleSubmit} className="w-full space-y-4">
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-slate-low uppercase tracking-widest pl-1">
                                        Renda Mensal Estimada
                                    </label>
                                    <div className="relative">
                                        <input
                                            type="text"
                                            value={formatCurrency(income)}
                                            onChange={(e) => setIncome(e.target.value)}
                                            placeholder="R$ 0,00"
                                            className="w-full bg-charcoal-bg border border-graphite-border rounded-xl px-4 py-4 text-xl font-bold text-crisp-white focus:border-royal-purple outline-none transition-colors placeholder:text-slate-low/30"
                                            required
                                        />
                                        {loading && (
                                            <div className="absolute right-4 top-1/2 -translate-y-1/2">
                                                <div className="size-5 border-2 border-royal-purple border-t-transparent rounded-full animate-spin" />
                                            </div>
                                        )}
                                    </div>
                                    {error && <p className="text-xs text-crimson-bright font-medium mt-1 pl-1">{error}</p>}
                                </div>

                                <button
                                    type="submit"
                                    disabled={loading || !income}
                                    className="w-full bg-royal-purple hover:bg-royal-purple/90 disabled:opacity-50 text-white font-bold py-4 rounded-xl shadow-lg shadow-royal-purple/20 transition-all transform hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2"
                                >
                                    Começar Análise
                                    <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
                                </button>
                            </form>

                            <p className="text-[10px] text-slate-low/50 italic">
                                Seus dados são criptografados e usados apenas para gerar seus indicadores.
                            </p>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}
