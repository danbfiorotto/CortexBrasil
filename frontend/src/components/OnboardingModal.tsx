'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import api from '@/lib/api';

interface OnboardingModalProps {
    isOpen: boolean;
    onComplete: (income: number) => void;
}

export default function OnboardingModal({ isOpen, onComplete }: OnboardingModalProps) {
    const [mode, setMode] = useState<'auto' | 'manual'>('auto');
    const [income, setIncome] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        let numIncome = 0;
        if (mode === 'manual') {
            numIncome = parseFloat(income.replace(/[^\d]/g, '')) / 100;
            if (numIncome <= 0 || isNaN(numIncome)) {
                setError('Por favor, insira um valor válido.');
                return;
            }
        }

        setLoading(true);
        setError('');

        try {
            await api.post('/api/dashboard/profile', {
                monthly_income: numIncome,
                income_mode: mode,
            });
            onComplete(numIncome);
        } catch (err) {
            console.error('Failed to update profile', err);
            setError('Ocorreu um erro ao salvar. Tente novamente.');
        } finally {
            setLoading(false);
        }
    };

    const handleSkip = async () => {
        setLoading(true);
        try {
            await api.post('/api/dashboard/profile', { income_mode: 'auto', monthly_income: 0 });
            onComplete(0);
        } catch {
            onComplete(0);
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
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 bg-charcoal-bg/90 backdrop-blur-md"
                    />

                    <motion.div
                        initial={{ opacity: 0, scale: 0.9, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9, y: 20 }}
                        className="relative w-full max-w-md bg-graphite-card border border-royal-purple/30 rounded-2xl p-8 shadow-2xl"
                    >
                        <div className="flex flex-col items-center text-center gap-6">
                            {/* Icon */}
                            <div className="size-16 bg-royal-purple/10 rounded-2xl flex items-center justify-center border border-royal-purple/20">
                                <span className="material-symbols-outlined text-royal-purple text-4xl subtle-glow-purple">
                                    account_balance_wallet
                                </span>
                            </div>

                            <div className="space-y-2">
                                <h2 className="text-2xl font-bold tracking-tight text-crisp-white">Bem-vindo ao Cortex!</h2>
                                <p className="text-sm text-slate-low leading-relaxed">
                                    Como você prefere que o Cortex calcule sua renda esperada?
                                </p>
                            </div>

                            {/* Mode selector */}
                            <div className="w-full grid grid-cols-2 gap-3">
                                <button
                                    type="button"
                                    onClick={() => setMode('auto')}
                                    className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-all ${
                                        mode === 'auto'
                                            ? 'border-royal-purple bg-royal-purple/10 text-crisp-white'
                                            : 'border-graphite-border bg-charcoal-bg text-slate-low hover:border-royal-purple/50'
                                    }`}
                                >
                                    <span className="material-symbols-outlined text-[28px]">auto_awesome</span>
                                    <div>
                                        <p className="text-xs font-bold uppercase tracking-wider">Automático</p>
                                        <p className="text-[10px] mt-0.5 leading-tight">Média dos últimos 3 meses de receita</p>
                                    </div>
                                </button>

                                <button
                                    type="button"
                                    onClick={() => setMode('manual')}
                                    className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-all ${
                                        mode === 'manual'
                                            ? 'border-royal-purple bg-royal-purple/10 text-crisp-white'
                                            : 'border-graphite-border bg-charcoal-bg text-slate-low hover:border-royal-purple/50'
                                    }`}
                                >
                                    <span className="material-symbols-outlined text-[28px]">edit</span>
                                    <div>
                                        <p className="text-xs font-bold uppercase tracking-wider">Manual</p>
                                        <p className="text-[10px] mt-0.5 leading-tight">Defino um valor fixo mensal</p>
                                    </div>
                                </button>
                            </div>

                            {/* Auto mode explanation */}
                            <AnimatePresence mode="wait">
                                {mode === 'auto' && (
                                    <motion.div
                                        key="auto"
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: 'auto' }}
                                        exit={{ opacity: 0, height: 0 }}
                                        className="w-full bg-emerald-vibrant/5 border border-emerald-vibrant/20 rounded-xl px-4 py-3 text-left"
                                    >
                                        <p className="text-xs text-emerald-vibrant font-medium">
                                            Ideal para renda variável ou múltiplas fontes. O Cortex vai calcular automaticamente conforme você registrar receitas.
                                        </p>
                                    </motion.div>
                                )}

                                {mode === 'manual' && (
                                    <motion.form
                                        key="manual"
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: 'auto' }}
                                        exit={{ opacity: 0, height: 0 }}
                                        onSubmit={handleSubmit}
                                        className="w-full space-y-3"
                                    >
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
                                                />
                                                {loading && (
                                                    <div className="absolute right-4 top-1/2 -translate-y-1/2">
                                                        <div className="size-5 border-2 border-royal-purple border-t-transparent rounded-full animate-spin" />
                                                    </div>
                                                )}
                                            </div>
                                            {error && <p className="text-xs text-crimson-bright font-medium mt-1 pl-1">{error}</p>}
                                        </div>
                                    </motion.form>
                                )}
                            </AnimatePresence>

                            {/* Actions */}
                            <div className="w-full space-y-2">
                                <button
                                    type="button"
                                    onClick={mode === 'auto' ? handleSkip : handleSubmit as any}
                                    disabled={loading || (mode === 'manual' && !income)}
                                    className="w-full bg-royal-purple hover:bg-royal-purple/90 disabled:opacity-50 text-white font-bold py-4 rounded-xl shadow-lg shadow-royal-purple/20 transition-all transform hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2"
                                >
                                    {loading ? (
                                        <div className="size-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                    ) : (
                                        <>
                                            Começar
                                            <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
                                        </>
                                    )}
                                </button>

                                <button
                                    type="button"
                                    onClick={handleSkip}
                                    disabled={loading}
                                    className="w-full py-2 text-xs text-slate-low hover:text-crisp-white transition-colors"
                                >
                                    Configurar depois nas Configurações
                                </button>
                            </div>

                            <p className="text-[10px] text-slate-low/50 italic">
                                Você pode alterar isso a qualquer momento em Configurações.
                            </p>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}
