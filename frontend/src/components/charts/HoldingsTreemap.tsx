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
    pct_of_portfolio?: number;
}

function TreemapContent({
    x = 0,
    y = 0,
    width = 0,
    height = 0,
    name,
    gain_pct = 0,
    type = 'STOCK',
    pct_of_portfolio = 0,
}: TreemapContentProps) {
    if (width < 30 || height < 20) return null;

    const baseColor = ASSET_COLORS[type] || '#64748B';

    // Heat map color: green for gain, red for loss, opacity by magnitude
    let heatColor: string;
    if (gain_pct >= 0) {
        // green tones: from neutral (#34D399) to vivid green (#10B981)
        const intensity = Math.min(1, gain_pct / 20);
        heatColor = gain_pct === 0 ? baseColor : interpolateColor('#4ADE80', '#166534', intensity);
    } else {
        // red tones: from soft red to deep red
        const intensity = Math.min(1, Math.abs(gain_pct) / 20);
        heatColor = interpolateColor('#F87171', '#7F1D1D', intensity);
    }

    const showPct = width > 50 && height > 42;
    const showTicker = width > 36 && height > 26;
    const fontSize = Math.min(14, Math.max(9, width / 6));
    const pctFontSize = Math.max(8, fontSize - 2);

    const gap = 4; // spacing between cells

    return (
        <g>
            {/* background fill to cover the Recharts default blue */}
            <rect x={x} y={y} width={width} height={height} style={{ fill: '#FFFFFF' }} />
            <rect
                x={x + gap}
                y={y + gap}
                width={width - gap * 2}
                height={height - gap * 2}
                style={{ fill: heatColor }}
                rx={6}
            />
            {showTicker && (
                <text
                    x={x + width / 2}
                    y={showPct ? y + height / 2 - pctFontSize * 0.6 : y + height / 2}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    style={{ fill: '#F9FAFB', fontSize, fontWeight: 700, letterSpacing: '0.5px' }}
                >
                    {name}
                </text>
            )}
            {showPct && (
                <text
                    x={x + width / 2}
                    y={y + height / 2 + fontSize * 0.8}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    style={{ fill: '#E2E8F0', fontSize: pctFontSize, fontWeight: 400, opacity: 0.85 }}
                >
                    {pct_of_portfolio.toFixed(1)}%
                </text>
            )}
        </g>
    );
}

/** Linear interpolation between two hex colors */
function interpolateColor(hex1: string, hex2: string, t: number): string {
    const parse = (h: string) => [
        parseInt(h.slice(1, 3), 16),
        parseInt(h.slice(3, 5), 16),
        parseInt(h.slice(5, 7), 16),
    ];
    const [r1, g1, b1] = parse(hex1);
    const [r2, g2, b2] = parse(hex2);
    const r = Math.round(r1 + (r2 - r1) * t);
    const g = Math.round(g1 + (g2 - g1) * t);
    const b = Math.round(b1 + (b2 - b1) * t);
    return `rgb(${r},${g},${b})`;
}

export default function HoldingsTreemap({ holdings }: HoldingsTreemapProps) {
    const filtered = holdings.filter((h) => h.current_value > 0);
    const totalValue = filtered.reduce((sum, h) => sum + h.current_value, 0);

    const data = filtered.map((h) => {
        const pct = totalValue > 0 ? (h.current_value / totalValue) * 100 : 0;
        // sqrt scale: 87% still looks much bigger than 0.5%, but small assets stay visible
        const sqrtSize = Math.sqrt(Math.max(h.current_value, totalValue * 0.005));
        return {
            name: h.ticker,
            size: Math.round(sqrtSize * 100) / 100,
            gain_pct: h.gain_pct,
            type: h.type,
            current_value: h.current_value,
            pct_of_portfolio: pct,
        };
    });

    if (data.length === 0) {
        return (
            <div className="h-[340px] flex items-center justify-center text-slate-low text-sm">
                Sem dados
            </div>
        );
    }

    // Dynamic height: taller when more assets, capped at 480px
    const dynamicHeight = Math.min(480, Math.max(340, data.length * 30));

    return (
        <div style={{ height: dynamicHeight }} className="w-full rounded-xl overflow-hidden bg-white">
            <ResponsiveContainer width="100%" height="100%">
                <Treemap
                    data={data}
                    dataKey="size"
                    animationDuration={900}
                    content={<TreemapContent />}
                    aspectRatio={1.2}
                >
                    <Tooltip
                        contentStyle={TOOLTIP_STYLE}
                        labelStyle={LABEL_STYLE}
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        formatter={(value: any, _name: any, props: any) => {
                            if (value == null) return ['---', 'Valor'];
                            const gp = props?.payload?.gain_pct;
                            const pct = props?.payload?.pct_of_portfolio;
                            const gainStr = gp != null ? `  ${gp >= 0 ? '+' : ''}${(gp as number).toFixed(2)}%` : '';
                            const portStr = pct != null ? `  (${(pct as number).toFixed(1)}% carteira)` : '';
                            return [`${formatBRL(value as number)}${gainStr}${portStr}`, 'Valor'];
                        }}
                    />
                </Treemap>
            </ResponsiveContainer>
        </div>
    );
}
