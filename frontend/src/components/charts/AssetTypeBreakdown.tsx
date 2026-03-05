'use client';

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell } from 'recharts';
import { ASSET_COLORS, ASSET_LABELS, TOOLTIP_STYLE, GRID_STYLE, AXIS_TICK_STYLE, LABEL_STYLE, formatBRL } from './chartConfig';

interface Holding {
    type: string;
    current_value: number;
    avg_price: number;
    quantity: number;
}

interface AssetTypeBreakdownProps {
    holdings: Holding[];
}

export default function AssetTypeBreakdown({ holdings }: AssetTypeBreakdownProps) {
    const grouped = holdings.reduce<Record<string, { cost: number; value: number }>>((acc, h) => {
        if (!acc[h.type]) acc[h.type] = { cost: 0, value: 0 };
        acc[h.type].cost += h.avg_price * h.quantity;
        acc[h.type].value += h.current_value;
        return acc;
    }, {});

    const data = Object.entries(grouped).map(([type, { cost, value }]) => ({
        name: ASSET_LABELS[type] || type,
        type,
        custo: Math.round(cost * 100) / 100,
        valor: Math.round(value * 100) / 100,
    }));

    if (data.length === 0) {
        return (
            <div className="h-[260px] flex items-center justify-center text-slate-low text-sm">
                Sem dados
            </div>
        );
    }

    return (
        <div className="h-[260px] w-full">
            <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data} layout="vertical" margin={{ top: 5, right: 16, left: 0, bottom: 5 }}>
                    <CartesianGrid {...GRID_STYLE} horizontal={false} />
                    <XAxis
                        type="number"
                        axisLine={false}
                        tickLine={false}
                        tick={AXIS_TICK_STYLE}
                        tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`}
                    />
                    <YAxis
                        type="category"
                        dataKey="name"
                        axisLine={false}
                        tickLine={false}
                        tick={AXIS_TICK_STYLE}
                        width={72}
                    />
                    <Tooltip
                        contentStyle={TOOLTIP_STYLE}
                        labelStyle={LABEL_STYLE}
                        formatter={(value: number | undefined) => value !== undefined ? [formatBRL(value)] : ['---']}
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
                    <Bar name="Custo" dataKey="custo" fill="#64748B" radius={[0, 4, 4, 0]} barSize={12} animationDuration={1200} />
                    <Bar name="Valor Atual" dataKey="valor" radius={[0, 4, 4, 0]} barSize={12} animationDuration={1200}>
                        {data.map((entry) => (
                            <Cell key={entry.type} fill={ASSET_COLORS[entry.type] || '#64748B'} />
                        ))}
                    </Bar>
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
}
