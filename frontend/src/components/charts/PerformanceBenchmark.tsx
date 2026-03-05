'use client';

import { useState, useEffect, useCallback } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import Cookies from 'js-cookie';
import { BENCHMARK_COLORS, TOOLTIP_STYLE, GRID_STYLE, AXIS_TICK_STYLE, LABEL_STYLE } from './chartConfig';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

type Period = '1m' | '3m' | '6m' | '1y' | 'all';

interface DataPoint {
    date: string;
    value: number;
}

interface PerformanceSeries {
    portfolio?: DataPoint[];
    IBOV?: DataPoint[];
    CDI?: DataPoint[];
    SP500?: DataPoint[];
}

interface PerformanceResponse {
    series: PerformanceSeries;
    empty: boolean;
    message?: string;
    period?: string;
}

const PERIODS: { label: string; value: Period }[] = [
    { label: '1M', value: '1m' },
    { label: '3M', value: '3m' },
    { label: '6M', value: '6m' },
    { label: '1A', value: '1y' },
    { label: 'Tudo', value: 'all' },
];

const LINE_NAMES: Record<string, string> = {
    portfolio: 'Carteira',
    IBOV: 'IBOV',
    CDI: 'CDI',
    SP500: 'S&P 500',
};

export default function PerformanceBenchmark() {
    const [period, setPeriod] = useState<Period>('1y');
    const [data, setData] = useState<PerformanceResponse | null>(null);
    const [loading, setLoading] = useState(true);

    const fetchData = useCallback(async (p: Period) => {
        setLoading(true);
        const token = Cookies.get('token');
        try {
            const res = await fetch(
                `${API_URL}/api/analytics/investments/performance?period=${p}`,
                { headers: { Authorization: `Bearer ${token}` } }
            );
            if (res.ok) setData(await res.json());
        } catch (e) {
            console.error('Failed to fetch performance:', e);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData(period);
    }, [period, fetchData]);

    // Merge all series into a single array keyed by date
    const merged = (() => {
        if (!data?.series) return [];
        const byDate: Record<string, Record<string, number>> = {};
        for (const [key, points] of Object.entries(data.series)) {
            for (const pt of (points as DataPoint[]) ?? []) {
                if (!byDate[pt.date]) byDate[pt.date] = {};
                byDate[pt.date][key] = pt.value;
            }
        }
        return Object.entries(byDate)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([date, vals]) => ({ date, ...vals }));
    })();

    const seriesKeys = Object.keys(data?.series ?? {});

    return (
        <div className="space-y-4">
            {/* Period selector */}
            <div className="flex gap-1 p-1 rounded-xl bg-charcoal-bg border border-graphite-border w-fit">
                {PERIODS.map(({ label, value }) => (
                    <button
                        key={value}
                        onClick={() => setPeriod(value)}
                        className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                            period === value
                                ? 'bg-royal-purple text-crisp-white'
                                : 'text-slate-low hover:text-crisp-white'
                        }`}
                    >
                        {label}
                    </button>
                ))}
            </div>

            {loading ? (
                <div className="h-[300px] flex items-center justify-center">
                    <div className="w-6 h-6 border-t-2 border-royal-purple rounded-full animate-spin" />
                </div>
            ) : data?.empty ? (
                <div className="h-[300px] flex items-center justify-center text-slate-low text-sm text-center px-6">
                    {data.message || 'Dados de performance estarão disponíveis após alguns dias de uso.'}
                </div>
            ) : (
                <div className="h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={merged} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                            <CartesianGrid {...GRID_STYLE} vertical={false} />
                            <XAxis
                                dataKey="date"
                                axisLine={false}
                                tickLine={false}
                                tick={AXIS_TICK_STYLE}
                                dy={10}
                                tickFormatter={(d: string) => {
                                    const dt = new Date(d);
                                    return `${dt.getDate()}/${dt.getMonth() + 1}`;
                                }}
                                interval="preserveStartEnd"
                            />
                            <YAxis
                                axisLine={false}
                                tickLine={false}
                                tick={AXIS_TICK_STYLE}
                                tickFormatter={(v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`}
                                width={52}
                            />
                            <Tooltip
                                contentStyle={TOOLTIP_STYLE}
                                labelStyle={LABEL_STYLE}
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                formatter={(value: any, name: any) => [
                                    value != null ? `${(value as number) >= 0 ? '+' : ''}${(value as number).toFixed(2)}%` : '---',
                                    LINE_NAMES[name as string] || name,
                                ]}
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                labelFormatter={(label: any) => {
                                    const dt = new Date(label as string);
                                    return dt.toLocaleDateString('pt-BR');
                                }}
                            />
                            <Legend
                                iconType="circle"
                                formatter={(value: string) => LINE_NAMES[value] || value}
                                wrapperStyle={{
                                    fontSize: '10px',
                                    fontWeight: 'bold',
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.08em',
                                }}
                            />
                            {seriesKeys.map((key) => (
                                <Line
                                    key={key}
                                    type="monotone"
                                    dataKey={key}
                                    stroke={BENCHMARK_COLORS[key as keyof typeof BENCHMARK_COLORS] || '#94A3B8'}
                                    strokeWidth={key === 'portfolio' ? 2.5 : 1.5}
                                    dot={false}
                                    animationDuration={1200}
                                    connectNulls
                                />
                            ))}
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            )}
        </div>
    );
}
