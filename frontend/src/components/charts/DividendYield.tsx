'use client';

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { TOOLTIP_STYLE, GRID_STYLE, AXIS_TICK_STYLE, LABEL_STYLE } from './chartConfig';

interface Holding {
    ticker: string;
    dividend_yield?: number | null;
}

interface DividendYieldProps {
    holdings: Holding[];
}

export default function DividendYield({ holdings }: DividendYieldProps) {
    const data = holdings
        .filter((h) => h.dividend_yield != null && h.dividend_yield > 0)
        .map((h) => ({ ticker: h.ticker, yield: Math.round((h.dividend_yield ?? 0) * 100) / 100 }))
        .sort((a, b) => b.yield - a.yield);

    if (data.length === 0) {
        return (
            <div className="h-[280px] flex items-center justify-center text-slate-low text-sm text-center px-4">
                Nenhum ativo com dividend yield disponível
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
                        tickFormatter={(v) => `${v.toFixed(1)}%`}
                        width={42}
                    />
                    <Tooltip
                        contentStyle={TOOLTIP_STYLE}
                        labelStyle={LABEL_STYLE}
                        formatter={(value: number | undefined) => value !== undefined ? [`${value.toFixed(2)}%`, 'Dividend Yield'] : ['---', 'Dividend Yield']}
                    />
                    <Bar dataKey="yield" radius={[4, 4, 0, 0]} barSize={28} animationDuration={1200}>
                        {data.map((entry) => (
                            <Cell key={entry.ticker} fill="#34D399" fillOpacity={0.85} />
                        ))}
                    </Bar>
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
}
