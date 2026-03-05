'use client';

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from 'recharts';
import { TOOLTIP_STYLE, GRID_STYLE, AXIS_TICK_STYLE, LABEL_STYLE, formatBRL } from './chartConfig';

interface Holding {
    ticker: string;
    gain_loss: number;
}

interface GainLossWaterfallProps {
    holdings: Holding[];
}

export default function GainLossWaterfall({ holdings }: GainLossWaterfallProps) {
    const data = [...holdings]
        .sort((a, b) => a.gain_loss - b.gain_loss)
        .map((h) => ({
            ticker: h.ticker,
            value: Math.round(h.gain_loss * 100) / 100,
        }));

    if (data.length === 0) {
        return (
            <div className="h-[280px] flex items-center justify-center text-slate-low text-sm">
                Sem dados
            </div>
        );
    }

    return (
        <div className="h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 20 }}>
                    <CartesianGrid {...GRID_STYLE} vertical={false} />
                    <XAxis
                        dataKey="ticker"
                        axisLine={false}
                        tickLine={false}
                        tick={AXIS_TICK_STYLE}
                        dy={10}
                        angle={-30}
                        textAnchor="end"
                    />
                    <YAxis
                        axisLine={false}
                        tickLine={false}
                        tick={AXIS_TICK_STYLE}
                        tickFormatter={(v) => `${v >= 0 ? '+' : ''}${(v / 1000).toFixed(1)}k`}
                        width={48}
                    />
                    <Tooltip
                        contentStyle={TOOLTIP_STYLE}
                        labelStyle={LABEL_STYLE}
                        formatter={(value: number | undefined) => value !== undefined ? [formatBRL(value), 'Ganho/Perda'] : ['---', 'Ganho/Perda']}
                    />
                    <ReferenceLine y={0} stroke="#374151" />
                    <Bar dataKey="value" radius={[4, 4, 0, 0]} barSize={28} animationDuration={1200}>
                        {data.map((entry) => (
                            <Cell
                                key={entry.ticker}
                                fill={entry.value >= 0 ? '#34D399' : '#EF4444'}
                                fillOpacity={0.85}
                            />
                        ))}
                    </Bar>
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
}
