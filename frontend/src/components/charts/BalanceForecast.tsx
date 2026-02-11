'use client';

import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';

interface Projection {
    month: string;
    projected_balance: number;
    is_negative: boolean;
}

interface BalanceForecastProps {
    data: Projection[];
    currentBalance: number;
}

const formatBRL = (val: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

export default function BalanceForecast({ data, currentBalance }: BalanceForecastProps) {
    // Add current balance as the starting point
    const chartData = [
        { month: 'Atual', projected_balance: currentBalance },
        ...data
    ];

    return (
        <div className="h-[300px] w-full mt-4">
            <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                        <linearGradient id="colorBalance" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0} />
                        </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1F2937" />
                    <XAxis
                        dataKey="month"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: '#94A3B8', fontSize: 10, fontWeight: 'bold' }}
                        dy={10}
                    />
                    <YAxis
                        hide
                        domain={['auto', 'auto']}
                    />
                    <Tooltip
                        contentStyle={{
                            backgroundColor: '#111827',
                            border: '1px solid #374151',
                            borderRadius: '8px',
                            fontSize: '12px',
                            fontWeight: 'bold',
                            color: '#F9FAFB'
                        }}
                        formatter={(value: number | undefined) => [value !== undefined ? formatBRL(value) : '---', 'Saldo Projetado']}
                        labelStyle={{ color: '#94A3B8', marginBottom: '4px' }}
                    />
                    <ReferenceLine y={0} stroke="#EF4444" strokeDasharray="3 3" />
                    <Area
                        type="monotone"
                        dataKey="projected_balance"
                        stroke="#8B5CF6"
                        strokeWidth={3}
                        fillOpacity={1}
                        fill="url(#colorBalance)"
                        animationDuration={1500}
                    />
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
}
