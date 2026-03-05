'use client';

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { ASSET_COLORS, ASSET_LABELS, TOOLTIP_STYLE, LABEL_STYLE, formatBRL } from './chartConfig';

interface Holding {
    type: string;
    current_value: number;
}

interface PortfolioAllocationProps {
    holdings: Holding[];
}

export default function PortfolioAllocation({ holdings }: PortfolioAllocationProps) {
    const grouped = holdings.reduce<Record<string, number>>((acc, h) => {
        acc[h.type] = (acc[h.type] || 0) + h.current_value;
        return acc;
    }, {});

    const total = Object.values(grouped).reduce((s, v) => s + v, 0);

    const data = Object.entries(grouped).map(([type, value]) => ({
        name: ASSET_LABELS[type] || type,
        type,
        value: Math.round(value * 100) / 100,
        pct: total > 0 ? (value / total) * 100 : 0,
    }));

    if (data.length === 0) {
        return (
            <div className="h-[260px] flex items-center justify-center text-slate-low text-sm">
                Sem dados de alocação
            </div>
        );
    }

    return (
        <div className="h-[260px] w-full">
            <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                    <Pie
                        data={data}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={90}
                        paddingAngle={3}
                        dataKey="value"
                        animationDuration={1200}
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        label={({ percent }: any) => percent != null ? `${(percent * 100).toFixed(1)}%` : ''}
                        labelLine={false}
                    >
                        {data.map((entry) => (
                            <Cell key={entry.type} fill={ASSET_COLORS[entry.type] || '#64748B'} />
                        ))}
                    </Pie>
                    <Tooltip
                        contentStyle={TOOLTIP_STYLE}
                        labelStyle={LABEL_STYLE}
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        formatter={(value: any, name: any) => value != null ? [formatBRL(value as number), name] : ['---', name]}
                    />
                    <Legend
                        iconType="circle"
                        wrapperStyle={{
                            fontSize: '10px',
                            fontWeight: 'bold',
                            textTransform: 'uppercase',
                            letterSpacing: '0.08em',
                        }}
                    />
                </PieChart>
            </ResponsiveContainer>
        </div>
    );
}
