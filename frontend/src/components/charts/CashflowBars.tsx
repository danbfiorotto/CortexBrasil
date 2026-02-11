'use client';

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

interface CashflowData {
    month: string;
    income: number;
    expenses: number;
    net: number;
}

interface CashflowBarsProps {
    data: CashflowData[];
}

const formatBRL = (val: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

export default function CashflowBars({ data }: CashflowBarsProps) {
    return (
        <div className="h-[300px] w-full mt-4">
            <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1F2937" />
                    <XAxis
                        dataKey="month"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: '#94A3B8', fontSize: 10, fontWeight: 'bold' }}
                        dy={10}
                    />
                    <YAxis hide />
                    <Tooltip
                        contentStyle={{
                            backgroundColor: '#111827',
                            border: '1px solid #374151',
                            borderRadius: '8px',
                            fontSize: '12px',
                            fontWeight: 'bold',
                            color: '#F9FAFB'
                        }}
                        formatter={(value: number | undefined) => value !== undefined ? formatBRL(value) : '---'}
                        labelStyle={{ color: '#94A3B8', marginBottom: '4px' }}
                    />
                    <Legend
                        verticalAlign="top"
                        align="right"
                        iconType="circle"
                        wrapperStyle={{
                            paddingBottom: '20px',
                            fontSize: '10px',
                            fontWeight: 'bold',
                            textTransform: 'uppercase',
                            letterSpacing: '0.1em'
                        }}
                    />
                    <Bar
                        name="Entradas"
                        dataKey="income"
                        fill="#10B981"
                        radius={[4, 4, 0, 0]}
                        barSize={30}
                        animationDuration={1500}
                    />
                    <Bar
                        name="Saídas"
                        dataKey="expenses"
                        fill="#EF4444"
                        radius={[4, 4, 0, 0]}
                        barSize={30}
                        animationDuration={1500}
                    />
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
}
