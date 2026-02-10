'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';

interface InsightResponse {
    insights: string[];
}

const INSIGHT_ICONS = ['savings', 'warning', 'bolt', 'lightbulb', 'trending_up'];
const INSIGHT_COLORS = [
    'text-royal-purple',
    'text-crimson-bright',
    'text-emerald-vibrant',
    'text-royal-purple',
    'text-emerald-vibrant',
];

export default function PulseFeed() {
    const [insights, setInsights] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);

    const generateInsights = async () => {
        setLoading(true);
        try {
            const res = await api.post('/api/dashboard/insights');
            setInsights(res.data.insights || []);
        } catch (error) {
            console.error("Failed to generate insights", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        generateInsights();
    }, []);

    return (
        <div>
            <div className="flex items-center gap-2 mb-4 px-2">
                <span className="material-symbols-outlined text-royal-purple text-[20px] subtle-glow-purple">auto_awesome</span>
                <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-royal-purple subtle-glow-purple">
                    IA Insights Feed
                </h3>
                <button
                    onClick={generateInsights}
                    disabled={loading}
                    className="ml-auto text-[9px] font-bold uppercase tracking-widest text-slate-low hover:text-royal-purple transition-colors disabled:opacity-50"
                >
                    {loading ? 'Analisando...' : 'Atualizar'}
                </button>
            </div>

            <div className="space-y-4 overflow-y-auto max-h-[600px] pr-2 custom-scrollbar">
                {loading ? (
                    <div className="space-y-4 animate-pulse">
                        {[1, 2, 3].map(i => (
                            <div key={i} className="h-24 bg-graphite-card rounded-xl border border-graphite-border" />
                        ))}
                    </div>
                ) : insights.length > 0 ? (
                    insights.map((insight, idx) => {
                        const isFirst = idx === 0;
                        const icon = INSIGHT_ICONS[idx % INSIGHT_ICONS.length];
                        const iconColor = INSIGHT_COLORS[idx % INSIGHT_COLORS.length];

                        return (
                            <div
                                key={idx}
                                className={`p-4 rounded-xl flex flex-col gap-3 relative shadow-sm ${isFirst
                                        ? 'bg-royal-purple/5 border border-royal-purple/20'
                                        : 'bg-graphite-card border border-graphite-border'
                                    }`}
                            >
                                {isFirst && (
                                    <div className="absolute top-3 right-3 text-[9px] font-black text-royal-purple tracking-widest uppercase">
                                        Agora
                                    </div>
                                )}
                                <div className="flex items-start gap-3">
                                    <span className={`material-symbols-outlined ${iconColor} text-xl`}>{icon}</span>
                                    <div className="flex-1">
                                        <p className="text-xs text-slate-low leading-relaxed">{insight}</p>
                                    </div>
                                </div>
                            </div>
                        );
                    })
                ) : (
                    <div className="text-center py-8">
                        <p className="text-slate-low text-xs">Nenhum insight disponível no momento.</p>
                    </div>
                )}
            </div>

            {!loading && insights.length > 0 && (
                <div className="mt-4 pt-3 border-t border-graphite-border">
                    <p className="text-[10px] text-slate-low text-center tracking-wider">
                        Baseado nas suas últimas 50 transações
                    </p>
                </div>
            )}
        </div>
    );
}
