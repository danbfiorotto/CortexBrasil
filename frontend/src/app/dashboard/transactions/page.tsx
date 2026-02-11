'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { motion, AnimatePresence } from 'framer-motion';

interface Transaction {
    id: string;
    amount: number;
    category: string;
    description: string;
    type: 'INCOME' | 'EXPENSE' | 'TRANSFER';
    account_id: string | null;
    date: string;
    is_installment: boolean;
    installment_info: string | null;
    is_cleared: boolean;
}

interface Account {
    id: string;
    name: string;
    type: string;
    current_balance: number;
}

const CATEGORIES = [
    "Alimentação", "Transporte", "Moradia", "Lazer", "Saúde",
    "Educação", "Compras", "Serviços", "Receita", "Outros"
];

const CATEGORY_ICONS: Record<string, string> = {
    'Alimentação': 'restaurant',
    'Transporte': 'commute',
    'Moradia': 'home',
    'Lazer': 'sports_esports',
    'Saúde': 'health_and_safety',
    'Educação': 'school',
    'Compras': 'shopping_cart',
    'Serviços': 'build',
    'Investimento': 'payments',
    'Renda': 'payments',
    'Outros': 'receipt_long',
};

const formatBRL = (val: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

export default function TransactionsPage() {
    const [data, setData] = useState<Transaction[]>([]);
    const [loading, setLoading] = useState(true);
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [category, setCategory] = useState<string>('');
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [editingTx, setEditingTx] = useState<Transaction | null>(null);
    const [editForm, setEditForm] = useState({ description: '', category: '', amount: 0, date: '', account_id: '' });
    const [showBulkCategoryMenu, setShowBulkCategoryMenu] = useState(false);
    const [aiQuery, setAiQuery] = useState('');
    const [isAiActive, setIsAiActive] = useState(false);
    const [aiLoading, setAiLoading] = useState(false);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [addType, setAddType] = useState<'INCOME' | 'EXPENSE'>('EXPENSE');
    const [addForm, setAddForm] = useState({
        description: '',
        category: 'Outros',
        amount: '',
        date: new Date().toISOString().split('T')[0],
        installments: 1,
        account_id: ''
    });

    useEffect(() => {
        fetchTransactions();
        fetchAccounts();
    }, [page, category]);

    const fetchAccounts = async () => {
        try {
            const res = await api.get('/api/accounts/');
            setAccounts(res.data.accounts);
            if (res.data.accounts.length > 0 && !addForm.account_id) {
                setAddForm(prev => ({ ...prev, account_id: res.data.accounts[0].id }));
            }
        } catch (error) {
            console.error("Failed to fetch accounts", error);
        }
    };

    const fetchTransactions = async () => {
        setLoading(true);
        try {
            const params: Record<string, string | number> = { page, limit: 10 };
            if (category && category !== 'Todas') params.category = category;

            const res = await api.get('/api/dashboard/transactions', { params });
            setData(res.data.data);
            setTotalPages(res.data.meta.pages);
        } catch (error) {
            console.error("Failed to fetch transactions", error);
        } finally {
            setLoading(false);
        }
    };

    const toggleSelect = (id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Deseja realmente apagar esta transação? Seu saldo será ajustado automaticamente.')) return;

        try {
            await api.delete(`/api/dashboard/transactions/${id}`);
            // Success: refresh data
            fetchTransactions();
        } catch (error) {
            console.error("Failed to delete transaction", error);
            alert("Erro ao deletar transação.");
        }
    };

    const handleBulkDelete = async () => {
        const count = selectedIds.size;
        if (!confirm(`Deseja apagar as ${count} transações selecionadas? Esta ação é irreversível.`)) return;

        try {
            await api.post('/api/dashboard/transactions/bulk-delete', {
                ids: Array.from(selectedIds)
            });
            setSelectedIds(new Set());
            fetchTransactions();
        } catch (error) {
            console.error("Failed to bulk delete transactions", error);
            alert("Erro ao deletar transações.");
        }
    };

    const handleBulkCategorize = async (cat: string) => {
        try {
            await api.post('/api/dashboard/transactions/bulk-update', {
                ids: Array.from(selectedIds),
                category: cat
            });
            setSelectedIds(new Set());
            setShowBulkCategoryMenu(false);
            fetchTransactions();
        } catch (error) {
            console.error("Bulk categorize failed", error);
        }
    };

    const handleBulkToggleMark = async () => {
        try {
            // Logic: if any selected is NOT cleared, mark all as cleared. 
            // Otherwise, mark all as NOT cleared.
            const selectedTxs = data.filter(tx => selectedIds.has(tx.id));
            const allCleared = selectedTxs.every(tx => tx.is_cleared);

            await api.post('/api/dashboard/transactions/bulk-update', {
                ids: Array.from(selectedIds),
                is_cleared: !allCleared
            });
            setSelectedIds(new Set());
            fetchTransactions();
        } catch (error) {
            console.error("Bulk mark failed", error);
        }
    };

    const handleExport = async () => {
        try {
            const res = await api.get('/api/dashboard/transactions/export', {
                params: { category: category && category !== 'Todas' ? category : undefined },
                responseType: 'blob'
            });
            const url = window.URL.createObjectURL(new Blob([res.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', 'transacoes.csv');
            document.body.appendChild(link);
            link.click();
            link.remove();
        } catch (error) {
            console.error("Export failed", error);
        }
    };

    const handleEdit = (tx: Transaction) => {
        setEditingTx(tx);
        setEditForm({
            description: tx.description,
            category: tx.category,
            amount: Math.abs(tx.amount),
            date: tx.date.split('T')[0],
            account_id: tx.account_id || ''
        });
    };

    const submitEdit = async () => {
        if (!editingTx) return;
        try {
            await api.patch(`/api/dashboard/transactions/${editingTx.id}`, editForm);
            setEditingTx(null);
            fetchTransactions();
            fetchAccounts(); // Refresh balances in case account was changed
        } catch (error) {
            console.error("Failed to update transaction", error);
            alert("Erro ao atualizar transação.");
        }
    };

    const submitAdd = async () => {
        try {
            await api.post('/api/dashboard/transactions', {
                ...addForm,
                category: addType === 'INCOME' ? 'Receita' : addForm.category,
                amount: parseFloat(addForm.amount),
                type: addType,
                installments: addType === 'EXPENSE' ? addForm.installments : 1
            });
            setIsAddModalOpen(false);
            setAddForm(prev => ({
                ...prev,
                description: '',
                category: 'Outros',
                amount: '',
                date: new Date().toISOString().split('T')[0],
                installments: 1
            }));
            fetchTransactions();
            fetchAccounts(); // Refresh balances
        } catch (error: any) {
            console.error("Failed to add transaction", error);
            alert("Erro ao adicionar transação: " + (error.response?.data?.detail || error.message));
        }
    };

    const handleAiSearch = async () => {
        if (!aiQuery.trim()) return;
        setAiLoading(true);
        try {
            const res = await api.post('/api/dashboard/transactions/search', { query: aiQuery });
            setData(res.data.data);
            setTotalPages(1);
            setIsAiActive(true);
        } catch (error) {
            console.error("AI Search failed", error);
            alert("Erro na busca com IA. Tente novamente.");
        } finally {
            setAiLoading(false);
        }
    };

    const clearAiSearch = () => {
        setIsAiActive(false);
        setAiQuery('');
        fetchTransactions();
    };

    const toggleSelectAll = () => {
        if (selectedIds.size === data.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(data.map(tx => tx.id)));
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col h-full"
        >
            {/* AI Search Bar */}
            <div className="px-8 pt-8 pb-6">
                <div className="max-w-4xl mx-auto w-full">
                    <div className="relative group">
                        <div className="absolute -inset-[1px] bg-gradient-to-r from-royal-purple to-indigo-600 rounded-lg blur-[2px] opacity-30 group-focus-within:opacity-60 transition duration-500" />
                        <div className="relative flex items-center bg-graphite-card border border-graphite-border rounded-lg px-5 h-14 search-glow">
                            <span className="material-symbols-outlined text-royal-purple mr-4 text-xl">auto_awesome</span>
                            <input
                                className="flex-1 bg-transparent border-none outline-none text-xs text-crisp-white placeholder:text-slate-low py-2.5 font-bold tracking-tight"
                                placeholder={aiLoading ? "Cortex está pensando..." : "Buscar transações com IA..."}
                                type="text"
                                value={aiQuery}
                                onChange={(e) => setAiQuery(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleAiSearch()}
                                disabled={aiLoading}
                            />
                            <div className="flex items-center gap-3">
                                <div className="hidden md:flex items-center gap-1">
                                    <kbd className="px-1.5 py-0.5 rounded border border-graphite-600 bg-charcoal-bg text-[10px] font-bold text-slate-low uppercase">ENTER</kbd>
                                </div>
                                <button
                                    onClick={handleAiSearch}
                                    disabled={aiLoading}
                                    className="bg-royal-purple hover:bg-royal-purple/90 text-crisp-white disabled:bg-slate-700 rounded px-4 py-1.5 text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2 shadow-lg shadow-royal-purple/20"
                                >
                                    {aiLoading ? 'Processando...' : 'Query'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {isAiActive && (
                <div className="px-8 py-2 bg-royal-purple/10 border-b border-royal-purple/20 flex items-center justify-between">
                    <p className="text-[10px] font-bold text-royal-purple uppercase tracking-widest flex items-center gap-2">
                        <span className="material-symbols-outlined text-sm">auto_awesome</span>
                        Modo Inteligente Ativo: "{aiQuery}"
                    </p>
                    <button
                        onClick={clearAiSearch}
                        className="text-[10px] font-black text-crisp-white uppercase tracking-widest hover:text-royal-purple transition-colors"
                    >
                        Limpar Busca
                    </button>
                </div>
            )}

            {/* Filter Bar */}
            <div className="px-8 py-3.5 flex flex-wrap items-center justify-between border-b border-graphite-border bg-carbon-800">
                <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
                    <div className="relative">
                        <select
                            value={category}
                            onChange={(e) => { setCategory(e.target.value); setPage(1); }}
                            className="appearance-none bg-graphite-card border border-graphite-border px-3 py-1.5 pr-8 rounded text-[10px] font-bold text-slate-low uppercase tracking-wider cursor-pointer hover:text-crisp-white transition-colors focus:ring-1 focus:ring-royal-purple outline-none"
                        >
                            <option value="">Todas Categorias</option>
                            {CATEGORIES.map(cat => (
                                <option key={cat} value={cat}>{cat}</option>
                            ))}
                        </select>
                        <span className="material-symbols-outlined absolute right-2 top-1/2 -translate-y-1/2 text-sm text-slate-low pointer-events-none">
                            keyboard_arrow_down
                        </span>
                    </div>
                </div>

                <span className="text-[10px] font-bold text-slate-low uppercase tracking-widest">
                    Pág {page}/{totalPages}
                </span>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => { setAddType('INCOME'); setIsAddModalOpen(true); }}
                        className="bg-emerald-vibrant/10 hover:bg-emerald-vibrant/20 text-emerald-vibrant border border-emerald-vibrant/30 rounded px-3 py-1.5 text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2"
                    >
                        <span className="material-symbols-outlined text-sm">add_circle</span>
                        Nova Receita
                    </button>
                    <button
                        onClick={() => { setAddType('EXPENSE'); setIsAddModalOpen(true); }}
                        className="bg-crimson-bright/10 hover:bg-crimson-bright/20 text-crimson-bright border border-crimson-bright/30 rounded px-3 py-1.5 text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2"
                    >
                        <span className="material-symbols-outlined text-sm">remove_circle</span>
                        Nova Despesa
                    </button>
                </div>
            </div>

            {/* Table */}
            <div className="flex-1 overflow-auto px-8 py-6">
                {loading ? (
                    <div className="flex items-center justify-center py-20">
                        <div className="flex flex-col items-center gap-4">
                            <div className="w-8 h-8 border-4 border-royal-purple border-t-transparent rounded-full animate-spin" />
                            <p className="text-slate-low text-xs">Carregando transações...</p>
                        </div>
                    </div>
                ) : (
                    <>
                        <div className="min-w-[700px] bg-graphite-card border border-graphite-border rounded-xl overflow-hidden shadow-2xl">
                            <table className="w-full border-separate border-spacing-0">
                                <thead className="sticky top-0 z-20">
                                    <tr className="text-left bg-carbon-800">
                                        <th className="py-4 px-6 border-b border-graphite-700 w-10">
                                            <input
                                                type="checkbox"
                                                checked={selectedIds.size === data.length && data.length > 0}
                                                onChange={toggleSelectAll}
                                                className="rounded-sm bg-charcoal-bg border-graphite-600 text-royal-purple focus:ring-royal-purple cursor-pointer"
                                            />
                                        </th>
                                        <th className="py-4 px-4 border-b border-graphite-700 text-[10px] font-black text-slate-low uppercase tracking-[0.15em]">Data</th>
                                        <th className="py-4 px-4 border-b border-graphite-700 text-[10px] font-black text-slate-low uppercase tracking-[0.15em]">Descrição</th>
                                        <th className="py-4 px-4 border-b border-graphite-700 text-[10px] font-black text-slate-low uppercase tracking-[0.15em]">Conta</th>
                                        <th className="py-4 px-4 border-b border-graphite-700 text-[10px] font-black text-slate-low uppercase tracking-[0.15em]">Categoria</th>
                                        <th className="py-4 px-4 border-b border-graphite-700 text-[10px] font-black text-slate-low uppercase tracking-[0.15em] text-right">Valor</th>
                                        <th className="py-4 px-6 border-b border-graphite-700 text-[10px] font-black text-slate-low uppercase tracking-[0.15em]">Status</th>
                                        <th className="py-4 px-6 border-b border-graphite-700 text-[10px] font-black text-slate-low uppercase tracking-[0.15em] text-center w-16">Ações</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-graphite-border">
                                    {data.map((tx) => {
                                        const isIncome = tx.amount > 0;
                                        const iconName = CATEGORY_ICONS[tx.category] || 'receipt_long';
                                        const isSelected = selectedIds.has(tx.id);

                                        return (
                                            <tr
                                                key={tx.id}
                                                className={`group hover:bg-royal-purple/5 transition-colors ${isSelected ? 'bg-royal-purple/5' : ''}`}
                                            >
                                                <td className="py-4 px-6 border-b border-graphite-border">
                                                    <input
                                                        type="checkbox"
                                                        checked={isSelected}
                                                        onChange={() => toggleSelect(tx.id)}
                                                        className="rounded-sm bg-charcoal-bg border-graphite-600 text-royal-purple focus:ring-royal-purple cursor-pointer"
                                                    />
                                                </td>
                                                <td className="py-4 px-4 border-b border-graphite-border text-[11px] font-bold text-slate-low tracking-tight">
                                                    {new Date(tx.date).toLocaleDateString('pt-BR').toUpperCase()}
                                                </td>
                                                <td className="py-4 px-4 border-b border-graphite-border">
                                                    <div className="flex items-center gap-3">
                                                        <div className="size-8 rounded bg-charcoal-bg flex items-center justify-center border border-graphite-700 text-slate-low group-hover:text-royal-purple transition-colors">
                                                            <span className="material-symbols-outlined text-lg">{iconName}</span>
                                                        </div>
                                                        <span className="text-xs font-bold text-crisp-white tracking-tight uppercase">
                                                            {tx.description}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="py-4 px-4 border-b border-graphite-border">
                                                    <div className="flex flex-col gap-1">
                                                        <span className="text-[10px] font-bold text-slate-low uppercase tracking-wider">
                                                            {accounts.find(a => a.id === tx.account_id)?.name || 'Carteira'}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="py-4 px-4 border-b border-graphite-border">
                                                    <span className={`px-2 py-1 rounded-sm text-[9px] font-black uppercase tracking-widest ${tx.type === 'INCOME'
                                                        ? 'bg-emerald-vibrant/10 text-emerald-vibrant border border-emerald-vibrant/30'
                                                        : tx.is_installment
                                                            ? 'bg-royal-purple/10 text-royal-purple border border-royal-purple/30'
                                                            : 'bg-crimson-bright/10 text-crimson-bright border border-crimson-bright/30'
                                                        }`}>
                                                        {tx.category}
                                                    </span>
                                                </td>
                                                <td className={`py-4 px-4 border-b border-graphite-border text-xs font-black text-right ${tx.type === 'INCOME' ? 'text-emerald-vibrant font-black' : 'text-crimson-bright'
                                                    }`}>
                                                    {tx.type === 'INCOME' ? '+ ' : '- '}{formatBRL(Math.abs(tx.amount))}
                                                </td>
                                                <td className="py-4 px-6 border-b border-graphite-border">
                                                    <div className="flex items-center gap-2">
                                                        <div className={`size-1.5 rounded-full ${tx.is_cleared
                                                            ? 'bg-emerald-vibrant shadow-[0_0_8px_rgba(16,185,129,0.4)]'
                                                            : 'bg-slate-500 shadow-[0_0_8px_rgba(100,116,139,0.4)]'
                                                            }`} />
                                                        <span className={`text-[9px] font-black uppercase tracking-widest ${tx.is_cleared ? 'text-emerald-vibrant' : 'text-slate-500'}`}>
                                                            {tx.is_installment ? tx.installment_info || 'Parcelado' : tx.is_cleared ? 'Cleared' : 'Pending'}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="py-4 px-6 border-b border-graphite-border">
                                                    <div className="flex justify-center gap-2">
                                                        <button
                                                            onClick={() => handleEdit(tx)}
                                                            className="size-8 rounded-lg bg-royal-purple/10 text-royal-purple hover:bg-royal-purple hover:text-white transition-all flex items-center justify-center opacity-0 group-hover:opacity-100"
                                                            title="Editar transação"
                                                        >
                                                            <span className="material-symbols-outlined text-[18px]">edit</span>
                                                        </button>
                                                        <button
                                                            onClick={() => handleDelete(tx.id)}
                                                            className="size-8 rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white transition-all flex items-center justify-center opacity-0 group-hover:opacity-100"
                                                            title="Apagar transação"
                                                        >
                                                            <span className="material-symbols-outlined text-[18px]">delete</span>
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        {/* Pagination */}
                        <div className="mt-8 flex justify-between items-center text-[10px] font-bold text-slate-low uppercase tracking-[0.2em] pb-8">
                            <span>Página {page} de {totalPages}</span>
                            <div className="flex gap-4">
                                <button
                                    disabled={page === 1}
                                    onClick={() => setPage(p => Math.max(1, p - 1))}
                                    className="hover:text-royal-purple transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                                >
                                    Anterior
                                </button>
                                <button
                                    disabled={page === totalPages}
                                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                    className="hover:text-royal-purple transition-colors text-crisp-white disabled:opacity-30 disabled:cursor-not-allowed"
                                >
                                    Próxima
                                </button>
                            </div>
                        </div>
                    </>
                )}
            </div>

            {/* Floating Action Bar */}
            {
                selectedIds.size > 0 && (
                    <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50">
                        <div className="glass-panel rounded-lg shadow-2xl px-6 py-3.5 flex items-center gap-8 min-w-[480px]">
                            <div className="flex items-center gap-4">
                                <div className="bg-royal-purple size-5 rounded-sm flex items-center justify-center text-[10px] font-black text-crisp-white">
                                    {String(selectedIds.size).padStart(2, '0')}
                                </div>
                                <span className="text-xs font-black text-crisp-white uppercase tracking-wider">
                                    Selecionadas
                                </span>
                            </div>
                            <div className="h-6 w-px bg-graphite-700" />
                            <div className="flex items-center gap-5">
                                <div className="relative">
                                    <button
                                        onClick={() => setShowBulkCategoryMenu(!showBulkCategoryMenu)}
                                        className="flex items-center gap-2 text-slate-low hover:text-crisp-white transition-colors text-[10px] font-black uppercase tracking-widest"
                                    >
                                        <span className="material-symbols-outlined text-base">edit</span>
                                        Categorizar
                                    </button>
                                    {showBulkCategoryMenu && (
                                        <div className="absolute bottom-full mb-2 left-0 bg-graphite-card border border-graphite-border rounded shadow-2xl py-2 min-w-[140px] z-[60]">
                                            {CATEGORIES.map(cat => (
                                                <button
                                                    key={cat}
                                                    onClick={() => handleBulkCategorize(cat)}
                                                    className="w-full text-left px-4 py-2 text-[10px] font-bold text-slate-low hover:text-crisp-white hover:bg-royal-purple/20 transition-colors uppercase"
                                                >
                                                    {cat}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                <button
                                    onClick={handleBulkToggleMark}
                                    className="flex items-center gap-2 text-slate-low hover:text-crisp-white transition-colors text-[10px] font-black uppercase tracking-widest"
                                >
                                    <span className="material-symbols-outlined text-base">flag</span>
                                    Marcar
                                </button>
                                <button
                                    onClick={handleExport}
                                    className="flex items-center gap-2 text-slate-low hover:text-crisp-white transition-colors text-[10px] font-black uppercase tracking-widest"
                                >
                                    <span className="material-symbols-outlined text-base">export_notes</span>
                                    Exportar
                                </button>
                                <button
                                    onClick={handleBulkDelete}
                                    className="flex items-center gap-2 text-crimson-bright hover:bg-crimson-bright/10 px-2 py-1 rounded transition-colors text-[10px] font-black uppercase tracking-widest"
                                >
                                    <span className="material-symbols-outlined text-base">delete</span>
                                    Deletar
                                </button>
                            </div>
                            <button
                                onClick={() => setSelectedIds(new Set())}
                                className="ml-auto text-slate-600 hover:text-crisp-white transition-colors"
                            >
                                <span className="material-symbols-outlined text-base">close</span>
                            </button>
                        </div>
                    </div>
                )
            }

            {/* Edit Modal */}
            <AnimatePresence>
                {editingTx && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setEditingTx(null)}
                            className="absolute inset-0 bg-charcoal-bg/80 backdrop-blur-sm"
                        />
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.95, opacity: 0, y: 20 }}
                            className="relative w-full max-w-md bg-graphite-card border border-graphite-border rounded-2xl p-8 shadow-2xl"
                        >
                            <h3 className="text-xl font-bold text-crisp-white mb-6 flex items-center gap-3">
                                <span className="material-symbols-outlined text-royal-purple">edit_note</span>
                                Editar Transação
                            </h3>

                            <div className="space-y-5">
                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <p className="text-[9px] font-black text-slate-low uppercase tracking-[0.2em] pl-1">Contas e Dinheiro</p>
                                        <div className="grid grid-cols-2 gap-2">
                                            {accounts.filter(a => a.type !== 'CREDIT').map(acc => (
                                                <button
                                                    key={acc.id}
                                                    type="button"
                                                    onClick={() => setEditForm(prev => ({ ...prev, account_id: acc.id }))}
                                                    className={`p-3 rounded-xl border text-left transition-all ${editForm.account_id === acc.id
                                                        ? 'bg-royal-purple/10 border-royal-purple shadow-lg shadow-royal-purple/10'
                                                        : 'bg-charcoal-bg border-graphite-border hover:border-graphite-600'
                                                        }`}
                                                >
                                                    <div className="flex justify-between items-start">
                                                        <p className={`text-[10px] font-black uppercase tracking-wider ${editForm.account_id === acc.id ? 'text-royal-purple' : 'text-slate-low'}`}>
                                                            {acc.name}
                                                        </p>
                                                        {editForm.account_id === acc.id && (
                                                            <div className="w-1.5 h-1.5 rounded-full bg-royal-purple shadow-[0_0_8px_rgba(139,92,246,0.6)]" />
                                                        )}
                                                    </div>
                                                    <p className="text-xs font-bold text-crisp-white mt-1">
                                                        {formatBRL(acc.current_balance)}
                                                    </p>
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {accounts.some(a => a.type === 'CREDIT') && (
                                        <div className="space-y-2 pt-1">
                                            <p className="text-[9px] font-black text-slate-low uppercase tracking-[0.2em] pl-1">Cartões de Crédito</p>
                                            <div className="grid grid-cols-2 gap-2">
                                                {accounts.filter(a => a.type === 'CREDIT').map(acc => (
                                                    <button
                                                        key={acc.id}
                                                        type="button"
                                                        onClick={() => setEditForm(prev => ({ ...prev, account_id: acc.id }))}
                                                        className={`p-3 rounded-xl border text-left transition-all ${editForm.account_id === acc.id
                                                            ? 'bg-royal-purple/10 border-royal-purple shadow-lg shadow-royal-purple/10'
                                                            : 'bg-charcoal-bg border-graphite-border hover:border-graphite-600'
                                                            }`}
                                                    >
                                                        <div className="flex justify-between items-start">
                                                            <p className={`text-[10px] font-black uppercase tracking-wider ${editForm.account_id === acc.id ? 'text-royal-purple' : 'text-slate-low'}`}>
                                                                {acc.name}
                                                            </p>
                                                            {editForm.account_id === acc.id && (
                                                                <div className="w-1.5 h-1.5 rounded-full bg-royal-purple shadow-[0_0_8px_rgba(139,92,246,0.6)]" />
                                                            )}
                                                        </div>
                                                        <p className="text-xs font-bold text-crisp-white mt-1">
                                                            {formatBRL(Math.abs(acc.current_balance))}
                                                        </p>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-low uppercase tracking-widest pl-1">Descrição</label>
                                    <input
                                        type="text"
                                        value={editForm.description}
                                        onChange={(e) => setEditForm(prev => ({ ...prev, description: e.target.value }))}
                                        className="w-full bg-charcoal-bg border border-graphite-border rounded-lg px-4 py-3 text-sm text-crisp-white focus:ring-1 focus:ring-royal-purple outline-none transition-all"
                                    />
                                </div>
                                {editingTx?.type !== 'INCOME' && (
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-low uppercase tracking-widest pl-1">Categoria</label>
                                        <select
                                            value={editForm.category}
                                            onChange={(e) => setEditForm(prev => ({ ...prev, category: e.target.value }))}
                                            className="w-full bg-charcoal-bg border border-graphite-border rounded-lg px-4 py-3 text-sm text-crisp-white focus:ring-1 focus:ring-royal-purple outline-none transition-all appearance-none"
                                        >
                                            {CATEGORIES.map(cat => (
                                                <option key={cat} value={cat}>{cat}</option>
                                            ))}
                                        </select>
                                    </div>
                                )}

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-low uppercase tracking-widest pl-1">Valor</label>
                                        <input
                                            type="number"
                                            step="0.01"
                                            value={editForm.amount}
                                            onChange={(e) => setEditForm(prev => ({ ...prev, amount: parseFloat(e.target.value) }))}
                                            className="w-full bg-charcoal-bg border border-graphite-border rounded-lg px-4 py-3 text-sm text-crisp-white focus:ring-1 focus:ring-royal-purple outline-none transition-all"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-low uppercase tracking-widest pl-1">Data</label>
                                        <input
                                            type="date"
                                            value={editForm.date}
                                            onChange={(e) => setEditForm(prev => ({ ...prev, date: e.target.value }))}
                                            className="w-full bg-charcoal-bg border border-graphite-border rounded-lg px-4 py-3 text-sm text-crisp-white focus:ring-1 focus:ring-royal-purple outline-none transition-all"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="flex gap-4 mt-8">
                                <button
                                    onClick={() => setEditingTx(null)}
                                    className="flex-1 px-6 py-3 rounded-xl border border-graphite-border text-xs font-black uppercase tracking-widest text-slate-low hover:text-crisp-white hover:bg-graphite-border/30 transition-all"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={submitEdit}
                                    className="flex-1 px-6 py-3 rounded-xl bg-royal-purple text-crisp-white text-xs font-black uppercase tracking-widest hover:bg-royal-purple/90 transition-all shadow-lg shadow-royal-purple/20"
                                >
                                    Salvar Alteração
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Add Modal */}
            <AnimatePresence>
                {isAddModalOpen && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setIsAddModalOpen(false)}
                            className="absolute inset-0 bg-charcoal-bg/80 backdrop-blur-sm"
                        />
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.95, opacity: 0, y: 20 }}
                            className="relative w-full max-w-md bg-graphite-card border border-graphite-border rounded-2xl p-8 shadow-2xl"
                        >
                            <h3 className="text-xl font-bold text-crisp-white mb-6 flex items-center gap-3">
                                <span className={`material-symbols-outlined ${addType === 'INCOME' ? 'text-emerald-vibrant' : 'text-crimson-bright'}`}>
                                    {addType === 'INCOME' ? 'add_circle' : 'remove_circle'}
                                </span>
                                {addType === 'INCOME' ? 'Nova Receita' : 'Nova Despesa'}
                            </h3>

                            <div className="space-y-5">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-low uppercase tracking-widest pl-1">Descrição</label>
                                    <input
                                        type="text"
                                        placeholder="Ex: Almoço, Salário..."
                                        value={addForm.description}
                                        onChange={(e) => setAddForm(prev => ({ ...prev, description: e.target.value }))}
                                        className="w-full bg-charcoal-bg border border-graphite-border rounded-lg px-4 py-3 text-sm text-crisp-white focus:ring-1 focus:ring-royal-purple outline-none transition-all"
                                    />
                                </div>
                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-low uppercase tracking-widest pl-1">
                                            {addType === 'INCOME' ? 'Depositar em' : 'Pagar com'}
                                        </label>

                                        {/* Bank Accounts */}
                                        <div className="space-y-2">
                                            <p className="text-[9px] font-black text-slate-low uppercase tracking-[0.2em] pl-1">Contas e Dinheiro</p>
                                            <div className="grid grid-cols-2 gap-2">
                                                {accounts.filter(a => a.type !== 'CREDIT').map(acc => (
                                                    <button
                                                        key={acc.id}
                                                        type="button"
                                                        onClick={() => setAddForm(prev => ({ ...prev, account_id: acc.id }))}
                                                        className={`p-3 rounded-xl border text-left transition-all ${addForm.account_id === acc.id
                                                            ? 'bg-royal-purple/10 border-royal-purple shadow-lg shadow-royal-purple/10'
                                                            : 'bg-charcoal-bg border-graphite-border hover:border-graphite-600'
                                                            }`}
                                                    >
                                                        <div className="flex justify-between items-start">
                                                            <p className={`text-[10px] font-black uppercase tracking-wider ${addForm.account_id === acc.id ? 'text-royal-purple' : 'text-slate-low'}`}>
                                                                {acc.name}
                                                            </p>
                                                            {addForm.account_id === acc.id && (
                                                                <div className="w-1.5 h-1.5 rounded-full bg-royal-purple shadow-[0_0_8px_rgba(139,92,246,0.6)]" />
                                                            )}
                                                        </div>
                                                        <p className="text-xs font-bold text-crisp-white mt-1">
                                                            {formatBRL(acc.current_balance)}
                                                        </p>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Credit Cards (Only for Expenses) */}
                                        {addType === 'EXPENSE' && accounts.some(a => a.type === 'CREDIT') && (
                                            <div className="space-y-2 pt-1">
                                                <p className="text-[9px] font-black text-slate-low uppercase tracking-[0.2em] pl-1">Cartões de Crédito</p>
                                                <div className="grid grid-cols-2 gap-2">
                                                    {accounts.filter(a => a.type === 'CREDIT').map(acc => (
                                                        <button
                                                            key={acc.id}
                                                            type="button"
                                                            onClick={() => setAddForm(prev => ({ ...prev, account_id: acc.id }))}
                                                            className={`p-3 rounded-xl border text-left transition-all ${addForm.account_id === acc.id
                                                                ? 'bg-royal-purple/10 border-royal-purple shadow-lg shadow-royal-purple/10'
                                                                : 'bg-charcoal-bg border-graphite-border hover:border-graphite-600'
                                                                }`}
                                                        >
                                                            <div className="flex justify-between items-start">
                                                                <p className={`text-[10px] font-black uppercase tracking-wider ${addForm.account_id === acc.id ? 'text-royal-purple' : 'text-slate-low'}`}>
                                                                    {acc.name}
                                                                </p>
                                                                {addForm.account_id === acc.id && (
                                                                    <div className="w-1.5 h-1.5 rounded-full bg-royal-purple shadow-[0_0_8px_rgba(139,92,246,0.6)]" />
                                                                )}
                                                            </div>
                                                            <p className="text-xs font-bold text-crisp-white mt-1">
                                                                {formatBRL(Math.abs(acc.current_balance))}
                                                            </p>
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {addType !== 'INCOME' && (
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-low uppercase tracking-widest pl-1">Categoria</label>
                                        <select
                                            value={addForm.category}
                                            onChange={(e) => setAddForm(prev => ({ ...prev, category: e.target.value }))}
                                            className="w-full bg-charcoal-bg border border-graphite-border rounded-lg px-4 py-3 text-sm text-crisp-white focus:ring-1 focus:ring-royal-purple outline-none transition-all appearance-none"
                                        >
                                            {CATEGORIES.map(cat => (
                                                <option key={cat} value={cat}>{cat}</option>
                                            ))}
                                        </select>
                                    </div>
                                )}

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-low uppercase tracking-widest pl-1">Valor</label>
                                        <input
                                            type="number"
                                            step="0.01"
                                            placeholder="0,00"
                                            value={addForm.amount}
                                            onChange={(e) => setAddForm(prev => ({ ...prev, amount: e.target.value }))}
                                            className="w-full bg-charcoal-bg border border-graphite-border rounded-lg px-4 py-3 text-sm text-crisp-white focus:ring-1 focus:ring-royal-purple outline-none transition-all"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-low uppercase tracking-widest pl-1">Data</label>
                                        <input
                                            type="date"
                                            value={addForm.date}
                                            onChange={(e) => setAddForm(prev => ({ ...prev, date: e.target.value }))}
                                            className="w-full bg-charcoal-bg border border-graphite-border rounded-lg px-4 py-3 text-sm text-crisp-white focus:ring-1 focus:ring-royal-purple outline-none transition-all"
                                        />
                                    </div>
                                </div>

                                {addType === 'EXPENSE' && (
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-low uppercase tracking-widest pl-1">Parcelas</label>
                                        <input
                                            type="number"
                                            min="1"
                                            value={addForm.installments}
                                            onChange={(e) => setAddForm(prev => ({ ...prev, installments: parseInt(e.target.value) || 1 }))}
                                            className="w-full bg-charcoal-bg border border-graphite-border rounded-lg px-4 py-3 text-sm text-crisp-white focus:ring-1 focus:ring-royal-purple outline-none transition-all"
                                        />
                                    </div>
                                )}
                            </div>

                            <div className="flex gap-4 mt-8">
                                <button
                                    onClick={() => setIsAddModalOpen(false)}
                                    className="flex-1 px-6 py-3 rounded-xl border border-graphite-border text-xs font-black uppercase tracking-widest text-slate-low hover:text-crisp-white hover:bg-graphite-border/30 transition-all"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={submitAdd}
                                    className={`flex-1 px-6 py-3 rounded-xl text-crisp-white text-xs font-black uppercase tracking-widest transition-all shadow-lg ${addType === 'INCOME' ? 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-900/20' : 'bg-crimson-bright hover:bg-crimson-bright/90 shadow-crimson-bright/20'}`}
                                >
                                    Criar {addType === 'INCOME' ? 'Receita' : 'Despesa'}
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </motion.div >
    );
}
