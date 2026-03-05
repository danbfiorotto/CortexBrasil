'use client';

import { Treemap, ResponsiveContainer, Tooltip } from 'recharts';
import { ASSET_COLORS, TOOLTIP_STYLE, LABEL_STYLE, formatBRL } from './chartConfig';

interface Holding {
    ticker: string;
    type: string;
    current_value: number;
    gain_pct: number;
}

interface HoldingsTreemapProps {
    holdings: Holding[];
}

interface TreemapContentProps {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    name?: string;
    gain_pct?: number;
    type?: string;
}

function TreemapContent({ x = 0, y = 0, width = 0, height = 0, name, gain_pct = 0, type = 'STOCK' }: TreemapContentProps) {
    if (width < 30 || height < 20) return null;
    const baseColor = ASSET_COLORS[type] || '#64748B';
    const opacity = Math.min(1, Math.max(0.35, 0.6 + gain_pct / 100));

    return (
        <g>
            <rect
                x={x + 1}
                y={y + 1}
                width={width - 2}
                height={height - 2}
                style={{ fill: baseColor, fillOpacity: opacity, stroke: '#0F172A', strokeWidth: 2 }}
                rx={4}
            />
            {width > 48 && height > 28 && (
                <text
                    x={x + width / 2}
                    y={y + height / 2}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    style={{ fill: '#F9FAFB', fontSize: Math.min(13, width / 5), fontWeight: 700 }}
                >
                    {name}
                </text>
            )}
        </g>
    );
}

export default function HoldingsTreemap({ holdings }: HoldingsTreemapProps) {
    const data = holdings
        .filter((h) => h.current_value > 0)
        .map((h) => ({
            name: h.ticker,
            size: Math.round(h.current_value * 100) / 100,
            gain_pct: h.gain_pct,
            type: h.type,
            current_value: h.current_value,
        }));

    if (data.length === 0) {
        return (
            <div className="h-[220px] flex items-center justify-center text-slate-low text-sm">
                Sem dados
            </div>
        );
    }

    return (
        <div className="h-[220px] w-full">
            <ResponsiveContainer width="100%" height="100%">
                <Treemap
                    data={data}
                    dataKey="size"
                    animationDuration={1200}
                    content={<TreemapContent />}
                >
                    <Tooltip
                        contentStyle={TOOLTIP_STYLE}
                        labelStyle={LABEL_STYLE}
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        formatter={(value: any, _name: any, props: any) => {
                            if (value == null) return ['---', 'Valor'];
                            const gp = props?.payload?.gain_pct;
                            const suffix = gp != null ? ` (${gp >= 0 ? '+' : ''}${(gp as number).toFixed(2)}%)` : '';
                            return [`${formatBRL(value as number)}${suffix}`, 'Valor'];
                        }}
                    />
                </Treemap>
            </ResponsiveContainer>
        </div>
    );
}
