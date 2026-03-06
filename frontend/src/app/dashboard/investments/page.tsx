'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import Cookies from 'js-cookie';
import { motion, AnimatePresence } from 'framer-motion';
import PortfolioAllocation from '@/components/charts/PortfolioAllocation';
import AssetTypeBreakdown from '@/components/charts/AssetTypeBreakdown';
import GainLossWaterfall from '@/components/charts/GainLossWaterfall';
import HoldingsTreemap from '@/components/charts/HoldingsTreemap';
import DividendYield from '@/components/charts/DividendYield';
import PerformanceBenchmark from '@/components/charts/PerformanceBenchmark';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

const ASSET_TYPE_MAP: Record<string, { label: string; icon: string; color: string }> = {
    STOCK: { label: 'Ação', icon: '📊', color: 'text-blue-400' },
    FII: { label: 'FII', icon: '🏢', color: 'text-amber-400' },
    CRYPTO: { label: 'Crypto', icon: '₿', color: 'text-orange-400' },
    FIXED_INCOME: { label: 'Renda Fixa', icon: '🔒', color: 'text-emerald-400' },
};

interface Holding {
    id: string;
    ticker: string;
    name: string;
    type: string;
    quantity: number;
    avg_price: number;
    current_price: number;
    current_value: number;
    gain_loss: number;
    gain_pct: number;
    dividend_yield?: number | null;
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

interface Account {
    id: string;
    name: string;
    type: string;
    current_balance: number;
}

type TickerStatus = 'idle' | 'searching' | 'found' | 'not_found';

type ActionModal =
    | { type: 'sell'; holding: Holding }
    | { type: 'delete'; holding: Holding }
    | null;

export default function InvestmentsPage() {
    const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [formData, setFormData] = useState({
        ticker: '', name: '', type: 'STOCK', quantity: '', avg_price: '', purchased_at: new Date().toISOString().split('T')[0],
    });
    const [submitting, setSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState('');
    const [accounts, setAccounts] = useState<Account[]>([]);

    // Ticker live search state
    const [tickerStatus, setTickerStatus] = useState<TickerStatus>('idle');
    const [tickerInfo, setTickerInfo] = useState<TickerInfo | null>(null);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Action modal state
    const [actionModal, setActionModal] = useState<ActionModal>(null);
    const [sellData, setSellData] = useState({ quantity: '', sale_price: '', account_id: '' });
    const [actionSubmitting, setActionSubmitting] = useState(false);
    const [actionError, setActionError] = useState('');

    type ChartTab = 'overview' | 'performance' | 'analysis';
    const [chartTab, setChartTab] = useState<ChartTab>('overview');

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

    const fetchAccounts = useCallback(async () => {
        const token = Cookies.get('token');
        try {
            const res = await fetch(`${API_URL}/api/accounts/`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) {
                const data = await res.json();
                setAccounts((data.accounts ?? data).filter((a: Account) => a.type !== 'CREDIT'));
            }
        } catch (error) {
            console.error('Failed to fetch accounts:', error);
        }
    }, []);

    useEffect(() => {
        fetchPortfolio();
        fetchAccounts();
    }, [fetchPortfolio, fetchAccounts]);

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

    const parseDecimal = (val: string) => parseFloat(val.replace(',', '.')) || 0;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (tickerStatus !== 'found') return;
        setSubmitError('');
        setSubmitting(true);
        const token = Cookies.get('token');
        try {
            const payload = {
                ...formData,
                quantity: parseDecimal(formData.quantity),
                avg_price: parseDecimal(formData.avg_price),
            };
            const res = await fetch(`${API_URL}/api/analytics/investments/add`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify(payload),
            });
            if (res.ok) {
                setShowForm(false);
                setFormData({ ticker: '', name: '', type: 'STOCK', quantity: '', avg_price: '', purchased_at: new Date().toISOString().split('T')[0] });
                setTickerStatus('idle');
                setTickerInfo(null);
                await fetchPortfolio();
            } else {
                const err = await res.json().catch(() => ({}));
                setSubmitError(err.detail || 'Erro ao adicionar ativo.');
            }
        } catch (error) {
            console.error('Failed to add asset:', error);
            setSubmitError('Erro de conexão. Tente novamente.');
        } finally {
            setSubmitting(false);
        }
    };

    const handleCloseForm = () => {
        setShowForm(false);
        setTickerStatus('idle');
        setTickerInfo(null);
        setSubmitError('');
        setFormData({ ticker: '', name: '', type: 'STOCK', quantity: '', avg_price: '', purchased_at: new Date().toISOString().split('T')[0] });
    };

    const openSell = (holding: Holding) => {
        setSellData({ quantity: '', sale_price: holding.current_price.toString(), account_id: '' });
        setActionError('');
        setActionModal({ type: 'sell', holding });
    };

    const openDelete = (holding: Holding) => {
        setActionError('');
        setActionModal({ type: 'delete', holding });
    };

    const closeModal = () => {
        setActionModal(null);
        setActionError('');
    };

    const handleDelete = async () => {
        if (!actionModal || actionModal.type !== 'delete') return;
        setActionSubmitting(true);
        const token = Cookies.get('token');
        try {
            const res = await fetch(`${API_URL}/api/analytics/investments/${actionModal.holding.id}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) {
                closeModal();
                await fetchPortfolio();
            } else {
                const err = await res.json();
                setActionError(err.detail || 'Erro ao remover ativo.');
            }
        } catch {
            setActionError('Erro de conexão.');
        } finally {
            setActionSubmitting(false);
        }
    };

    const handleSell = async () => {
        if (!actionModal || actionModal.type !== 'sell') return;
        setActionSubmitting(true);
        setActionError('');
        const token = Cookies.get('token');
        try {
            const sellPayload = {
                ...sellData,
                quantity: parseDecimal(sellData.quantity),
                sale_price: parseDecimal(sellData.sale_price),
            };
            const res = await fetch(`${API_URL}/api/analytics/investments/${actionModal.holding.id}/sell`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify(sellPayload),
            });
            if (res.ok) {
                closeModal();
                await fetchPortfolio();
            } else {
                const err = await res.json();
                setActionError(err.detail || 'Erro ao registrar venda.');
            }
        } catch {
            setActionError('Erro de conexão.');
        } finally {
            setActionSubmitting(false);
        }
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
                        <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
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
                                    type="text"
                                    inputMode="decimal"
                                    placeholder="0"
                                    value={formData.quantity}
                                    onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                                    className="w-full bg-charcoal-bg border border-graphite-border rounded-xl px-4 py-2.5 text-sm focus:border-royal-purple focus:outline-none transition-colors"
                                    required
                                />
                            </div>
                            <div>
                                <label className="text-xs text-slate-low uppercase tracking-wider block mb-1">Preço Médio</label>
                                <input
                                    type="text"
                                    inputMode="decimal"
                                    placeholder="0,00"
                                    value={formData.avg_price}
                                    onChange={(e) => setFormData({ ...formData, avg_price: e.target.value })}
                                    className="w-full bg-charcoal-bg border border-graphite-border rounded-xl px-4 py-2.5 text-sm focus:border-royal-purple focus:outline-none transition-colors"
                                    required
                                />
                            </div>
                            <div>
                                <label className="text-xs text-slate-low uppercase tracking-wider block mb-1">Data de Compra</label>
                                <input
                                    type="date"
                                    value={formData.purchased_at}
                                    onChange={(e) => setFormData({ ...formData, purchased_at: e.target.value })}
                                    className="w-full bg-charcoal-bg border border-graphite-border rounded-xl px-4 py-2.5 text-sm focus:border-royal-purple focus:outline-none transition-colors"
                                    required
                                />
                            </div>
                        </div>
                        <div className="flex justify-end items-center gap-3">
                            {submitError && (
                                <p className="text-xs text-red-400 mr-auto">{submitError}</p>
                            )}
                            {submitting && (
                                <p className="text-xs text-emerald-400 mr-auto flex items-center gap-2">
                                    <motion.span
                                        animate={{ rotate: 360 }}
                                        transition={{ repeat: Infinity, duration: 0.8 }}
                                        className="inline-block w-3 h-3 border-t-2 border-emerald-400 rounded-full"
                                    />
                                    Salvando e buscando cotação...
                                </p>
                            )}
                            <button type="button" onClick={handleCloseForm} disabled={submitting} className="px-4 py-2 text-sm text-slate-low hover:text-crisp-white transition-colors disabled:opacity-40">
                                Cancelar
                            </button>
                            <button
                                type="submit"
                                disabled={submitting || tickerStatus !== 'found'}
                                className="px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-sm font-semibold transition-all disabled:opacity-50 flex items-center gap-2"
                            >
                                {submitting ? (
                                    <>
                                        <motion.span
                                            animate={{ rotate: 360 }}
                                            transition={{ repeat: Infinity, duration: 0.8 }}
                                            className="inline-block w-4 h-4 border-t-2 border-white rounded-full"
                                        />
                                        Salvando...
                                    </>
                                ) : 'Adicionar'}
                            </button>
                        </div>
                    </motion.form>
                )}
            </AnimatePresence>

            {/* Chart Tabs */}
            {portfolio && portfolio.holdings.length > 0 && (
                <div className="space-y-4">
                    {/* Tab bar */}
                    <div className="flex gap-1 p-1 rounded-xl bg-charcoal-bg border border-graphite-border w-fit">
                        {([['overview', 'Visão Geral'], ['performance', 'Performance'], ['analysis', 'Análise']] as [ChartTab, string][]).map(([key, label]) => (
                            <button
                                key={key}
                                onClick={() => setChartTab(key)}
                                className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                                    chartTab === key
                                        ? 'bg-royal-purple text-crisp-white'
                                        : 'text-slate-low hover:text-crisp-white'
                                }`}
                            >
                                {label}
                            </button>
                        ))}
                    </div>

                    {/* Overview: PieChart + AssetTypeBreakdown + Treemap */}
                    {chartTab === 'overview' && (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="glass-panel rounded-2xl p-5">
                                    <p className="text-[10px] uppercase tracking-widest text-slate-low mb-3">Diversificação</p>
                                    <PortfolioAllocation holdings={portfolio.holdings} />
                                </div>
                                <div className="glass-panel rounded-2xl p-5 md:col-span-2">
                                    <p className="text-[10px] uppercase tracking-widest text-slate-low mb-3">Custo vs Valor por Classe</p>
                                    <AssetTypeBreakdown holdings={portfolio.holdings} />
                                </div>
                            </div>
                            <div className="glass-panel rounded-2xl p-5">
                                <p className="text-[10px] uppercase tracking-widest text-slate-low mb-3">Composição da Carteira</p>
                                <HoldingsTreemap holdings={portfolio.holdings} />
                            </div>
                        </motion.div>
                    )}

                    {/* Performance: vs benchmarks */}
                    {chartTab === 'performance' && (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                            <div className="glass-panel rounded-2xl p-5">
                                <p className="text-[10px] uppercase tracking-widest text-slate-low mb-3">Performance vs Benchmarks</p>
                                <PerformanceBenchmark />
                            </div>
                        </motion.div>
                    )}

                    {/* Analysis: GainLoss + DividendYield */}
                    {chartTab === 'analysis' && (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="glass-panel rounded-2xl p-5">
                                <p className="text-[10px] uppercase tracking-widest text-slate-low mb-3">Ganho / Perda por Ativo</p>
                                <GainLossWaterfall holdings={portfolio.holdings} />
                            </div>
                            <div className="glass-panel rounded-2xl p-5">
                                <p className="text-[10px] uppercase tracking-widest text-slate-low mb-3">Dividend Yield</p>
                                <DividendYield holdings={portfolio.holdings} />
                            </div>
                        </motion.div>
                    )}
                </div>
            )}

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
                                    <th className="px-5 py-3"></th>
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
                                            className="border-b border-graphite-border/30 hover:bg-graphite-border/10 transition-colors group"
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
                                            <td className="px-5 py-4">
                                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity justify-end">
                                                    <button
                                                        onClick={() => openSell(h)}
                                                        title="Registrar venda"
                                                        className="px-2 py-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 text-xs font-semibold transition-colors"
                                                    >
                                                        Vender
                                                    </button>
                                                    <button
                                                        onClick={() => openDelete(h)}
                                                        title="Remover lançamento"
                                                        className="px-2 py-1 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs font-semibold transition-colors"
                                                    >
                                                        Remover
                                                    </button>
                                                </div>
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

            {/* Action Modals */}
            <AnimatePresence>
                {actionModal && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
                        onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}
                    >
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            className="glass-panel rounded-2xl p-6 w-full max-w-md space-y-4"
                        >
                            {/* DELETE modal */}
                            {actionModal.type === 'delete' && (
                                <>
                                    <h3 className="text-lg font-semibold">Remover Ativo</h3>
                                    <p className="text-sm text-slate-low">
                                        Isso vai excluir o lançamento de{' '}
                                        <strong className="text-crisp-white">{actionModal.holding.ticker}</strong>{' '}
                                        ({actionModal.holding.quantity.toLocaleString('pt-BR')} unid.) permanentemente.
                                        Use esta opção para corrigir um lançamento errado.
                                    </p>
                                    {actionError && <p className="text-xs text-red-400">{actionError}</p>}
                                    <div className="flex justify-end gap-3 pt-2">
                                        <button onClick={closeModal} className="px-4 py-2 text-sm text-slate-low hover:text-crisp-white transition-colors">
                                            Cancelar
                                        </button>
                                        <button
                                            onClick={handleDelete}
                                            disabled={actionSubmitting}
                                            className="px-5 py-2 rounded-xl bg-red-500 hover:bg-red-400 text-sm font-semibold transition-all disabled:opacity-50"
                                        >
                                            {actionSubmitting ? 'Removendo...' : 'Confirmar remoção'}
                                        </button>
                                    </div>
                                </>
                            )}

                            {/* SELL modal */}
                            {actionModal.type === 'sell' && (
                                <>
                                    <h3 className="text-lg font-semibold">Registrar Venda — {actionModal.holding.ticker}</h3>
                                    <p className="text-xs text-slate-low">
                                        Posição atual: {actionModal.holding.quantity.toLocaleString('pt-BR')} unid.
                                    </p>
                                    <div className="space-y-3">
                                        <div className="grid grid-cols-2 gap-3">
                                            <div>
                                                <label className="text-xs text-slate-low uppercase tracking-wider block mb-1">Qtd. vendida</label>
                                                <input
                                                    type="text"
                                                    inputMode="decimal"
                                                    value={sellData.quantity}
                                                    onChange={(e) => setSellData(prev => ({ ...prev, quantity: e.target.value }))}
                                                    placeholder="0"
                                                    className="w-full bg-charcoal-bg border border-graphite-border rounded-xl px-4 py-2.5 text-sm focus:border-amber-400 focus:outline-none transition-colors"
                                                />
                                            </div>
                                            <div>
                                                <label className="text-xs text-slate-low uppercase tracking-wider block mb-1">Preço de venda</label>
                                                <input
                                                    type="text"
                                                    inputMode="decimal"
                                                    value={sellData.sale_price}
                                                    onChange={(e) => setSellData(prev => ({ ...prev, sale_price: e.target.value }))}
                                                    placeholder="0,00"
                                                    className="w-full bg-charcoal-bg border border-graphite-border rounded-xl px-4 py-2.5 text-sm focus:border-amber-400 focus:outline-none transition-colors"
                                                />
                                            </div>
                                        </div>

                                        {parseDecimal(sellData.quantity) > 0 && parseDecimal(sellData.sale_price) > 0 && (
                                            <div className="px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
                                                <p className="text-xs text-amber-400">
                                                    Total da venda:{' '}
                                                    <strong>{formatCurrency(parseDecimal(sellData.quantity) * parseDecimal(sellData.sale_price))}</strong>
                                                </p>
                                            </div>
                                        )}

                                        <div>
                                            <label className="text-xs text-slate-low uppercase tracking-wider block mb-1">
                                                Creditar em conta <span className="text-slate-low/60">(opcional)</span>
                                            </label>
                                            <select
                                                value={sellData.account_id}
                                                onChange={(e) => setSellData(prev => ({ ...prev, account_id: e.target.value }))}
                                                className="w-full bg-charcoal-bg border border-graphite-border rounded-xl px-4 py-2.5 text-sm focus:border-amber-400 focus:outline-none transition-colors"
                                            >
                                                <option value="">Não creditar em conta</option>
                                                {accounts.map((acc) => (
                                                    <option key={acc.id} value={acc.id}>
                                                        {acc.name} ({formatCurrency(acc.current_balance)})
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>

                                    {actionError && <p className="text-xs text-red-400">{actionError}</p>}

                                    <div className="flex justify-end gap-3 pt-2">
                                        <button onClick={closeModal} className="px-4 py-2 text-sm text-slate-low hover:text-crisp-white transition-colors">
                                            Cancelar
                                        </button>
                                        <button
                                            onClick={handleSell}
                                            disabled={actionSubmitting || parseDecimal(sellData.quantity) <= 0 || parseDecimal(sellData.sale_price) <= 0}
                                            className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-sm font-semibold transition-all disabled:opacity-50"
                                        >
                                            {actionSubmitting ? 'Registrando...' : 'Confirmar venda'}
                                        </button>
                                    </div>
                                </>
                            )}
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
