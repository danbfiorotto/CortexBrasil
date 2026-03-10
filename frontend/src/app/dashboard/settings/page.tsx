'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import DeleteAccountModal from '@/components/DeleteAccountModal';
import api from '@/lib/api';

export default function SettingsPage() {
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

    // Category management state
    const [categories, setCategories] = useState<string[]>([]);
    const [loadingCategories, setLoadingCategories] = useState(false);
    const [showCategoryPanel, setShowCategoryPanel] = useState(false);
    const [editingCategory, setEditingCategory] = useState<string | null>(null);
    const [editValue, setEditValue] = useState('');
    const [saving, setSaving] = useState(false);
    const [deletingCategory, setDeletingCategory] = useState<string | null>(null);
    const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

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
