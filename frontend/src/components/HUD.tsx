'use client';

import { Card, Metric, Text, Flex, ProgressBar, BadgeDelta, Badge } from '@tremor/react';
import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { Activity, CreditCard, Wallet } from 'lucide-react';

interface HUDData {
    safe_to_spend: number;
    burn_rate: {
        value: number; // percentage
        status: string; // Good, Warning, Critical
        daily_avg: number;
    };
    invoice_projection: number;
    income: number;
}

export default function HUD() {
    const [data, setData] = useState<HUDData | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const res = await api.get('/api/dashboard/hud');
                setData(res.data);
            } catch (error) {
                console.error("Failed to fetch HUD data", error);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, []);

    if (loading) {
        return (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8 animate-pulse">
                {[1, 2, 3].map(i => (
                    <div key={i} className="h-24 bg-slate-800/50 rounded-lg"></div>
                ))}
            </div>
        );
    }

    if (!data) return null;

    // Helper to format currency
    const formatBRL = (val: number) =>
        new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

    // Burn Rate Color
    const burnColor = data.burn_rate.status === 'Critical' ? 'red' :
        data.burn_rate.status === 'Warning' ? 'amber' : 'emerald';

    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            {/* 1. Safe-to-Spend */}
            <Card className="bg-slate-900/50 border-slate-800 ring-1 ring-slate-700/50 backdrop-blur-md">
                <Flex justifyContent="start" className="space-x-4">
                    <div className={`p-2 rounded-full ${data.safe_to_spend > 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                        <Wallet className="w-6 h-6" />
                    </div>
                    <div>
                        <Text className="text-slate-400">Safe-to-Spend</Text>
                        <Metric className={`text-2xl ${data.safe_to_spend > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {formatBRL(data.safe_to_spend)}
                        </Metric>
                    </div>
                </Flex>
                <div className="mt-4">
                    <Text className="text-xs text-slate-500">
                        Livre para gastar (Renda - Fixos - Parcelas)
                    </Text>
                </div>
            </Card>

            {/* 2. Burn Rate */}
            <Card className="bg-slate-900/50 border-slate-800 ring-1 ring-slate-700/50 backdrop-blur-md">
                <Flex justifyContent="start" className="space-x-4 mb-2">
                    <div className={`p-2 rounded-full bg-${burnColor}-500/10 text-${burnColor}-400`}>
                        <Activity className="w-6 h-6" />
                    </div>
                    <div>
                        <Text className="text-slate-400">Burn Rate (Velocidade)</Text>
                        <Metric className="text-2xl text-slate-200">
                            {Math.round(data.burn_rate.value)}%
                        </Metric>
                    </div>
                </Flex>
                <ProgressBar value={data.burn_rate.value} color={burnColor} className="mt-2" />
                <Flex className="mt-2">
                    <Text className="text-xs text-slate-500">Média: {formatBRL(data.burn_rate.daily_avg)}/dia</Text>
                    <Badge size="xs" color={burnColor}>{data.burn_rate.status}</Badge>
                </Flex>
            </Card>

            {/* 3. Invoice Projection */}
            <Card className="bg-slate-900/50 border-slate-800 ring-1 ring-slate-700/50 backdrop-blur-md">
                <Flex justifyContent="start" className="space-x-4">
                    <div className="p-2 rounded-full bg-violet-500/10 text-violet-400">
                        <CreditCard className="w-6 h-6" />
                    </div>
                    <div>
                        <Text className="text-slate-400">Projeção Fatura</Text>
                        <Metric className="text-2xl text-violet-400">
                            {formatBRL(data.invoice_projection)}
                        </Metric>
                    </div>
                </Flex>
                <div className="mt-4">
                    <Text className="text-xs text-slate-500">
                        Estimativa de fechamento baseada no ritmo atual
                    </Text>
                </div>
            </Card>
        </div>
    );
}
