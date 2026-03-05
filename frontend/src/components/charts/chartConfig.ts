// Shared chart configuration constants for investment charts

export const TOOLTIP_STYLE = {
    backgroundColor: '#111827',
    border: '1px solid #374151',
    borderRadius: '8px',
    fontSize: '12px',
    fontWeight: 'bold' as const,
    color: '#F9FAFB',
};

export const GRID_STYLE = {
    strokeDasharray: '3 3' as const,
    stroke: '#1F2937',
};

export const AXIS_TICK_STYLE = {
    fill: '#94A3B8',
    fontSize: 10,
    fontWeight: 'bold' as const,
};

export const LABEL_STYLE = { color: '#94A3B8', marginBottom: '4px' };

export const ASSET_COLORS: Record<string, string> = {
    STOCK: '#60A5FA',
    FII: '#FBBF24',
    CRYPTO: '#FB923C',
    FIXED_INCOME: '#34D399',
};

export const ASSET_LABELS: Record<string, string> = {
    STOCK: 'Ações',
    FII: 'FIIs',
    CRYPTO: 'Crypto',
    FIXED_INCOME: 'Renda Fixa',
};

export const BENCHMARK_COLORS = {
    portfolio: '#8B5CF6',
    IBOV: '#3B82F6',
    CDI: '#10B981',
    SP500: '#F59E0B',
};

export const formatBRL = (val: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

export const formatPct = (val: number) =>
    `${val >= 0 ? '+' : ''}${val.toFixed(2)}%`;
