'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import api from '@/lib/api';
import { useRouter } from 'next/navigation';
import Cookies from 'js-cookie';

interface DeleteAccountModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function DeleteAccountModal({ isOpen, onClose }: DeleteAccountModalProps) {
    const [step, setStep] = useState(1);
    const [otp, setOtp] = useState('');
    const [phrase, setPhrase] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const router = useRouter();

    const handleSendCode = async () => {
        setLoading(true);
        setError('');
        try {
            await api.post('/api/settings/delete-request');
            setStep(2);
        } catch (err: any) {
            setError(err.response?.data?.detail || 'Erro ao enviar código.');
        } finally {
            setLoading(false);
        }
    };

    const handleConfirmDeletion = async () => {
        if (phrase.toLowerCase().trim() !== 'tenho certeza') {
            setError('A frase de confirmação deve ser exatamente "tenho certeza".');
            return;
        }

        // Final browser confirmation
        if (!confirm('VOCÊ TEM CERTEZA ABSOLUTA?\n\nEsta ação deletará permanentemente todas as suas transações, orçamentos, metas e perfil. Não há volta.')) {
            return;
        }

        setLoading(true);
        setError('');
        try {
            await api.post('/api/settings/delete-confirm', {
                otp,
                phrase: phrase.toLowerCase().trim()
            });

            // Logout and redirect
            Cookies.remove('token');
            router.push('/login');
        } catch (err: any) {
            setError(err.response?.data?.detail || 'Erro ao deletar conta.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="absolute inset-0 bg-charcoal-bg/95 backdrop-blur-xl"
                    />

                    <motion.div
                        initial={{ opacity: 0, scale: 0.9, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9, y: 20 }}
                        className="relative w-full max-w-lg bg-graphite-card border border-crimson-bright/30 rounded-3xl p-8 shadow-2xl"
                    >
                        <div className="flex flex-col items-center text-center gap-6">
                            <div className="size-16 bg-crimson-bright/10 rounded-2xl flex items-center justify-center border border-crimson-bright/20">
                                <span className="material-symbols-outlined text-crimson-bright text-4xl subtle-glow-crimson">
                                    skull
                                </span>
                            </div>

                            <div className="space-y-2">
                                <h2 className="text-2xl font-bold tracking-tight text-crisp-white">Zerar Perfil</h2>
                                <p className="text-sm text-slate-low leading-relaxed">
                                    Esta ação é permanente e irreversível. Todos os seus dados financeiros serão apagados.
                                </p>
                            </div>

                            <div className="w-full space-y-6">
                                {/* Step Indicators */}
                                <div className="flex justify-center gap-2">
                                    {[1, 2, 3].map((s) => (
                                        <div
                                            key={s}
                                            className={`h-1 w-12 rounded-full transition-colors ${step >= s ? 'bg-crimson-bright' : 'bg-graphite-border'
                                                }`}
                                        />
                                    ))}
                                </div>

                                {step === 1 && (
                                    <div className="space-y-6">
                                        <div className="p-4 bg-crimson-bright/5 border border-crimson-bright/10 rounded-xl text-xs text-crimson-bright text-left italic">
                                            Aviso: Para sua segurança, enviaremos um código via WhatsApp para confirmar que você é realmente o dono desta conta.
                                        </div>
                                        <button
                                            onClick={handleSendCode}
                                            disabled={loading}
                                            className="w-full bg-crimson-bright hover:bg-crimson-bright/90 disabled:opacity-50 text-white font-bold py-4 rounded-xl shadow-lg shadow-crimson-bright/20 transition-all flex items-center justify-center gap-2"
                                        >
                                            {loading ? 'Enviando...' : 'Solicitar Código via WhatsApp'}
                                            {!loading && <span className="material-symbols-outlined text-[18px]">send</span>}
                                        </button>
                                    </div>
                                )}

                                {step === 2 && (
                                    <div className="space-y-4 text-left">
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-bold text-slate-low uppercase tracking-widest pl-1">
                                                Código de 6 dígitos
                                            </label>
                                            <input
                                                type="text"
                                                maxLength={6}
                                                value={otp}
                                                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                                                placeholder="000000"
                                                className="w-full bg-charcoal-bg border border-graphite-border rounded-xl px-4 py-4 text-2xl font-mono tracking-[0.5em] text-center text-crisp-white focus:border-crimson-bright outline-none transition-colors"
                                            />
                                        </div>
                                        <button
                                            onClick={() => setStep(3)}
                                            disabled={otp.length !== 6}
                                            className="w-full bg-graphite-border/50 hover:bg-graphite-border text-white font-bold py-4 rounded-xl transition-all"
                                        >
                                            Próximo Passo
                                        </button>
                                    </div>
                                )}

                                {step === 3 && (
                                    <div className="space-y-4 text-left">
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-bold text-slate-low uppercase tracking-widest pl-1">
                                                Para confirmar, digite: <span className="text-crimson-bright font-black">tenho certeza</span>
                                            </label>
                                            <input
                                                type="text"
                                                value={phrase}
                                                onChange={(e) => setPhrase(e.target.value)}
                                                placeholder="tenho certeza"
                                                className="w-full bg-charcoal-bg border border-graphite-border rounded-xl px-4 py-4 text-lg font-bold text-crisp-white focus:border-crimson-bright outline-none transition-colors"
                                            />
                                        </div>
                                        <button
                                            onClick={handleConfirmDeletion}
                                            disabled={loading || phrase.toLowerCase() !== 'tenho certeza'}
                                            className="w-full bg-crimson-bright hover:bg-crimson-bright/90 disabled:opacity-30 text-white font-black py-4 rounded-xl shadow-lg shadow-crimson-bright/40 transition-all flex items-center justify-center gap-2 uppercase tracking-widest"
                                        >
                                            {loading ? 'DELETANDO...' : 'DELETAR TUDO PERMANENTEMENTE'}
                                        </button>
                                    </div>
                                )}

                                {error && (
                                    <p className="text-xs text-crimson-bright font-medium">{error}</p>
                                )}
                            </div>

                            <button
                                onClick={onClose}
                                className="text-sm font-medium text-slate-low hover:text-crisp-white transition-colors"
                            >
                                Cancelar e Voltar
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}
