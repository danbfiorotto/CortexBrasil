'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import Cookies from 'js-cookie';
import { motion, AnimatePresence } from 'framer-motion';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

const ASSET_TYPE_MAP: Record<string, { label: string; icon: string; color: string }> = {
    STOCK: { label: 'Ação', icon: '📊', color: 'text-blue-400' },
    FII: { label: 'FII', icon: '🏢', color: 'text-amber-400' },
    CRYPTO: { label: 'Crypto', icon: '₿', color: 'text-orange-400' },
    FIXED_INCOME: { label: 'Renda Fixa', icon: '🔒', color: 'text-emerald-400' },
};

interface Holding {
    ticker: string;
    name: string;
    type: string;
    quantity: number;
    avg_price: number;
    current_price: number;
    current_value: number;
    gain_loss: number;
    gain_pct: number;
}

interface Portfolio {
    holdings: Holding[];
    total_value: number;
    total_cost: number;
    total_gain: number;
    total_gain_pct: number;
}

interface TickerInfo {
    ticker: string;
    name: string;
    price: number;
    currency: string;
    exchange: string;
    source: string;
}

type TickerStatus = 'idle' | 'searching' | 'found' | 'not_found';

export default function InvestmentsPage() {
    const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [formData, setFormData] = useState({
        ticker: '', name: '', type: 'STOCK', quantity: 0, avg_price: 0,
    });
    const [submitting, setSubmitting] = useState(false);

    // Ticker live search state
    const [tickerStatus, setTickerStatus] = useState<TickerStatus>('idle');
    const [tickerInfo, setTickerInfo] = useState<TickerInfo | null>(null);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const fetchPortfolio = useCallback(async () => {
        const token = Cookies.get('token');
        try {
            const res = await fetch(`${API_URL}/api/analytics/investments`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) {
                const data = await res.json();
                setPortfolio(data);
            }
        } catch (error) {
            console.error('Failed to fetch portfolio:', error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchPortfolio();
    }, [fetchPortfolio]);

    // Live ticker search with 500ms debounce
    const handleTickerChange = (value: string) => {
        const upper = value.toUpperCase();
        setFormData(prev => ({ ...prev, ticker: upper }));

        if (debounceRef.current) clearTimeout(debounceRef.current);

        if (upper.length < 2) {
            setTickerStatus('idle');
            setTickerInfo(null);
            return;
        }

        setTickerStatus('searching');

        debounceRef.current = setTimeout(async () => {
            const token = Cookies.get('token');
            try {
                const res = await fetch(
                    `${API_URL}/api/analytics/investments/search?q=${encodeURIComponent(upper)}`,
                    { headers: { Authorization: `Bearer ${token}` } }
                );
                if (res.ok) {
                    const info: TickerInfo = await res.json();
                    setTickerInfo(info);
                    setTickerStatus('found');
                    // Auto-fill name if it's still empty or matches previous ticker
                    setFormData(prev => ({
                        ...prev,
                        name: prev.name === '' || prev.name === prev.ticker ? info.name : prev.name,
                    }));
                } else {
                    setTickerInfo(null);
                    setTickerStatus('not_found');
                }
            } catch {
                setTickerInfo(null);
                setTickerStatus('not_found');
            }
        }, 500);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (tickerStatus === 'not_found') return;
        setSubmitting(true);
        const token = Cookies.get('token');
        try {
            const res = await fetch(`${API_URL}/api/analytics/investments/add`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify(formData),
            });
            if (res.ok) {
                setShowForm(false);
                setFormData({ ticker: '', name: '', type: 'STOCK', quantity: 0, avg_price: 0 });
                setTickerStatus('idle');
                setTickerInfo(null);
                await fetchPortfolio();
            }
        } catch (error) {
            console.error('Failed to add asset:', error);
        } finally {
            setSubmitting(false);
        }
    };

    const handleCloseForm = () => {
        setShowForm(false);
        setTickerStatus('idle');
        setTickerInfo(null);
        setFormData({ ticker: '', name: '', type: 'STOCK', quantity: 0, avg_price: 0 });
    };

    const formatCurrency = (value: number) =>
        new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

    const formatPct = (value: number) => `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;

    return (
        <div className="p-6 md:p-10 max-w-6xl mx-auto space-y-8">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight">Investimentos</h2>
                    <p className="text-sm text-slate-low mt-1">
                        Gestão patrimonial com privacidade total
                    </p>
                </div>
                <button
                    onClick={() => setShowForm(!showForm)}
                    className="px-4 py-2 rounded-xl bg-royal-purple hover:bg-royal-purple/80 text-sm font-semibold transition-all flex items-center gap-2"
                >
                    <span className="text-lg">+</span> Novo Ativo
                </button>
            </div>

            {/* Portfolio Summary */}
            {portfolio && (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    {[
                        { label: 'Valor Total', value: formatCurrency(portfolio.total_value), color: 'text-crisp-white' },
                        { label: 'Custo Total', value: formatCurrency(portfolio.total_cost), color: 'text-slate-low' },
                        {
                            label: 'Lucro/Prejuízo',
                            value: formatCurrency(portfolio.total_gain),
                            color: portfolio.total_gain >= 0 ? 'text-emerald-400' : 'text-crimson-bright',
                        },
                        {
                            label: 'Rentabilidade',
                            value: formatPct(portfolio.total_gain_pct),
                            color: portfolio.total_gain_pct >= 0 ? 'text-emerald-400' : 'text-crimson-bright',
                        },
                    ].map((card) => (
                        <motion.div
                            key={card.label}
                            initial={{ opacity: 0, y: 16 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="glass-panel rounded-2xl p-5"
                        >
                            <p className="text-[10px] uppercase tracking-widest text-slate-low mb-1">{card.label}</p>
                            <p className={`text-xl font-bold ${card.color}`}>{card.value}</p>
                        </motion.div>
                    ))}
                </div>
            )}

            {/* Add Asset Form */}
            <AnimatePresence>
                {showForm && (
                    <motion.form
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        onSubmit={handleSubmit}
                        className="glass-panel rounded-2xl p-6 space-y-4 overflow-hidden"
                    >
                        <h3 className="text-lg font-semibold">Adicionar Ativo</h3>
                        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                            {/* Ticker with live search */}
                            <div>
                                <label className="text-xs text-slate-low uppercase tracking-wider block mb-1">Ticker</label>
                                <div className="relative">
                                    <input
                                        type="text"
                                        placeholder="PETR4"
                                        value={formData.ticker}
                                        onChange={(e) => handleTickerChange(e.target.value)}
                                        className={`w-full bg-charcoal-bg border rounded-xl px-4 py-2.5 text-sm focus:outline-none transition-colors pr-9 ${
                                            tickerStatus === 'found'
                                                ? 'border-emerald-500 focus:border-emerald-400'
                                                : tickerStatus === 'not_found'
                                                ? 'border-red-500 focus:border-red-400'
                                                : 'border-graphite-border focus:border-royal-purple'
                                        }`}
                                        required
                                    />
                                    {/* Status indicator */}
                                    <div className="absolute right-3 top-1/2 -translate-y-1/2 text-sm">
                                        {tickerStatus === 'searching' && (
                                            <motion.div
                                                animate={{ rotate: 360 }}
                                                transition={{ repeat: Infinity, duration: 0.8 }}
                                                className="w-4 h-4 border-t-2 border-royal-purple rounded-full"
                                            />
                                        )}
                                        {tickerStatus === 'found' && <span className="text-emerald-400">✓</span>}
                                        {tickerStatus === 'not_found' && <span className="text-red-400">✗</span>}
                                    </div>
                                </div>
                                {/* Ticker info preview */}
                                <AnimatePresence>
                                    {tickerStatus === 'found' && tickerInfo && (
                                        <motion.div
                                            initial={{ opacity: 0, y: -4 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0 }}
                                            className="mt-1.5 px-2 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20"
                                        >
                                            <p className="text-[10px] text-emerald-400 font-semibold truncate">{tickerInfo.name}</p>
                                            <p className="text-[10px] text-slate-low">
                                                {tickerInfo.exchange && <span>{tickerInfo.exchange} · </span>}
                                                <span className="text-emerald-300">
                                                    {tickerInfo.currency === 'BRL'
                                                        ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(tickerInfo.price)
                                                        : `$${tickerInfo.price.toFixed(2)}`}
                                                </span>
                                            </p>
                                        </motion.div>
                                    )}
                                    {tickerStatus === 'not_found' && (
                                        <motion.p
                                            initial={{ opacity: 0, y: -4 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0 }}
                                            className="mt-1 text-[10px] text-red-400"
                                        >
                                            Ticker não encontrado em nenhuma bolsa
                                        </motion.p>
                                    )}
                                </AnimatePresence>
                            </div>

                            <div>
                                <label className="text-xs text-slate-low uppercase tracking-wider block mb-1">Nome</label>
                                <input
                                    type="text"
                                    placeholder="Petrobras"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    className="w-full bg-charcoal-bg border border-graphite-border rounded-xl px-4 py-2.5 text-sm focus:border-royal-purple focus:outline-none transition-colors"
                                />
                            </div>
                            <div>
                                <label className="text-xs text-slate-low uppercase tracking-wider block mb-1">Tipo</label>
                                <select
                                    value={formData.type}
                                    onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                                    className="w-full bg-charcoal-bg border border-graphite-border rounded-xl px-4 py-2.5 text-sm focus:border-royal-purple focus:outline-none transition-colors"
                                >
                                    <option value="STOCK">📊 Ação</option>
                                    <option value="FII">🏢 FII</option>
                                    <option value="CRYPTO">₿ Crypto</option>
                                    <option value="FIXED_INCOME">🔒 Renda Fixa</option>
                                </select>
                            </div>
                            <div>
                                <label className="text-xs text-slate-low uppercase tracking-wider block mb-1">Quantidade</label>
                                <input
                                    type="number"
                                    step="0.00000001"
                                    value={formData.quantity}
                                    onChange={(e) => setFormData({ ...formData, quantity: parseFloat(e.target.value) || 0 })}
                                    className="w-full bg-charcoal-bg border border-graphite-border rounded-xl px-4 py-2.5 text-sm focus:border-royal-purple focus:outline-none transition-colors"
                                    required
                                />
                            </div>
                            <div>
                                <label className="text-xs text-slate-low uppercase tracking-wider block mb-1">Preço Médio</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    value={formData.avg_price}
                                    onChange={(e) => setFormData({ ...formData, avg_price: parseFloat(e.target.value) || 0 })}
                                    className="w-full bg-charcoal-bg border border-graphite-border rounded-xl px-4 py-2.5 text-sm focus:border-royal-purple focus:outline-none transition-colors"
                                    required
                                />
                            </div>
                        </div>
                        <div className="flex justify-end gap-3">
                            <button type="button" onClick={handleCloseForm} className="px-4 py-2 text-sm text-slate-low hover:text-crisp-white transition-colors">
                                Cancelar
                            </button>
                            <button
                                type="submit"
                                disabled={submitting || tickerStatus === 'not_found' || tickerStatus === 'searching'}
                                className="px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-sm font-semibold transition-all disabled:opacity-50"
                            >
                                {submitting ? 'Salvando...' : 'Adicionar'}
                            </button>
                        </div>
                    </motion.form>
                )}
            </AnimatePresence>

            {/* Holdings Table */}
            {loading ? (
                <div className="flex justify-center py-12">
                    <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1 }} className="w-8 h-8 border-t-2 border-royal-purple rounded-full" />
                </div>
            ) : !portfolio || portfolio.holdings.length === 0 ? (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass-panel rounded-2xl p-12 text-center">
                    <p className="text-4xl mb-4">📈</p>
                    <p className="text-lg font-semibold mb-1">Nenhum ativo cadastrado</p>
                    <p className="text-sm text-slate-low">Adicione seus investimentos para acompanhar o patrimônio.</p>
                </motion.div>
            ) : (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass-panel rounded-2xl overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-graphite-border text-xs text-slate-low uppercase tracking-wider">
                                    <th className="text-left px-5 py-3">Ativo</th>
                                    <th className="text-right px-5 py-3">Qtd</th>
                                    <th className="text-right px-5 py-3">PM</th>
                                    <th className="text-right px-5 py-3">Cotação</th>
                                    <th className="text-right px-5 py-3">Valor</th>
                                    <th className="text-right px-5 py-3">L/P</th>
                                    <th className="text-right px-5 py-3">%</th>
                                </tr>
                            </thead>
                            <tbody>
                                {portfolio.holdings.map((h, i) => {
                                    const typeInfo = ASSET_TYPE_MAP[h.type] || ASSET_TYPE_MAP.STOCK;
                                    return (
                                        <motion.tr
                                            key={h.ticker}
                                            initial={{ opacity: 0, x: -10 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={{ delay: i * 0.05 }}
                                            className="border-b border-graphite-border/30 hover:bg-graphite-border/10 transition-colors"
                                        >
                                            <td className="px-5 py-4">
                                                <div className="flex items-center gap-2">
                                                    <span>{typeInfo.icon}</span>
                                                    <div>
                                                        <p className="font-semibold text-sm">{h.ticker}</p>
                                                        <p className="text-[10px] text-slate-low">{h.name}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="text-right px-5 py-4 text-sm">{h.quantity.toLocaleString('pt-BR')}</td>
                                            <td className="text-right px-5 py-4 text-sm text-slate-low">{formatCurrency(h.avg_price)}</td>
                                            <td className="text-right px-5 py-4 text-sm">{formatCurrency(h.current_price)}</td>
                                            <td className="text-right px-5 py-4 text-sm font-semibold">{formatCurrency(h.current_value)}</td>
                                            <td className={`text-right px-5 py-4 text-sm font-semibold ${h.gain_loss >= 0 ? 'text-emerald-400' : 'text-crimson-bright'}`}>
                                                {formatCurrency(h.gain_loss)}
                                            </td>
                                            <td className={`text-right px-5 py-4 text-sm font-semibold ${h.gain_pct >= 0 ? 'text-emerald-400' : 'text-crimson-bright'}`}>
                                                {formatPct(h.gain_pct)}
                                            </td>
                                        </motion.tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </motion.div>
            )}

            {/* Privacy Note */}
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-emerald-500/5 border border-emerald-500/20">
                <span className="text-lg">🔒</span>
                <p className="text-xs text-emerald-400/80">
                    <strong>Privacy-First:</strong> Suas quantidades ficam apenas no seu servidor local.
                    Buscamos apenas o preço público — ninguém sabe sua posição real.
                </p>
            </div>
        </div>
    );
}
