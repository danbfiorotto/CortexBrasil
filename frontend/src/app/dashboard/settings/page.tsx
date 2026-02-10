'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import DeleteAccountModal from '@/components/DeleteAccountModal';

export default function SettingsPage() {
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

    return (
        <div className="p-8 max-w-4xl mx-auto space-y-12">
            <header className="space-y-2">
                <h1 className="text-3xl font-bold tracking-tight text-crisp-white">Configurações</h1>
                <p className="text-slate-low">Gerencie sua conta e preferências do sistema.</p>
            </header>

            <div className="grid gap-8">
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
