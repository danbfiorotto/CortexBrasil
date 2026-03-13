'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import DeleteAccountModal from '@/components/DeleteAccountModal';
import api from '@/lib/api';

type IncomeMode = 'auto' | 'manual';

export default function SettingsPage() {
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

    // Income profile state
    const [incomeMode, setIncomeMode] = useState<IncomeMode>('auto');
    const [manualIncome, setManualIncome] = useState('');
    const [loadingIncome, setLoadingIncome] = useState(false);
    const [loadingIncomeData, setLoadingIncomeData] = useState(true);
    const [incomeFeedback, setIncomeFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

    const fetchIncomeProfile = useCallback(async () => {
        setLoadingIncomeData(true);
        try {
            const res = await api.get('/api/dashboard/hud');
            setIncomeMode(res.data.income_mode || 'auto');
            const rawManual = res.data.manual_income || 0;
            if (rawManual > 0) {
                setManualIncome(String(Math.round(rawManual * 100)));
            }
        } catch {
            // ignore
        } finally {
            setLoadingIncomeData(false);
        }
    }, []);

    useEffect(() => {
        fetchIncomeProfile();
    }, [fetchIncomeProfile]);

    const formatCurrency = (digits: string) => {
        const amount = parseFloat(digits.replace(/\D/g, '')) / 100;
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(amount || 0);
    };

    const handleSaveIncome = async () => {
        setLoadingIncome(true);
        setIncomeFeedback(null);
        try {
            const numIncome = incomeMode === 'manual'
                ? parseFloat(manualIncome.replace(/\D/g, '')) / 100
                : 0;
            await api.post('/api/dashboard/profile', {
                income_mode: incomeMode,
                monthly_income: numIncome,
            });
            setIncomeFeedback({ type: 'success', message: 'Configuração de renda salva.' });
            setTimeout(() => setIncomeFeedback(null), 3000);
        } catch {
            setIncomeFeedback({ type: 'error', message: 'Erro ao salvar. Tente novamente.' });
        } finally {
            setLoadingIncome(false);
        }
    };

    // Category management state
    const [categories, setCategories] = useState<string[]>([]);
    const [loadingCategories, setLoadingCategories] = useState(false);
    const [showCategoryPanel, setShowCategoryPanel] = useState(false);
    const [editingCategory, setEditingCategory] = useState<string | null>(null);
    const [editValue, setEditValue] = useState('');
    const [saving, setSaving] = useState(false);
    const [deletingCategory, setDeletingCategory] = useState<string | null>(null);
    const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
    const [newCategoryName, setNewCategoryName] = useState('');
    const [creatingCategory, setCreatingCategory] = useState(false);

    const fetchCategories = useCallback(async () => {
        setLoadingCategories(true);
        try {
            const res = await api.get('/api/settings/categories');
            setCategories(res.data.categories || []);
        } catch {
            setCategories([]);
        } finally {
            setLoadingCategories(false);
        }
    }, []);

    useEffect(() => {
        if (showCategoryPanel) fetchCategories();
    }, [showCategoryPanel, fetchCategories]);

    const showFeedback = (type: 'success' | 'error', message: string) => {
        setFeedback({ type, message });
        setTimeout(() => setFeedback(null), 3000);
    };

    const handleRename = async (oldName: string) => {
        const newName = editValue.trim();
        if (!newName || newName === oldName) {
            setEditingCategory(null);
            return;
        }
        setSaving(true);
        try {
            const res = await api.put('/api/settings/categories', { old_name: oldName, new_name: newName });
            showFeedback('success', `Categoria renomeada. ${res.data.transactions_updated} transaç${res.data.transactions_updated === 1 ? 'ão atualizada' : 'ões atualizadas'}.`);
            setEditingCategory(null);
            fetchCategories();
        } catch (err: any) {
            showFeedback('error', err.response?.data?.detail || 'Erro ao renomear categoria.');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (name: string) => {
        setDeletingCategory(name);
        try {
            const res = await api.delete('/api/settings/categories', { data: { name } });
            showFeedback('success', `Categoria removida. ${res.data.transactions_updated} transaç${res.data.transactions_updated === 1 ? 'ão movida' : 'ões movidas'} para "Outros".`);
            fetchCategories();
        } catch (err: any) {
            showFeedback('error', err.response?.data?.detail || 'Erro ao remover categoria.');
        } finally {
            setDeletingCategory(null);
        }
    };

    const handleCreate = async () => {
        const name = newCategoryName.trim();
        if (!name) return;
        setCreatingCategory(true);
        try {
            await api.post('/api/settings/categories', { name });
            showFeedback('success', `Categoria "${name}" criada.`);
            setNewCategoryName('');
            fetchCategories();
        } catch (err: any) {
            showFeedback('error', err.response?.data?.detail || 'Erro ao criar categoria.');
        } finally {
            setCreatingCategory(false);
        }
    };

    const CATEGORY_ICONS: Record<string, string> = {
        'Alimentação': 'restaurant',
        'Transporte': 'commute',
        'Moradia': 'home',
        'Lazer': 'sports_esports',
        'Saúde': 'health_and_safety',
        'Educação': 'school',
        'Compras': 'shopping_bag',
        'Serviços': 'build',
        'Investimento': 'trending_up',
        'Renda': 'arrow_downward',
        'Salário': 'payments',
        'Outros': 'category',
    };

    return (
        <div className="p-8 max-w-4xl mx-auto space-y-12">
            <header className="space-y-2">
                <h1 className="text-3xl font-bold tracking-tight text-crisp-white">Configurações</h1>
                <p className="text-slate-low">Gerencie sua conta e preferências do sistema.</p>
            </header>

            <div className="grid gap-8">
                {/* Income Profile Section */}
                <section className="space-y-4">
                    <div className="flex items-center gap-2 text-royal-purple">
                        <span className="material-symbols-outlined">payments</span>
                        <h2 className="text-sm font-bold uppercase tracking-widest">Perfil de Renda</h2>
                    </div>

                    <div className="bg-graphite-card border border-graphite-border rounded-2xl p-6 space-y-5">
                        {loadingIncomeData ? (
                            <div className="flex items-center justify-center py-6">
                                <div className="size-6 border-2 border-royal-purple/30 border-t-royal-purple rounded-full animate-spin" />
                            </div>
                        ) : (
                            <>
                                <p className="text-xs text-slate-low leading-relaxed">
                                    Defina como o Cortex deve calcular sua renda esperada para os indicadores do painel.
                                </p>

                                {/* Mode selector */}
                                <div className="grid grid-cols-2 gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setIncomeMode('auto')}
                                        className={`flex flex-col items-start gap-2 p-4 rounded-xl border transition-all text-left ${
                                            incomeMode === 'auto'
                                                ? 'border-royal-purple bg-royal-purple/10 text-crisp-white'
                                                : 'border-graphite-border bg-charcoal-bg text-slate-low hover:border-royal-purple/50'
                                        }`}
                                    >
                                        <span className="material-symbols-outlined text-[24px]">auto_awesome</span>
                                        <div>
                                            <p className="text-xs font-bold uppercase tracking-wider">Automático</p>
                                            <p className="text-[10px] mt-0.5 leading-tight opacity-70">Média dos últimos 3 meses de receita registrada</p>
                                        </div>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => setIncomeMode('manual')}
                                        className={`flex flex-col items-start gap-2 p-4 rounded-xl border transition-all text-left ${
                                            incomeMode === 'manual'
                                                ? 'border-royal-purple bg-royal-purple/10 text-crisp-white'
                                                : 'border-graphite-border bg-charcoal-bg text-slate-low hover:border-royal-purple/50'
                                        }`}
                                    >
                                        <span className="material-symbols-outlined text-[24px]">edit</span>
                                        <div>
                                            <p className="text-xs font-bold uppercase tracking-wider">Manual</p>
                                            <p className="text-[10px] mt-0.5 leading-tight opacity-70">Defino um valor fixo mensal</p>
                                        </div>
                                    </button>
                                </div>

                                <AnimatePresence>
                                    {incomeMode === 'auto' && (
                                        <motion.div
                                            initial={{ opacity: 0, height: 0 }}
                                            animate={{ opacity: 1, height: 'auto' }}
                                            exit={{ opacity: 0, height: 0 }}
                                            className="bg-emerald-vibrant/5 border border-emerald-vibrant/20 rounded-xl px-4 py-3"
                                        >
                                            <p className="text-xs text-emerald-vibrant">
                                                Ideal para renda variável, freelancer ou múltiplas fontes. O Cortex usa automaticamente a média das suas receitas dos últimos 3 meses.
                                            </p>
                                        </motion.div>
                                    )}

                                    {incomeMode === 'manual' && (
                                        <motion.div
                                            initial={{ opacity: 0, height: 0 }}
                                            animate={{ opacity: 1, height: 'auto' }}
                                            exit={{ opacity: 0, height: 0 }}
                                            className="space-y-1"
                                        >
                                            <label className="text-[10px] font-bold text-slate-low uppercase tracking-widest pl-1">
                                                Renda Mensal Estimada
                                            </label>
                                            <input
                                                type="text"
                                                value={formatCurrency(manualIncome)}
                                                onChange={(e) => setManualIncome(e.target.value)}
                                                placeholder="R$ 0,00"
                                                className="w-full bg-charcoal-bg border border-graphite-border rounded-xl px-4 py-3 text-lg font-bold text-crisp-white focus:border-royal-purple outline-none transition-colors placeholder:text-slate-low/30"
                                            />
                                        </motion.div>
                                    )}
                                </AnimatePresence>

                                {/* Feedback */}
                                <AnimatePresence>
                                    {incomeFeedback && (
                                        <motion.div
                                            initial={{ opacity: 0, y: -6 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, y: -6 }}
                                            className={`px-4 py-3 rounded-xl text-sm font-medium ${
                                                incomeFeedback.type === 'success'
                                                    ? 'bg-emerald-vibrant/10 text-emerald-vibrant border border-emerald-vibrant/20'
                                                    : 'bg-crimson-bright/10 text-crimson-bright border border-crimson-bright/20'
                                            }`}
                                        >
                                            {incomeFeedback.message}
                                        </motion.div>
                                    )}
                                </AnimatePresence>

                                <button
                                    onClick={handleSaveIncome}
                                    disabled={loadingIncome || (incomeMode === 'manual' && !manualIncome)}
                                    className="px-5 py-2.5 rounded-lg bg-royal-purple text-white text-xs font-bold uppercase tracking-wider hover:bg-royal-purple/80 transition-all disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-2"
                                >
                                    {loadingIncome ? (
                                        <div className="size-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                    ) : (
                                        <>
                                            <span className="material-symbols-outlined text-[16px]">save</span>
                                            Salvar
                                        </>
                                    )}
                                </button>
                            </>
                        )}
                    </div>
                </section>

                {/* Categories Section */}
                <section className="space-y-4">
                    <div className="flex items-center gap-2 text-royal-purple">
                        <span className="material-symbols-outlined">category</span>
                        <h2 className="text-sm font-bold uppercase tracking-widest">Categorias</h2>
                    </div>

                    <div className="bg-graphite-card border border-graphite-border rounded-2xl overflow-hidden">
                        <div className="p-6 flex items-center justify-between hover:bg-white/5 transition-colors group">
                            <div className="flex items-center gap-4">
                                <div className="size-10 bg-royal-purple/10 rounded-xl flex items-center justify-center border border-royal-purple/20">
                                    <span className="material-symbols-outlined text-royal-purple">edit_note</span>
                                </div>
                                <div>
                                    <h3 className="font-bold text-crisp-white">Criar e Editar Categorias</h3>
                                    <p className="text-xs text-slate-low">Renomeie ou remova categorias. Alterações refletem em todas as transações.</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setShowCategoryPanel(!showCategoryPanel)}
                                className="px-4 py-2 rounded-lg bg-royal-purple/10 text-royal-purple text-xs font-bold uppercase tracking-wider hover:bg-royal-purple hover:text-white transition-all"
                            >
                                {showCategoryPanel ? 'Fechar' : 'Gerenciar'}
                            </button>
                        </div>

                        <AnimatePresence>
                            {showCategoryPanel && (
                                <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    transition={{ duration: 0.3 }}
                                    className="overflow-hidden"
                                >
                                    <div className="border-t border-graphite-border p-6 space-y-4">
                                        {/* Feedback */}
                                        <AnimatePresence>
                                            {feedback && (
                                                <motion.div
                                                    initial={{ opacity: 0, y: -10 }}
                                                    animate={{ opacity: 1, y: 0 }}
                                                    exit={{ opacity: 0, y: -10 }}
                                                    className={`px-4 py-3 rounded-xl text-sm font-medium ${
                                                        feedback.type === 'success'
                                                            ? 'bg-emerald-vibrant/10 text-emerald-vibrant border border-emerald-vibrant/20'
                                                            : 'bg-crimson-bright/10 text-crimson-bright border border-crimson-bright/20'
                                                    }`}
                                                >
                                                    {feedback.message}
                                                </motion.div>
                                            )}
                                        </AnimatePresence>

                                        {/* Create new category */}
                                        <div className="flex items-center gap-3 bg-graphite-deep rounded-xl border border-graphite-border p-2 pl-4">
                                            <span className="material-symbols-outlined text-royal-purple text-[20px]">add_circle</span>
                                            <input
                                                value={newCategoryName}
                                                onChange={(e) => setNewCategoryName(e.target.value)}
                                                onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
                                                placeholder="Criar nova categoria..."
                                                className="flex-1 bg-transparent text-crisp-white text-sm font-medium placeholder:text-slate-low outline-none"
                                                disabled={creatingCategory}
                                            />
                                            <button
                                                onClick={handleCreate}
                                                disabled={creatingCategory || !newCategoryName.trim()}
                                                className="px-5 py-2 rounded-lg bg-royal-purple text-white text-xs font-bold uppercase tracking-wider hover:bg-royal-purple/80 transition-all disabled:opacity-20 disabled:cursor-not-allowed shrink-0"
                                            >
                                                {creatingCategory ? 'Criando...' : 'Criar'}
                                            </button>
                                        </div>

                                        {loadingCategories ? (
                                            <div className="flex items-center justify-center py-8">
                                                <div className="size-6 border-2 border-royal-purple/30 border-t-royal-purple rounded-full animate-spin" />
                                            </div>
                                        ) : categories.length === 0 ? (
                                            <p className="text-slate-low text-sm text-center py-8">
                                                Nenhuma categoria encontrada. As categorias aparecem aqui quando você registra transações.
                                            </p>
                                        ) : (
                                            <div className="space-y-2">
                                                {categories.map((cat) => (
                                                    <div
                                                        key={cat}
                                                        className="flex items-center justify-between px-4 py-3 bg-graphite-deep/50 rounded-xl border border-graphite-border/50 group/item hover:border-graphite-border transition-colors"
                                                    >
                                                        <div className="flex items-center gap-3 flex-1 min-w-0">
                                                            <span className="material-symbols-outlined text-slate-low text-[20px]">
                                                                {CATEGORY_ICONS[cat] || 'label'}
                                                            </span>

                                                            {editingCategory === cat ? (
                                                                <input
                                                                    autoFocus
                                                                    value={editValue}
                                                                    onChange={(e) => setEditValue(e.target.value)}
                                                                    onKeyDown={(e) => {
                                                                        if (e.key === 'Enter') handleRename(cat);
                                                                        if (e.key === 'Escape') setEditingCategory(null);
                                                                    }}
                                                                    className="bg-transparent border-b border-royal-purple text-crisp-white text-sm font-medium outline-none flex-1 py-0.5"
                                                                    disabled={saving}
                                                                />
                                                            ) : (
                                                                <span className="text-crisp-white text-sm font-medium truncate">
                                                                    {cat}
                                                                </span>
                                                            )}
                                                        </div>

                                                        <div className="flex items-center gap-1 opacity-0 group-hover/item:opacity-100 transition-opacity">
                                                            {editingCategory === cat ? (
                                                                <>
                                                                    <button
                                                                        onClick={() => handleRename(cat)}
                                                                        disabled={saving}
                                                                        className="p-1.5 rounded-lg hover:bg-emerald-vibrant/10 text-emerald-vibrant transition-colors"
                                                                        title="Salvar"
                                                                    >
                                                                        <span className="material-symbols-outlined text-[18px]">check</span>
                                                                    </button>
                                                                    <button
                                                                        onClick={() => setEditingCategory(null)}
                                                                        className="p-1.5 rounded-lg hover:bg-white/10 text-slate-low transition-colors"
                                                                        title="Cancelar"
                                                                    >
                                                                        <span className="material-symbols-outlined text-[18px]">close</span>
                                                                    </button>
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <button
                                                                        onClick={() => {
                                                                            setEditingCategory(cat);
                                                                            setEditValue(cat);
                                                                        }}
                                                                        className="p-1.5 rounded-lg hover:bg-royal-purple/10 text-slate-low hover:text-royal-purple transition-colors"
                                                                        title="Renomear"
                                                                    >
                                                                        <span className="material-symbols-outlined text-[18px]">edit</span>
                                                                    </button>
                                                                    {cat !== 'Outros' && (
                                                                        <button
                                                                            onClick={() => {
                                                                                if (confirm(`Remover a categoria "${cat}"? Todas as transações serão movidas para "Outros".`)) {
                                                                                    handleDelete(cat);
                                                                                }
                                                                            }}
                                                                            disabled={deletingCategory === cat}
                                                                            className="p-1.5 rounded-lg hover:bg-crimson-bright/10 text-slate-low hover:text-crimson-bright transition-colors"
                                                                            title="Remover"
                                                                        >
                                                                            <span className="material-symbols-outlined text-[18px]">
                                                                                {deletingCategory === cat ? 'hourglass_empty' : 'delete'}
                                                                            </span>
                                                                        </button>
                                                                    )}
                                                                </>
                                                            )}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </section>

                {/* Security Section */}
                <section className="space-y-4">
                    <div className="flex items-center gap-2 text-royal-purple">
                        <span className="material-symbols-outlined">security</span>
                        <h2 className="text-sm font-bold uppercase tracking-widest">Segurança e Dados</h2>
                    </div>

                    <div className="bg-graphite-card border border-graphite-border rounded-2xl overflow-hidden">
                        {/* Reset Profile Option */}
                        <div className="p-6 flex items-center justify-between hover:bg-white/5 transition-colors group">
                            <div className="flex items-center gap-4">
                                <div className="size-10 bg-crimson-bright/10 rounded-xl flex items-center justify-center border border-crimson-bright/20">
                                    <span className="material-symbols-outlined text-crimson-bright">person_remove</span>
                                </div>
                                <div>
                                    <h3 className="font-bold text-crisp-white">Zerar Perfil</h3>
                                    <p className="text-xs text-slate-low">Apagar permanentemente todos os seus dados salvos.</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setIsDeleteModalOpen(true)}
                                className="px-4 py-2 rounded-lg bg-crimson-bright/10 text-crimson-bright text-xs font-bold uppercase tracking-wider hover:bg-crimson-bright hover:text-white transition-all"
                            >
                                Iniciar Processo
                            </button>
                        </div>
                    </div>
                </section>

                {/* About Section */}
                <section className="space-y-4">
                    <div className="flex items-center gap-2 text-slate-low">
                        <span className="material-symbols-outlined">info</span>
                        <h2 className="text-sm font-bold uppercase tracking-widest">Sobre o Cortex</h2>
                    </div>
                    <div className="bg-graphite-card border border-graphite-border rounded-2xl p-6">
                        <div className="flex flex-col gap-2">
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-slate-low">Versão do Sistema</span>
                                <span className="text-crisp-white font-mono">v0.1.0-alpha</span>
                            </div>
                            <div className="h-[1px] bg-graphite-border my-2" />
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-slate-low">Ambiente</span>
                                <span className="text-royal-purple font-bold uppercase tracking-tighter">Premium</span>
                            </div>
                        </div>
                    </div>
                </section>
            </div>

            <DeleteAccountModal
                isOpen={isDeleteModalOpen}
                onClose={() => setIsDeleteModalOpen(false)}
            />
        </div>
    );
}
