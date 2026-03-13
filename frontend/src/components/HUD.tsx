'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';
import OnboardingModal from './OnboardingModal';

interface HUDData {
    safe_to_spend: number;
    burn_rate: {
        value: number;
        status: string;
        daily_avg: number;
    };
    invoice_projection: number;
    income: number;
    expected_income: number;
    realized_income: number;
    needs_onboarding: boolean;
    income_mode?: string;
    manual_income?: number;
}

const formatBRL = (val: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

export default function HUD() {
    const [data, setData] = useState<HUDData | null>(null);
    const [loading, setLoading] = useState(true);
    const [showOnboarding, setShowOnboarding] = useState(false);
    const [showIncomeModal, setShowIncomeModal] = useState(false);
    const [editingIncome, setEditingIncome] = useState(false);
    const [incomeInput, setIncomeInput] = useState('');
    const [savingIncome, setSavingIncome] = useState(false);

    const fetchData = async () => {
        try {
            const res = await api.get('/api/dashboard/hud');
            setData(res.data);
            if (res.data.needs_onboarding) {
                setShowOnboarding(true);
            }
        } catch (error) {
            console.error("Failed to fetch HUD data", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const handleOnboardingComplete = () => {
        setShowOnboarding(false);
        setLoading(true);
        fetchData();
    };

    const handleSaveIncome = async () => {
        const value = parseFloat(incomeInput.replace(',', '.'));
        if (isNaN(value) || value < 0) return;
        setSavingIncome(true);
        try {
            await api.put('/api/dashboard/income', { monthly_income: value, income_mode: 'manual' });
            setEditingIncome(false);
            setShowIncomeModal(false);
            setLoading(true);
            fetchData();
        } catch (e) {
            console.error('Failed to save income', e);
        } finally {
            setSavingIncome(false);
        }
    };

    if (loading) {
        return (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 animate-pulse">
                {[1, 2, 3].map(i => (
                    <div key={i} className="h-28 bg-graphite-card rounded-xl border border-graphite-border" />
                ))}
            </div>
        );
    }

    if (!data) return null;

    const burnLabel =
        data.burn_rate.status === 'Critical' ? 'Crítica' :
            data.burn_rate.status === 'Warning' ? 'Moderada' : 'Saudável';

    const burnPercent = Math.min(100, Math.round(data.burn_rate.value));

    const incomePercent = data ? Math.min(100, data.income > 0 ? Math.round((data.realized_income / data.income) * 100) : 0) : 0;

    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <OnboardingModal
                isOpen={showOnboarding}
                onComplete={handleOnboardingComplete}
            />

            {/* Income Modal */}
            {showIncomeModal && data && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => { setShowIncomeModal(false); setEditingIncome(false); }}>
                    <div className="bg-graphite-card border border-graphite-border rounded-2xl p-6 w-full max-w-sm mx-4 shadow-2xl space-y-5" onClick={e => e.stopPropagation()}>
                        {/* Header */}
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <span className="material-symbols-outlined text-royal-purple">payments</span>
                                <p className="text-sm font-bold text-crisp-white uppercase tracking-widest">Receita do Mês</p>
                            </div>
                            <button onClick={() => { setShowIncomeModal(false); setEditingIncome(false); }} className="text-slate-low hover:text-crisp-white transition-colors">
                                <span className="material-symbols-outlined text-[20px]">close</span>
                            </button>
                        </div>

                        {/* Mode badge */}
                        <div className="flex items-center gap-2">
                            <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border ${data.income_mode === 'auto' ? 'text-royal-purple border-royal-purple/40 bg-royal-purple/10' : 'text-emerald-vibrant border-emerald-vibrant/40 bg-emerald-vibrant/10'}`}>
                                {data.income_mode === 'auto' ? 'Modo Automático' : 'Modo Manual'}
                            </span>
                            {data.income_mode === 'auto' && (
                                <span className="text-[10px] text-slate-low">Média dos últimos 3 meses</span>
                            )}
                        </div>

                        {/* Rows */}
                        <div className="space-y-3">
                            <div className="flex justify-between items-center py-3 border-b border-graphite-border">
                                <div>
                                    <p className="text-[10px] text-slate-low uppercase tracking-wider">Renda Esperada</p>
                                    <p className="text-[9px] text-slate-low/60">{data.income_mode === 'auto' ? 'Calculada automaticamente' : 'Configurada manualmente'}</p>
                                </div>
                                <p className="text-base font-bold text-crisp-white">{formatBRL(data.expected_income)}</p>
                            </div>

                            <div className="flex justify-between items-center py-3 border-b border-graphite-border">
                                <div>
                                    <p className="text-[10px] text-slate-low uppercase tracking-wider">Realizado no Mês</p>
                                    <p className="text-[9px] text-slate-low/60">Entradas registradas até hoje</p>
                                </div>
                                <p className={`text-base font-bold ${data.realized_income >= data.expected_income ? 'text-emerald-vibrant' : 'text-crisp-white'}`}>{formatBRL(data.realized_income)}</p>
                            </div>

                            <div className="flex justify-between items-center py-3">
                                <div>
                                    <p className="text-[10px] text-slate-low uppercase tracking-wider">Renda Efetiva</p>
                                    <p className="text-[9px] text-slate-low/60">Usada nos cálculos (max dos dois)</p>
                                </div>
                                <p className="text-base font-bold text-royal-purple">{formatBRL(data.income)}</p>
                            </div>
                        </div>

                        {/* Progress bar */}
                        <div className="space-y-1.5">
                            <div className="flex justify-between text-[9px] text-slate-low uppercase">
                                <span>Progresso da receita</span>
                                <span>{incomePercent}%</span>
                            </div>
                            <div className="h-2 bg-graphite-border rounded-full overflow-hidden">
                                <div className="h-full bg-emerald-vibrant/70 rounded-full transition-all duration-500" style={{ width: `${incomePercent}%` }} />
                            </div>
                        </div>

                        {/* Edit income (manual mode) */}
                        {!editingIncome ? (
                            <button
                                onClick={() => { setEditingIncome(true); setIncomeInput(String(data.manual_income ?? data.expected_income)); }}
                                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-royal-purple/30 text-royal-purple hover:bg-royal-purple/10 transition-colors text-xs font-bold uppercase tracking-widest"
                            >
                                <span className="material-symbols-outlined text-[16px]">edit</span>
                                Editar Renda Manual
                            </button>
                        ) : (
                            <div className="space-y-2">
                                <p className="text-[10px] text-slate-low uppercase tracking-wider">Nova renda mensal (R$)</p>
                                <input
                                    type="number"
                                    value={incomeInput}
                                    onChange={e => setIncomeInput(e.target.value)}
                                    className="w-full bg-charcoal-bg border border-graphite-border rounded-lg px-3 py-2 text-crisp-white text-sm focus:border-royal-purple focus:outline-none"
                                    placeholder="0,00"
                                    autoFocus
                                />
                                <div className="flex gap-2">
                                    <button onClick={() => setEditingIncome(false)} className="flex-1 py-2 rounded-lg border border-graphite-border text-slate-low hover:text-crisp-white text-xs transition-colors">Cancelar</button>
                                    <button onClick={handleSaveIncome} disabled={savingIncome} className="flex-1 py-2 rounded-lg bg-royal-purple text-white text-xs font-bold disabled:opacity-50 transition-opacity">
                                        {savingIncome ? 'Salvando...' : 'Salvar'}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
            {/* Safe-to-Spend */}
            <div className="flex flex-col gap-2 rounded-xl p-6 bg-graphite-card border border-graphite-border relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                    <span className="material-symbols-outlined text-emerald-vibrant scale-150">account_balance_wallet</span>
                </div>
                <p className="text-slate-low text-[10px] font-bold uppercase tracking-[0.15em]">Safe-to-Spend</p>
                <p className={`text-3xl font-bold tracking-tight subtle-glow-emerald ${data.safe_to_spend > 0 ? 'text-emerald-vibrant' : 'text-crimson-bright subtle-glow-crimson'}`}>
                    {formatBRL(data.safe_to_spend)}
                </p>
                <div className="flex items-center gap-2">
                    <span className="text-emerald-vibrant/90 text-xs font-medium">
                        Livre para gastar
                    </span>
                    <span className="material-symbols-outlined text-xs text-emerald-vibrant/90">trending_up</span>
                </div>
            </div>

            {/* Burn Rate Speedometer */}
            <div className="flex flex-col gap-2 rounded-xl p-6 bg-graphite-card border border-graphite-border">
                <p className="text-slate-low text-[10px] font-bold uppercase tracking-[0.15em]">Burn Rate Speedometer</p>
                <div className="flex items-end justify-between">
                    <div>
                        <p className="text-2xl font-bold text-crisp-white">{burnLabel}</p>
                        <p className="text-crimson-bright/90 text-xs font-medium subtle-glow-crimson">
                            {burnPercent}% do limite de segurança
                        </p>
                    </div>
                    <div className="w-24 h-12 relative overflow-hidden">
                        <div className="absolute inset-0 rounded-t-full border-4 border-graphite-border" />
                        <div
                            className="absolute inset-0 rounded-t-full border-4 border-crimson-bright/40"
                            style={{ clipPath: `inset(0 ${100 - burnPercent}% 0 0)` }}
                        />
                        <div
                            className="absolute bottom-0 left-1/2 w-0.5 h-10 bg-crisp-white origin-bottom -translate-x-1/2"
                            style={{ transform: `translateX(-50%) rotate(${-90 + (burnPercent * 1.8)}deg)` }}
                        />
                    </div>
                </div>
                <p className="text-xs text-slate-low">
                    Média: {formatBRL(data.burn_rate.daily_avg)}/dia
                </p>
            </div>

            {/* Projected CC Bill */}
            <div className="flex flex-col gap-2 rounded-xl p-6 bg-graphite-card border border-graphite-border">
                <div className="flex items-center justify-between">
                    <p className="text-slate-low text-[10px] font-bold uppercase tracking-[0.15em]">Soma das Faturas</p>
                    <button
                        onClick={() => setShowIncomeModal(true)}
                        className="flex items-center gap-1 text-[9px] text-royal-purple/70 hover:text-royal-purple transition-colors uppercase tracking-widest font-bold"
                        title="Ver detalhes da receita"
                    >
                        <span className="material-symbols-outlined text-[14px]">payments</span>
                        Receita
                    </button>
                </div>
                <p className="text-3xl font-bold tracking-tight text-crisp-white">
                    {formatBRL(data.invoice_projection)}
                </p>
                <div className="flex items-center gap-2">
                    <div className="h-1.5 flex-1 bg-graphite-border rounded-full overflow-hidden">
                        <div
                            className="h-full bg-crimson-bright/60"
                            style={{ width: `${Math.min(100, data.income > 0 ? Math.round((data.invoice_projection / data.income) * 100) : 0)}%` }}
                        />
                    </div>
                    <span className="text-[10px] font-bold text-slate-low uppercase">
                        {data.income > 0 ? Math.round((data.invoice_projection / data.income) * 100) : 0}% da renda
                    </span>
                </div>
                <div className="flex justify-between items-center mt-auto pt-2">
                    <p className="text-[9px] text-slate-low uppercase tracking-wider">
                        Realizado: <span className="text-emerald-vibrant/80 font-bold">{formatBRL(data.realized_income)}</span>
                    </p>
                    <p className="text-[9px] text-slate-low uppercase tracking-wider">
                        Meta: <span className="text-royal-purple/80 font-bold">{formatBRL(data.expected_income)}</span>
                    </p>
                </div>
            </div>
        </div>
    );
}
