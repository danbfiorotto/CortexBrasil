'use client';

import { Card, Title, AreaChart } from '@tremor/react';
import { useEffect, useState } from 'react';
import api from '@/lib/api';

export default function CommitmentMountain() {
    const [data, setData] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const res = await api.get('/api/dashboard/commitments');
                setData(res.data);
            } catch (error) {
                console.error("Failed to fetch commitments", error);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, []);

    const valueFormatter = (number: number) =>
        new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(number).toString();

    if (loading) return <div className="h-72 bg-slate-800/30 animate-pulse rounded-lg mt-6" />;

    if (data.length === 0) return null;

    return (
        <Card className="mt-6 bg-slate-900/50 border-slate-800 ring-1 ring-slate-700/50 backdrop-blur-md">
            <Title className="text-slate-200">Montanha de Compromissos (Parcelas Futuras)</Title>
            <div className="mt-4">
                <AreaChart
                    className="h-72 mt-4"
                    data={data}
                    index="month"
                    categories={["amount"]}
                    colors={["indigo"]}
                    valueFormatter={valueFormatter}
                    yAxisWidth={80}
                    showAnimation={true}
                    curveType="natural"
                    showGradient={true}
                />
            </div>
        </Card>
    );
}
