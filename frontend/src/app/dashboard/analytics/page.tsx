'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { motion } from 'framer-motion';
import BalanceForecast from '@/components/charts/BalanceForecast';
import CashflowBars from '@/components/charts/CashflowBars';

interface ForecastData {
    status: string;
    message?: string;
    current_balance: number;
    avg_income: number;
    avg_expense: number;
    avg_net: number;
    projections: any[];
    risk: string;
}

interface CashflowRow {
    month: string;
    income: number;
    expenses: number;
    net: number;
}

const formatBRL = (val: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

export default function AnalyticsPage() {
    const [forecast, setForecast] = useState<ForecastData | null>(null);
    const [cashflow, setCashflow] = useState<CashflowRow[]>([]);
    const [anomalies, setAnomalies] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [forecastRes, cashflowRes, anomaliesRes] = await Promise.all([
                    api.get('/api/analytics/forecast'),
                    api.get('/api/analytics/cashflow'),
                    api.get('/api/analytics/anomalies'),
                ]);
                setForecast(forecastRes.data);
                setCashflow(cashflowRes.data);
                setAnomalies(anomaliesRes.data);
            } catch (error) {
                console.error("Failed to fetch analytics data", error);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, []);

    if (loading) {
        return (
            <div className="p-8 flex items-center justify-center min-h-[60vh]">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-10 h-10 border-4 border-royal-purple border-t-transparent rounded-full animate-spin" />
                    <p className="text-slate-low text-xs font-bold uppercase tracking-widest">Calculando Projeções...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="p-8 max-w-7xl mx-auto space-y-8">
            <header className="flex flex-col gap-1">
                <h2 className="text-2xl font-bold text-crisp-white tracking-tight">Intelligence & Analytics</h2>
                <p className="text-xs text-slate-low font-bold uppercase tracking-[0.2em]">Visão preditiva e análise de comportamento</p>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Forecast Card */}
                <div className="lg:col-span-2 bg-graphite-card border border-graphite-border rounded-2xl p-8 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
                        <span className="material-symbols-outlined text-royal-purple text-8xl">timeline</span>
                    </div>

                    <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-3">
                            <span className="material-symbols-outlined text-royal-purple">auto_awesome</span>
                            <h3 className="text-lg font-bold text-crisp-white">Projeção Patrimonial</h3>
                        </div>
                        <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-[0.15em] ${forecast?.risk === 'LOW' ? 'bg-emerald-vibrant/10 text-emerald-vibrant border border-emerald-vibrant/20' : 'bg-crimson-bright/10 text-crimson-bright border border-crimson-bright/20'
                            }`}>
                            Risco: {forecast?.risk === 'LOW' ? 'Baixo' : 'Alto'}
                        </span>
                    </div>
                    <p className="text-[10px] text-slate-low uppercase font-bold tracking-widest mb-8">Baseado na média dos últimos 6 meses</p>

                    {forecast?.status === 'ok' ? (
                        <BalanceForecast
                            data={forecast.projections}
                            currentBalance={forecast.current_balance}
                        />
                    ) : (
                        <div className="h-[300px] flex items-center justify-center border border-dashed border-graphite-border rounded-xl">
                            <p className="text-slate-low text-xs italic">{forecast?.message || 'Dados insuficientes'}</p>
                        </div>
                    )}
                </div>

                {/* Performance HUD */}
                <div className="space-y-6">
                    <div className="bg-graphite-card border border-graphite-border rounded-2xl p-6">
                        <h4 className="text-[10px] font-black text-slate-low uppercase tracking-[0.2em] mb-4">Métricas Médias Mensais</h4>
                        <div className="space-y-4">
                            <div className="flex justify-between items-end border-b border-graphite-border/50 pb-2">
                                <span className="text-xs text-slate-low font-medium italic">Renda Média</span>
                                <span className="text-sm font-bold text-emerald-vibrant">{formatBRL(forecast?.avg_income || 0)}</span>
                            </div>
                            <div className="flex justify-between items-end border-b border-graphite-border/50 pb-2">
                                <span className="text-xs text-slate-low font-medium italic">Gasto Médio</span>
                                <span className="text-sm font-bold text-crimson-bright">{formatBRL(forecast?.avg_expense || 0)}</span>
                            </div>
                            <div className="flex justify-between items-end pt-2">
                                <span className="text-xs font-bold text-crisp-white uppercase tracking-wider">Net Mensal</span>
                                <span className={`text-lg font-black ${(forecast?.avg_net || 0) >= 0 ? 'text-emerald-vibrant' : 'text-crimson-bright'}`}>
                                    {(forecast?.avg_net || 0) >= 0 ? '+' : '-'} {formatBRL(Math.abs(forecast?.avg_net || 0))}
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className="bg-graphite-card border border-graphite-border rounded-2xl p-6 relative overflow-hidden">
                        <div className="absolute inset-0 bg-gradient-to-br from-royal-purple/5 to-transparent pointer-events-none" />
                        <h4 className="text-[10px] font-black text-slate-low uppercase tracking-[0.2em] mb-4">Pulse de Anomalias</h4>
                        {anomalies.length > 0 ? (
                            <div className="space-y-3">
                                {anomalies.map((a, i) => (
                                    <div key={i} className="flex items-center gap-3 p-3 bg-charcoal-bg/50 rounded-lg border border-graphite-border/30">
                                        <span className="material-symbols-outlined text-crimson-bright text-lg">warning</span>
                                        <div>
                                            <p className="text-[10px] font-bold text-crisp-white uppercase">{a.category}</p>
                                            <p className="text-[9px] text-slate-low tracking-tight">{a.message}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="flex flex-col items-center gap-2 py-4">
                                <span className="material-symbols-outlined text-emerald-vibrant animate-pulse">check_circle</span>
                                <p className="text-[9px] font-bold text-slate-low uppercase tracking-widest">Nenhuma anomalia crítica</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Cashflow Bar Chart */}
            <div className="bg-graphite-card border border-graphite-border rounded-2xl p-8">
                <div className="flex items-center gap-3 mb-2">
                    <span className="material-symbols-outlined text-emerald-vibrant">swap_vert</span>
                    <h3 className="text-lg font-bold text-crisp-white">Fluxo de Caixa (Income vs Expenses)</h3>
                </div>
                <p className="text-[10px] text-slate-low uppercase font-bold tracking-widest mb-8">Análise histórica mensal consolidada</p>

                <CashflowBars data={cashflow} />
            </div>
        </div>
    );
}
