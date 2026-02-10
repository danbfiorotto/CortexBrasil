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
}

const formatBRL = (val: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

export default function HUD() {
    const [data, setData] = useState<HUDData | null>(null);
    const [loading, setLoading] = useState(true);
    const [showOnboarding, setShowOnboarding] = useState(false);

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

    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <OnboardingModal
                isOpen={showOnboarding}
                onComplete={handleOnboardingComplete}
            />
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
                <p className="text-slate-low text-[10px] font-bold uppercase tracking-[0.15em]">Projeção Fatura</p>
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
