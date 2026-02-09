'use client';

import { Card, Title, Text, Button, Callout } from '@tremor/react';
import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { Sparkles, ArrowRight, AlertTriangle } from 'lucide-react';

interface InsightResponse {
    insights: string[];
}

export default function PulseFeed() {
    const [insights, setInsights] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);
    const [generated, setGenerated] = useState(false);

    const generateInsights = async () => {
        setLoading(true);
        try {
            const res = await api.post('/api/dashboard/insights');
            setInsights(res.data.insights || []);
            setGenerated(true);
        } catch (error) {
            console.error("Failed to generate insights", error);
        } finally {
            setLoading(false);
        }
    };

    // Auto-generate on first load if not present? 
    // Maybe better to let user trigger it to save tokens/time, or trigger once per session.
    // User spec says "feed de texto gerado por IA". Implies it's there.
    // I will trigger it automatically on mount.
    useEffect(() => {
        generateInsights();
    }, []);

    return (
        <Card className="h-full bg-slate-900/50 border-slate-800 ring-1 ring-slate-700/50 backdrop-blur-md">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-2">
                    <Sparkles className="w-5 h-5 text-purple-400 animate-pulse" />
                    <Title className="text-slate-200">Cortex Intelligence</Title>
                </div>
                <Button
                    size="xs"
                    variant="light"
                    color="purple"
                    onClick={generateInsights}
                    loading={loading}
                    disabled={loading}
                >
                    Atualizar Análise
                </Button>
            </div>

            <div className="space-y-4">
                {loading ? (
                    <div className="space-y-3 animate-pulse">
                        <div className="h-16 bg-slate-800/50 rounded-lg w-full"></div>
                        <div className="h-16 bg-slate-800/50 rounded-lg w-full"></div>
                    </div>
                ) : insights.length > 0 ? (
                    <div className="space-y-3">
                        {insights.map((insight, idx) => (
                            <div
                                key={idx}
                                className="p-4 rounded-lg bg-slate-800/40 border border-slate-700/50 hover:bg-slate-800/60 transition-all cursor-default group"
                            >
                                <div className="flex items-start gap-3">
                                    <div className="mt-1 min-w-[4px] h-4 rounded-full bg-purple-500/50 group-hover:bg-purple-400 transition-colors" />
                                    <div className="flex-1">
                                        <Text className="text-slate-300 font-medium leading-relaxed">
                                            {insight}
                                        </Text>
                                    </div>
                                    <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                                        <ArrowRight className="w-4 h-4 text-slate-500" />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="text-center py-8">
                        <Text className="text-slate-500">Nenhum insight disponível no momento.</Text>
                    </div>
                )}
            </div>

            {!loading && insights.length > 0 && (
                <div className="mt-6 pt-4 border-t border-slate-800/50">
                    <Text className="text-xs text-slate-500 text-center">
                        Baseado nas suas últimas 50 transações.
                    </Text>
                </div>
            )}
        </Card>
    );
}
