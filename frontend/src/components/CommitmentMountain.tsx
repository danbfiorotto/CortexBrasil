'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';

interface CommitmentPoint {
    month: string;
    amount: number;
}

export default function CommitmentMountain() {
    const [data, setData] = useState<CommitmentPoint[]>([]);
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

    if (loading) {
        return <div className="h-[360px] bg-graphite-card animate-pulse rounded-xl border border-graphite-border" />;
    }

    if (data.length === 0) return null;

    const maxAmount = Math.max(...data.map(d => d.amount), 1);
    const chartWidth = 800;
    const chartHeight = 280;
    const padding = 10;

    const points = data.map((d, i) => ({
        x: padding + (i / Math.max(data.length - 1, 1)) * (chartWidth - padding * 2),
        y: chartHeight - (d.amount / maxAmount) * (chartHeight - 40),
    }));

    const buildPathFromPoints = (pts: { x: number; y: number }[]) => {
        if (pts.length === 0) return '';
        let d = `M${pts[0].x},${pts[0].y}`;
        for (let i = 1; i < pts.length; i++) {
            const prev = pts[i - 1];
            const curr = pts[i];
            const cpx1 = prev.x + (curr.x - prev.x) / 3;
            const cpx2 = prev.x + (2 * (curr.x - prev.x)) / 3;
            d += ` C${cpx1},${prev.y} ${cpx2},${curr.y} ${curr.x},${curr.y}`;
        }
        return d;
    };

    const linePath = buildPathFromPoints(points);
    const areaPath = `${linePath} L${points[points.length - 1].x},${chartHeight} L${points[0].x},${chartHeight} Z`;

    return (
        <section className="bg-graphite-card rounded-xl border border-graphite-border p-6 shadow-sm">
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h3 className="text-lg font-bold text-crisp-white">Commitment Mountain</h3>
                    <p className="text-[10px] text-slate-low uppercase font-bold tracking-[0.1em] mt-1">
                        Projeção de Parcelamentos Futuros
                    </p>
                </div>
                <div className="flex items-center gap-3 bg-graphite-border/30 px-3 py-1.5 rounded-full">
                    <span className="size-2 rounded-full bg-royal-purple shadow-[0_0_8px_rgba(139,92,246,0.4)]" />
                    <span className="text-[10px] font-bold uppercase text-slate-low">Comprometimento</span>
                </div>
            </div>

            <div className="h-[280px] w-full relative">
                <svg className="w-full h-full" preserveAspectRatio="none" viewBox={`0 0 ${chartWidth} ${chartHeight}`}>
                    <defs>
                        <linearGradient id="mountainGradient" x1="0" x2="0" y1="0" y2="1">
                            <stop offset="0%" stopColor="rgba(139, 92, 246, 0.4)" />
                            <stop offset="100%" stopColor="rgba(139, 92, 246, 0)" />
                        </linearGradient>
                    </defs>

                    {/* Area fill */}
                    <path d={areaPath} fill="url(#mountainGradient)" />

                    {/* Line stroke */}
                    <path d={linePath} className="stroke-royal-purple/60" strokeWidth="2" fill="none" />

                    {/* Data points */}
                    {points.map((pt, i) => (
                        <circle key={i} cx={pt.x} cy={pt.y} r="3" className="fill-crisp-white" />
                    ))}

                    {/* Bottom line */}
                    <line x1="0" x2={chartWidth} y1={chartHeight} y2={chartHeight} className="stroke-graphite-border/50" />
                </svg>

                {/* Month labels */}
                <div className="absolute bottom-0 w-full flex justify-between px-2 pt-4 text-[10px] text-slate-low font-bold uppercase tracking-widest">
                    {data.map((d, i) => (
                        <span key={i}>{d.month}</span>
                    ))}
                </div>
            </div>
        </section>
    );
}
