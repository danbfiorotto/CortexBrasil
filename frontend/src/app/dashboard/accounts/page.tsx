'use client';

import { useEffect, useState, useCallback } from 'react';
import Cookies from 'js-cookie';
import { motion, AnimatePresence } from 'framer-motion';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

const ACCOUNT_TYPE_MAP: Record<string, { label: string; icon: string; color: string }> = {
    CHECKING: { label: 'Conta Corrente', icon: '🏦', color: 'text-emerald-400' },
    CREDIT: { label: 'Cartão de Crédito', icon: '💳', color: 'text-violet-400' },
    INVESTMENT: { label: 'Investimento', icon: '📈', color: 'text-amber-400' },
    CASH: { label: 'Dinheiro', icon: '💵', color: 'text-green-400' },
};

interface Account {
    id: string;
    name: string;
    type: 'CHECKING' | 'CREDIT' | 'INVESTMENT' | 'CASH';
    initial_balance: number;
    current_balance: number;
    credit_limit?: number;
    due_day?: number;
    closing_day?: number;
    is_default?: boolean;
}

export default function AccountsPage() {
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [totalBalance, setTotalBalance] = useState(0);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const parseDecimal = (val: string) => parseFloat(String(val).replace(',', '.')) || 0;

    const handleDecimalKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        const allowed = ['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Tab', 'Home', 'End'];
        if (allowed.includes(e.key)) return;
        if ((e.ctrlKey || e.metaKey) && ['a', 'c', 'v', 'x'].includes(e.key)) return;
        if (!/^[\d,.]$/.test(e.key)) e.preventDefault();
    };

    const [formData, setFormData] = useState({
        name: '',
        type: 'CHECKING',
        initial_balance: '' as string | number,
        credit_limit: '' as string | number,
        due_day: 10,
        days_before_closing: 7
    });
    const [submitting, setSubmitting] = useState(false);
    const [createError, setCreateError] = useState('');
    const [createSuccess, setCreateSuccess] = useState('');
    const [adjustingAccount, setAdjustingAccount] = useState<Account | null>(null);
    const [adjustForm, setAdjustForm] = useState({ new_balance: '' as string | number, description: '' });
    const [adjustSubmitting, setAdjustSubmitting] = useState(false);
    const [adjustError, setAdjustError] = useState('');

    // Edit state
    const [editingAccount, setEditingAccount] = useState<Account | null>(null);
    const [editForm, setEditForm] = useState({
        name: '',
        credit_limit: '' as string | number,
        due_day: 10,
        days_before_closing: 7,
        closing_day: 3,
    });
    const [editSubmitting, setEditSubmitting] = useState(false);
    const [editError, setEditError] = useState('');

    // Delete state
    const [deletingAccount, setDeletingAccount] = useState<Account | null>(null);
    const [deleteSubmitting, setDeleteSubmitting] = useState(false);

    // Default account
    const [settingDefault, setSettingDefault] = useState<string | null>(null);

    const handleSetDefault = async (acc: Account) => {
        setSettingDefault(acc.id);
        const token = Cookies.get('token');
        try {
            await fetch(`${API_URL}/api/accounts/${acc.id}/set-default`, {
                method: 'PATCH',
                headers: { Authorization: `Bearer ${token}` },
            });
            await fetchAccounts();
        } catch (error) {
            console.error('Failed to set default account:', error);
        } finally {
            setSettingDefault(null);
        }
    };

    const fetchAccounts = useCallback(async () => {
        const token = Cookies.get('token');
        try {
            const res = await fetch(`${API_URL}/api/accounts/`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) {
                const data = await res.json();
                setAccounts(data.accounts);
                setTotalBalance(data.total_balance);
            }
        } catch (error) {
            console.error('Failed to fetch accounts:', error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchAccounts();
    }, [fetchAccounts]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        setCreateError('');
        const token = Cookies.get('token');
        try {
            const res = await fetch(`${API_URL}/api/accounts/`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    ...formData,
                    initial_balance: parseDecimal(String(formData.initial_balance)),
                    credit_limit: parseDecimal(String(formData.credit_limit)),
                    closing_day: formData.type === 'CREDIT'
                        ? ((formData.due_day - formData.days_before_closing - 1 + 31) % 31) + 1
                        : undefined,
                }),
            });
            if (res.ok) {
                const data = await res.json();
                setShowForm(false);
                setCreateError('');
                setFormData({
                    name: '',
                    type: 'CHECKING',
                    initial_balance: '',
                    credit_limit: '',
                    due_day: 10,
                    days_before_closing: 7
                });
                await fetchAccounts();
                if (data.reactivated) {
                    setCreateSuccess(data.message);
                    setTimeout(() => setCreateSuccess(''), 6000);
                }
            } else {
                const data = await res.json();
                if (res.status === 409) {
                    setCreateError(data.detail || 'Já existe uma conta com esse nome e tipo. Escolha um nome diferente.');
                } else {
                    setCreateError(data.detail || 'Erro ao criar conta. Tente novamente.');
                }
            }
        } catch (error) {
            console.error('Failed to create account:', error);
            setCreateError('Erro de conexão. Verifique sua internet e tente novamente.');
        } finally {
            setSubmitting(false);
        }
    };

    const openAdjust = (acc: Account) => {
        setAdjustingAccount(acc);
        setAdjustForm({ new_balance: acc.current_balance.toString(), description: '' });
        setAdjustError('');
    };

    const handleAdjustSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!adjustingAccount) return;
        setAdjustSubmitting(true);
        setAdjustError('');
        const token = Cookies.get('token');
        try {
            const res = await fetch(`${API_URL}/api/accounts/${adjustingAccount.id}/balance`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ ...adjustForm, new_balance: parseDecimal(String(adjustForm.new_balance)) }),
            });
            if (res.ok) {
                setAdjustingAccount(null);
                await fetchAccounts();
            } else {
                const data = await res.json();
                setAdjustError(data.detail || 'Erro ao ajustar saldo.');
            }
        } catch {
            setAdjustError('Erro de conexão.');
        } finally {
            setAdjustSubmitting(false);
        }
    };

    const openEdit = (acc: Account) => {
        const daysBeforeClosing = acc.due_day && acc.closing_day
            ? ((acc.due_day - acc.closing_day + 31) % 31) || 7
            : 7;
        setEditingAccount(acc);
        setEditForm({
            name: acc.name,
            credit_limit: acc.credit_limit ? acc.credit_limit.toString() : '',
            due_day: acc.due_day || 10,
            days_before_closing: daysBeforeClosing,
            closing_day: acc.closing_day || 3,
        });
        setEditError('');
    };

    const handleEditSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingAccount) return;
        setEditSubmitting(true);
        setEditError('');
        const token = Cookies.get('token');
        try {
            const body: Record<string, unknown> = { name: editForm.name };
            if (editingAccount.type === 'CREDIT') {
                body.credit_limit = parseDecimal(String(editForm.credit_limit));
                body.due_day = editForm.due_day;
                body.closing_day = ((editForm.due_day - editForm.days_before_closing - 1 + 31) % 31) + 1;
            }
            const res = await fetch(`${API_URL}/api/accounts/${editingAccount.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify(body),
            });
            if (res.ok) {
                setEditingAccount(null);
                await fetchAccounts();
            } else {
                const data = await res.json();
                setEditError(data.detail || 'Erro ao editar conta.');
            }
        } catch {
            setEditError('Erro de conexão.');
        } finally {
            setEditSubmitting(false);
        }
    };

    const handleDelete = async () => {
        if (!deletingAccount) return;
        setDeleteSubmitting(true);
        const token = Cookies.get('token');
        try {
            const res = await fetch(`${API_URL}/api/accounts/${deletingAccount.id}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok || res.status === 204) {
                setDeletingAccount(null);
                await fetchAccounts();
            }
        } catch {
            // silent fail — fetchAccounts will reflect the actual state
        } finally {
            setDeleteSubmitting(false);
        }
    };

    const formatCurrency = (value: number) =>
        new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

    return (
        <div className="p-6 md:p-10 max-w-6xl mx-auto space-y-8">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight">Contas</h2>
                    <p className="text-sm text-slate-low mt-1">
                        Gerencie suas contas bancárias e carteiras
                    </p>
                </div>
                <button
                    onClick={() => setShowForm(!showForm)}
                    className="px-4 py-2 rounded-xl bg-royal-purple hover:bg-royal-purple/80 text-sm font-semibold transition-all flex items-center gap-2"
                >
                    <span className="text-lg">+</span> Nova Conta
                </button>
            </div>

            {/* Total Balance Card */}
            <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                className="glass-panel rounded-2xl p-6"
            >
                <p className="text-xs uppercase tracking-widest text-slate-low mb-1">Patrimônio Líquido</p>
                <p className={`text-3xl font-bold ${totalBalance >= 0 ? 'text-emerald-400 subtle-glow-emerald' : 'text-crimson-bright subtle-glow-crimson'}`}>
                    {formatCurrency(totalBalance)}
                </p>
            </motion.div>

            {/* New Account Form */}
            <AnimatePresence>
                {showForm && (
                    <motion.form
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        onSubmit={handleSubmit}
                        className="glass-panel rounded-2xl p-6 space-y-4 overflow-hidden"
                    >
                        <h3 className="text-lg font-semibold">Criar Nova Conta</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-low uppercase tracking-widest pl-1">
                                    {formData.type === 'CREDIT' ? 'Nome do Cartão' : 'Nome da Instituição'}
                                </label>
                                <input
                                    type="text"
                                    placeholder={formData.type === 'CREDIT' ? 'Ex: Nubank Ultravioleta, Itaú Black' : 'Ex: Nubank, Itaú'}
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    className="w-full bg-charcoal-bg border border-graphite-border rounded-xl px-4 py-3 text-sm text-crisp-white focus:ring-1 focus:ring-royal-purple outline-none transition-all"
                                    required
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-low uppercase tracking-widest pl-1">Tipo de Conta</label>
                                <select
                                    value={formData.type}
                                    onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                                    className="w-full bg-charcoal-bg border border-graphite-border rounded-xl px-4 py-3 text-sm text-crisp-white focus:ring-1 focus:ring-royal-purple outline-none transition-all appearance-none"
                                >
                                    <option value="CHECKING">🏦 Conta Corrente</option>
                                    <option value="CREDIT">💳 Cartão de Crédito</option>
                                    <option value="INVESTMENT">📈 Investimento</option>
                                    <option value="CASH">💵 Dinheiro / Carteira</option>
                                </select>
                            </div>
                            {formData.type !== 'CREDIT' && (
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-low uppercase tracking-widest pl-1">Saldo Inicial</label>
                                    <input
                                        type="text"
                                        inputMode="decimal"
                                        placeholder="0,00"
                                        value={formData.initial_balance}
                                        onKeyDown={handleDecimalKeyDown}
                                        onChange={(e) => setFormData({ ...formData, initial_balance: e.target.value })}
                                        className="w-full bg-charcoal-bg border border-graphite-border rounded-xl px-4 py-3 text-sm text-crisp-white focus:ring-1 focus:ring-royal-purple outline-none transition-all"
                                    />
                                </div>
                            )}

                            {formData.type === 'CREDIT' && (
                                <>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-low uppercase tracking-widest pl-1">Limite do Cartão</label>
                                        <input
                                            type="text"
                                            inputMode="decimal"
                                            placeholder="0,00"
                                            value={formData.credit_limit}
                                            onKeyDown={handleDecimalKeyDown}
                                            onChange={(e) => setFormData({ ...formData, credit_limit: e.target.value })}
                                            className="w-full bg-charcoal-bg border border-graphite-border rounded-xl px-4 py-3 text-sm text-crisp-white focus:ring-1 focus:ring-royal-purple outline-none transition-all"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-low uppercase tracking-widest pl-1">Dia de Vencimento</label>
                                        <input
                                            type="number"
                                            min="1"
                                            max="31"
                                            value={formData.due_day}
                                            onChange={(e) => setFormData({ ...formData, due_day: parseInt(e.target.value) || 10 })}
                                            className="w-full bg-charcoal-bg border border-graphite-border rounded-xl px-4 py-3 text-sm text-crisp-white focus:ring-1 focus:ring-royal-purple outline-none transition-all"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-low uppercase tracking-widest pl-1">Dias antes do fechamento</label>
                                        <input
                                            type="number"
                                            min="1"
                                            max="30"
                                            value={formData.days_before_closing}
                                            onChange={(e) => setFormData({ ...formData, days_before_closing: parseInt(e.target.value) || 7 })}
                                            className="w-full bg-charcoal-bg border border-graphite-border rounded-xl px-4 py-3 text-sm text-crisp-white focus:ring-1 focus:ring-royal-purple outline-none transition-all"
                                        />
                                        <p className="text-[10px] text-slate-low pl-1">
                                            Fecha {formData.days_before_closing}d antes → dia {((formData.due_day - formData.days_before_closing - 1 + 31) % 31) + 1}
                                        </p>
                                    </div>
                                </>
                            )}
                        </div>
                        {createError && (
                            <p className="text-xs text-crimson-bright font-medium px-1">{createError}</p>
                        )}
                        <div className="flex justify-end gap-3">
                            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-slate-low hover:text-crisp-white transition-colors">
                                Cancelar
                            </button>
                            <button
                                type="submit"
                                disabled={submitting}
                                className="px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-sm font-semibold transition-all disabled:opacity-50"
                            >
                                {submitting ? 'Salvando...' : 'Criar Conta'}
                            </button>
                        </div>
                    </motion.form>
                )}
            </AnimatePresence>

            {createSuccess && (
                <div className="flex items-start gap-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl px-4 py-3 text-sm text-emerald-400">
                    <span className="material-symbols-outlined text-base mt-0.5">check_circle</span>
                    <span>{createSuccess}</span>
                </div>
            )}

            {/* Bank Accounts Section */}
            <div className="space-y-4">
                <h3 className="text-sm font-black text-slate-low uppercase tracking-widest flex items-center gap-2">
                    <span className="material-symbols-outlined text-sm">payments</span>
                    Contas e Investimentos
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {accounts.filter(a => a.type !== 'CREDIT').map((acc, i) => {
                        const typeInfo = ACCOUNT_TYPE_MAP[acc.type] || ACCOUNT_TYPE_MAP.CASH;
                        return (
                            <motion.div
                                key={acc.id}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: i * 0.05 }}
                                className="glass-panel rounded-2xl p-5 hover:border-royal-purple/40 transition-all group flex flex-col justify-between"
                            >
                                <div className="flex items-center justify-between mb-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-charcoal-bg/50 border border-graphite-border flex items-center justify-center text-xl group-hover:scale-110 transition-transform">
                                            {typeInfo.icon}
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-1.5">
                                                <p className="text-sm font-bold text-crisp-white">{acc.name}</p>
                                                {acc.is_default && (
                                                    <span className="text-[9px] font-black uppercase tracking-widest text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded-full">Padrão</span>
                                                )}
                                            </div>
                                            <p className="text-[10px] text-slate-low uppercase tracking-wider font-black">{typeInfo.label}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button
                                            onClick={() => handleSetDefault(acc)}
                                            disabled={settingDefault === acc.id}
                                            className={`p-1.5 rounded-lg transition-colors ${acc.is_default ? 'text-amber-400' : 'text-slate-low hover:text-amber-400 hover:bg-amber-400/10'}`}
                                            title={acc.is_default ? 'Conta padrão' : 'Definir como padrão'}
                                        >
                                            <span className="material-symbols-outlined text-[16px]">{acc.is_default ? 'star' : 'star'}</span>
                                        </button>
                                        <button
                                            onClick={() => openEdit(acc)}
                                            className="p-1.5 rounded-lg hover:bg-royal-purple/20 text-slate-low hover:text-royal-purple transition-colors"
                                            title="Editar conta"
                                        >
                                            <span className="material-symbols-outlined text-[16px]">edit</span>
                                        </button>
                                        <button
                                            onClick={() => setDeletingAccount(acc)}
                                            className="p-1.5 rounded-lg hover:bg-crimson-bright/20 text-slate-low hover:text-crimson-bright transition-colors"
                                            title="Excluir conta"
                                        >
                                            <span className="material-symbols-outlined text-[16px]">delete</span>
                                        </button>
                                    </div>
                                </div>
                                <div>
                                    <p className={`text-xl font-bold ${acc.current_balance >= 0 ? 'text-emerald-vibrant' : 'text-crimson-bright'}`}>
                                        {formatCurrency(acc.current_balance)}
                                    </p>
                                    <div className="mt-3 pt-3 border-t border-graphite-border/30 flex justify-between items-center">
                                        <span className="text-[9px] text-slate-low uppercase font-black tracking-widest">Saldo Disponível</span>
                                        <button
                                            onClick={() => openAdjust(acc)}
                                            className="flex items-center gap-1 text-[9px] text-slate-low hover:text-royal-purple transition-colors uppercase font-black tracking-widest"
                                            title="Ajustar saldo"
                                        >
                                            <span className="material-symbols-outlined text-[13px]">tune</span>
                                            Ajustar
                                        </button>
                                    </div>
                                </div>
                            </motion.div>
                        );
                    })}
                </div>
            </div>

            {/* Balance Adjust Modal */}
            <AnimatePresence>
                {adjustingAccount && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setAdjustingAccount(null)}
                            className="absolute inset-0 bg-charcoal-bg/95 backdrop-blur-xl"
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.9, y: 20 }}
                            className="relative w-full max-w-md bg-graphite-card rounded-3xl p-8 border border-graphite-border"
                        >
                            <div className="flex items-center gap-3 mb-6">
                                <div className="w-10 h-10 rounded-xl bg-royal-purple/10 border border-royal-purple/20 flex items-center justify-center">
                                    <span className="material-symbols-outlined text-royal-purple text-xl">tune</span>
                                </div>
                                <div>
                                    <p className="text-sm font-bold text-crisp-white">Ajustar Saldo</p>
                                    <p className="text-[10px] text-slate-low uppercase tracking-wider font-black">{adjustingAccount.name}</p>
                                </div>
                            </div>

                            <form onSubmit={handleAdjustSubmit} className="space-y-5">
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black text-slate-low uppercase tracking-widest">Saldo Atual</label>
                                    <p className={`text-lg font-bold ${adjustingAccount.current_balance >= 0 ? 'text-emerald-vibrant' : 'text-crimson-bright'}`}>
                                        {formatCurrency(adjustingAccount.current_balance)}
                                    </p>
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black text-slate-low uppercase tracking-widest">Novo Saldo (R$)</label>
                                    <input
                                        type="text"
                                        inputMode="decimal"
                                        placeholder="0,00"
                                        value={adjustForm.new_balance}
                                        onKeyDown={handleDecimalKeyDown}
                                        onChange={(e) => setAdjustForm({ ...adjustForm, new_balance: e.target.value })}
                                        className="w-full bg-charcoal-bg border border-graphite-border rounded-xl px-4 py-3 text-sm text-crisp-white focus:ring-1 focus:ring-royal-purple outline-none transition-all"
                                        required
                                    />
                                </div>

                                {parseDecimal(String(adjustForm.new_balance)) !== adjustingAccount.current_balance && (
                                    <div className={`text-sm font-semibold ${parseDecimal(String(adjustForm.new_balance)) > adjustingAccount.current_balance ? 'text-emerald-400' : 'text-crimson-bright'}`}>
                                        Diferença: {parseDecimal(String(adjustForm.new_balance)) > adjustingAccount.current_balance ? '+' : ''}{formatCurrency(parseDecimal(String(adjustForm.new_balance)) - adjustingAccount.current_balance)}
                                    </div>
                                )}

                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black text-slate-low uppercase tracking-widest">Motivo (opcional)</label>
                                    <input
                                        type="text"
                                        placeholder="Ex: Correção de saldo, taxa bancária..."
                                        value={adjustForm.description}
                                        onChange={(e) => setAdjustForm({ ...adjustForm, description: e.target.value })}
                                        className="w-full bg-charcoal-bg border border-graphite-border rounded-xl px-4 py-3 text-sm text-crisp-white focus:ring-1 focus:ring-royal-purple outline-none transition-all"
                                    />
                                </div>

                                {adjustError && (
                                    <p className="text-sm text-crimson-bright">{adjustError}</p>
                                )}

                                <div className="flex justify-end gap-3 pt-2">
                                    <button
                                        type="button"
                                        onClick={() => setAdjustingAccount(null)}
                                        className="px-4 py-2 text-sm text-slate-low hover:text-crisp-white transition-colors"
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={adjustSubmitting || parseDecimal(String(adjustForm.new_balance)) === adjustingAccount.current_balance}
                                        className="px-5 py-2 rounded-xl bg-royal-purple hover:bg-royal-purple/80 text-sm font-semibold transition-all disabled:opacity-50"
                                    >
                                        {adjustSubmitting ? 'Salvando...' : 'Confirmar Ajuste'}
                                    </button>
                                </div>
                            </form>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Edit Account Modal */}
            <AnimatePresence>
                {editingAccount && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setEditingAccount(null)}
                            className="absolute inset-0 bg-charcoal-bg/95 backdrop-blur-xl"
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.9, y: 20 }}
                            className="relative w-full max-w-md bg-graphite-card rounded-3xl p-8 border border-graphite-border"
                        >
                            <div className="flex items-center gap-3 mb-6">
                                <div className="w-10 h-10 rounded-xl bg-royal-purple/10 border border-royal-purple/20 flex items-center justify-center">
                                    <span className="material-symbols-outlined text-royal-purple text-xl">edit</span>
                                </div>
                                <div>
                                    <p className="text-sm font-bold text-crisp-white">Editar Conta</p>
                                    <p className="text-[10px] text-slate-low uppercase tracking-wider font-black">
                                        {ACCOUNT_TYPE_MAP[editingAccount.type]?.label}
                                    </p>
                                </div>
                            </div>

                            <form onSubmit={handleEditSubmit} className="space-y-5">
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black text-slate-low uppercase tracking-widest">
                                        {editingAccount.type === 'CREDIT' ? 'Nome do Cartão' : 'Nome da Conta'}
                                    </label>
                                    <input
                                        type="text"
                                        value={editForm.name}
                                        onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                                        className="w-full bg-charcoal-bg border border-graphite-border rounded-xl px-4 py-3 text-sm text-crisp-white focus:ring-1 focus:ring-royal-purple outline-none transition-all"
                                        required
                                    />
                                </div>

                                {editingAccount.type === 'CREDIT' && (
                                    <>
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-black text-slate-low uppercase tracking-widest">Limite do Cartão (R$)</label>
                                            <input
                                                type="text"
                                                inputMode="decimal"
                                                placeholder="0,00"
                                                value={editForm.credit_limit}
                                                onKeyDown={handleDecimalKeyDown}
                                                onChange={(e) => setEditForm({ ...editForm, credit_limit: e.target.value })}
                                                className="w-full bg-charcoal-bg border border-graphite-border rounded-xl px-4 py-3 text-sm text-crisp-white focus:ring-1 focus:ring-royal-purple outline-none transition-all"
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-black text-slate-low uppercase tracking-widest">Dia de Vencimento</label>
                                            <input
                                                type="number"
                                                min="1"
                                                max="31"
                                                value={editForm.due_day}
                                                onChange={(e) => setEditForm({ ...editForm, due_day: parseInt(e.target.value) || 10 })}
                                                className="w-full bg-charcoal-bg border border-graphite-border rounded-xl px-4 py-3 text-sm text-crisp-white focus:ring-1 focus:ring-royal-purple outline-none transition-all"
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-black text-slate-low uppercase tracking-widest">Dias antes do fechamento</label>
                                            <input
                                                type="number"
                                                min="1"
                                                max="30"
                                                value={editForm.days_before_closing}
                                                onChange={(e) => setEditForm({ ...editForm, days_before_closing: parseInt(e.target.value) || 7 })}
                                                className="w-full bg-charcoal-bg border border-graphite-border rounded-xl px-4 py-3 text-sm text-crisp-white focus:ring-1 focus:ring-royal-purple outline-none transition-all"
                                            />
                                            <p className="text-[10px] text-slate-low pl-1">
                                                Fecha {editForm.days_before_closing}d antes → dia {((editForm.due_day - editForm.days_before_closing - 1 + 31) % 31) + 1}
                                            </p>
                                        </div>
                                    </>
                                )}

                                {editError && (
                                    <p className="text-sm text-crimson-bright">{editError}</p>
                                )}

                                <div className="flex justify-end gap-3 pt-2">
                                    <button
                                        type="button"
                                        onClick={() => setEditingAccount(null)}
                                        className="px-4 py-2 text-sm text-slate-low hover:text-crisp-white transition-colors"
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={editSubmitting}
                                        className="px-5 py-2 rounded-xl bg-royal-purple hover:bg-royal-purple/80 text-sm font-semibold transition-all disabled:opacity-50"
                                    >
                                        {editSubmitting ? 'Salvando...' : 'Salvar Alterações'}
                                    </button>
                                </div>
                            </form>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Delete Confirmation Modal */}
            <AnimatePresence>
                {deletingAccount && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => !deleteSubmitting && setDeletingAccount(null)}
                            className="absolute inset-0 bg-charcoal-bg/95 backdrop-blur-xl"
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.9, y: 20 }}
                            className="relative w-full max-w-md bg-graphite-card rounded-3xl p-8 border border-graphite-border"
                        >
                            <div className="flex items-center gap-3 mb-6">
                                <div className="w-10 h-10 rounded-xl bg-crimson-bright/10 border border-crimson-bright/20 flex items-center justify-center">
                                    <span className="material-symbols-outlined text-crimson-bright text-xl">delete</span>
                                </div>
                                <div>
                                    <p className="text-sm font-bold text-crisp-white">Excluir Conta</p>
                                    <p className="text-[10px] text-slate-low uppercase tracking-wider font-black">{deletingAccount.name}</p>
                                </div>
                            </div>

                            <p className="text-sm text-slate-low mb-2">
                                Tem certeza que deseja excluir esta conta?
                            </p>
                            <p className="text-xs text-slate-low/70 mb-6">
                                Os lançamentos anteriores serão mantidos no histórico de transações. Não será mais possível registrar novas transações nesta conta.
                            </p>

                            <div className="flex justify-end gap-3">
                                <button
                                    type="button"
                                    onClick={() => setDeletingAccount(null)}
                                    disabled={deleteSubmitting}
                                    className="px-4 py-2 text-sm text-slate-low hover:text-crisp-white transition-colors disabled:opacity-50"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleDelete}
                                    disabled={deleteSubmitting}
                                    className="px-5 py-2 rounded-xl bg-crimson-bright hover:bg-red-500 text-sm font-semibold transition-all disabled:opacity-50"
                                >
                                    {deleteSubmitting ? 'Excluindo...' : 'Sim, excluir'}
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Credit Cards Section */}
            <div className="space-y-4 pt-4">
                <h3 className="text-sm font-black text-slate-low uppercase tracking-widest flex items-center gap-2">
                    <span className="material-symbols-outlined text-sm">credit_card</span>
                    Cartões de Crédito
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {accounts.filter(a => a.type === 'CREDIT').map((acc, i) => {
                        const limit = acc.credit_limit || 0;
                        const usedBala = Math.abs(acc.current_balance);
                        const available = limit - usedBala;
                        const usagePercent = limit > 0 ? (usedBala / limit) * 100 : 0;

                        return (
                            <motion.div
                                key={acc.id}
                                initial={{ opacity: 0, scale: 0.98 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ delay: i * 0.05 }}
                                className="glass-panel rounded-2xl p-6 bg-gradient-to-br from-graphite-card/80 to-charcoal-bg/80 border border-graphite-border hover:border-royal-purple/40 transition-all group"
                            >
                                <div className="flex justify-between items-start mb-6">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-royal-purple/10 border border-royal-purple/20 flex items-center justify-center">
                                            <span className="material-symbols-outlined text-royal-purple">credit_card</span>
                                        </div>
                                        <div>
                                            <p className="text-sm font-bold text-crisp-white">{acc.name}</p>
                                            <p className="text-[10px] text-slate-low font-black uppercase tracking-wider">Vence dia {acc.due_day}</p>
                                        </div>
                                    </div>
                                    <div className="flex flex-col items-end gap-2">
                                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button
                                                onClick={() => openEdit(acc)}
                                                className="p-1.5 rounded-lg hover:bg-royal-purple/20 text-slate-low hover:text-royal-purple transition-colors"
                                                title="Editar cartão"
                                            >
                                                <span className="material-symbols-outlined text-[16px]">edit</span>
                                            </button>
                                            <button
                                                onClick={() => setDeletingAccount(acc)}
                                                className="p-1.5 rounded-lg hover:bg-crimson-bright/20 text-slate-low hover:text-crimson-bright transition-colors"
                                                title="Excluir cartão"
                                            >
                                                <span className="material-symbols-outlined text-[16px]">delete</span>
                                            </button>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-[9px] text-slate-low font-black uppercase tracking-widest mb-1">Fatura Atual</p>
                                            <p className="text-lg font-bold text-crisp-white">{formatCurrency(usedBala)}</p>
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <div className="flex justify-between text-[10px] font-bold">
                                        <span className="text-slate-low uppercase tracking-wider">Limite Disponível</span>
                                        <span className="text-emerald-vibrant">{formatCurrency(available)}</span>
                                    </div>
                                    <div className="w-full h-1.5 bg-charcoal-bg rounded-full overflow-hidden border border-graphite-border">
                                        <motion.div
                                            initial={{ width: 0 }}
                                            animate={{ width: `${Math.min(usagePercent, 100)}%` }}
                                            className={`h-full rounded-full ${usagePercent > 90 ? 'bg-crimson-bright shadow-[0_0_8px_rgba(239,68,68,0.4)]' : 'bg-royal-purple shadow-[0_0_8px_rgba(139,92,246,0.4)]'}`}
                                        />
                                    </div>
                                    <div className="flex justify-between text-[9px] text-slate-low uppercase tracking-tighter">
                                        <span>Limite {formatCurrency(limit)}</span>
                                        <span>{usagePercent.toFixed(0)}% Utilizado</span>
                                    </div>
                                </div>
                            </motion.div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
