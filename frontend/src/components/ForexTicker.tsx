'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import Cookies from 'js-cookie';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

interface RateItem {
    label: string;
    description: string;
    price: number;
}

// Format price based on label context
function formatPrice(label: string, price: number): string {
    if (label === 'IBOV' || label === 'SPX') {
        return price.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
    }
    if (label === 'DXY') {
        return price.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    if (label.includes('BRL')) {
        if (price < 0.01) {
            return `R$ ${price.toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 6 })}`;
        }
        return `R$ ${price.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
    }
    if (label.startsWith('BTC') || label.startsWith('ETH')) {
        return `$ ${price.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
    }
    return price.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

export default function ForexTicker() {
    const [rates, setRates] = useState<RateItem[]>([]);
    const [loading, setLoading] = useState(true);
    const trackRef = useRef<HTMLDivElement>(null);
    const animRef = useRef<number | null>(null);
    const posRef = useRef(0);
    const pausedRef = useRef(false);

    const fetchRates = useCallback(async () => {
        const token = Cookies.get('token');
        if (!token) return;
        try {
            const res = await fetch(`${API_URL}/api/analytics/forex-rates`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) {
                const data = await res.json();
                setRates(data.rates || []);
            }
        } catch {
            // silent fail — ticker just won't show new data
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchRates();
        const interval = setInterval(fetchRates, 60_000); // refresh every 60s
        return () => clearInterval(interval);
    }, [fetchRates]);

    // Smooth scroll animation using rAF
    useEffect(() => {
        if (!rates.length || !trackRef.current) return;

        const speed = 0.5; // px per frame

        const animate = () => {
            if (!pausedRef.current && trackRef.current) {
                posRef.current += speed;
                const halfWidth = trackRef.current.scrollWidth / 2;
                if (posRef.current >= halfWidth) posRef.current = 0;
                trackRef.current.style.transform = `translateX(-${posRef.current}px)`;
            }
            animRef.current = requestAnimationFrame(animate);
        };

        animRef.current = requestAnimationFrame(animate);
        return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
    }, [rates]);

    if (loading || rates.length === 0) return null;

    // Duplicate items to create seamless loop
    const items = [...rates, ...rates];

    return (
        <div
            className="w-full bg-graphite-card border-b border-graphite-border overflow-hidden select-none"
            style={{ height: '28px' }}
            onMouseEnter={() => { pausedRef.current = true; }}
            onMouseLeave={() => { pausedRef.current = false; }}
        >
            <div ref={trackRef} className="flex items-center h-full gap-0 will-change-transform" style={{ width: 'max-content' }}>
                {items.map((item, idx) => (
                    <span
                        key={idx}
                        className="flex items-center gap-1.5 px-5 h-full border-r border-graphite-border/40 whitespace-nowrap"
                        title={item.description}
                    >
                        <span className="text-[10px] font-semibold text-slate-low tracking-wider">{item.label}</span>
                        <span className="text-[11px] font-mono text-crisp-white">{formatPrice(item.label, item.price)}</span>
                    </span>
                ))}
            </div>
        </div>
    );
}
