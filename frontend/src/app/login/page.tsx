'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import Cookies from 'js-cookie';
import { motion, AnimatePresence } from 'framer-motion';

export default function LoginPage() {
    const router = useRouter();
    const [step, setStep] = useState<'phone' | 'otp'>('phone');
    const [phone, setPhone] = useState('');
    const [otp, setOtp] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [instruction, setInstruction] = useState('');

    const handleRequestOtp = async () => {
        setLoading(true);
        setError('');
        try {
            const formattedPhone = phone.replace(/\D/g, '');
            const response = await api.post('/auth/request-otp', { phone_number: formattedPhone });
            setInstruction(response.data.instruction || 'Código enviado!');
            setStep('otp');
        } catch (err: any) {
            setError('Erro ao enviar código. Verifique o número.');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleVerifyOtp = async () => {
        setLoading(true);
        setError('');
        try {
            const formattedPhone = phone.replace(/\D/g, '');
            const response = await api.post('/auth/verify-otp', {
                phone_number: formattedPhone,
                code: otp
            });

            const { access_token } = response.data;
            if (access_token) {
                Cookies.set('token', access_token, { expires: 7 });
                router.push('/dashboard');
            } else {
                setError('Token não recebido.');
            }
        } catch (err: any) {
            if (err.response && (err.response.status === 400 || err.response.status === 401)) {
                setError('Código inválido ou expirado. Verifique o SMS.');
            } else {
                setError('Erro no servidor. Tente novamente.');
            }
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex w-full bg-charcoal-bg text-crisp-white overflow-hidden">
            {/* Left Side - Brand / Visuals */}
            <div className="hidden lg:flex w-1/2 relative items-center justify-center p-12 overflow-hidden bg-carbon-950">
                {/* Abstract Background Effects */}
                <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-royal-purple/20 via-carbon-950 to-carbon-950" />
                <div className="absolute bottom-0 right-0 w-full h-full bg-[radial-gradient(ellipse_at_bottom_left,_var(--tw-gradient-stops))] from-emerald-vibrant/10 via-carbon-950 to-carbon-950" />

                {/* Grid Pattern Overlay */}
                <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 brightness-100 contrast-150 mix-blend-overlay"></div>

                <div className="relative z-10 max-w-lg">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.8, ease: "easeOut" }}
                    >
                        <div className="flex items-center gap-4 mb-8">
                            <div className="p-4 bg-royal-purple/10 rounded-2xl border border-royal-purple/30 backdrop-blur-md shadow-[0_0_30px_rgba(139,92,246,0.15)]">
                                <span className="material-symbols-outlined text-4xl text-royal-purple">auto_awesome</span>
                            </div>
                        </div>
                        <h1 className="text-5xl font-bold mb-6 tracking-tight leading-[1.1] text-crisp-white">
                            Domine suas finanças com <span className="text-transparent bg-clip-text bg-gradient-to-r from-royal-purple to-emerald-vibrant">Inteligência</span>.
                        </h1>
                        <p className="text-lg text-slate-low leading-relaxed max-w-md">
                            O Cortex Brasil usa IA avançada para analisar, categorizar e otimizar seu patrimônio em tempo real. Sem planilhas, sem esforço.
                        </p>

                        <div className="mt-12 flex gap-5 items-center">
                            <div className="flex -space-x-4">
                                {[1, 2, 3].map(i => (
                                    <div key={i} className="w-10 h-10 rounded-full border-2 border-carbon-950 bg-graphite-600 flex items-center justify-center text-[10px] font-bold text-slate-low">
                                        U{i}
                                    </div>
                                ))}
                            </div>
                            <div className="flex flex-col">
                                <span className="text-sm font-bold text-crisp-white">Junte-se a 1.000+ usuários</span>
                                <span className="text-xs text-slate-low">que controlam o futuro.</span>
                            </div>
                        </div>
                    </motion.div>
                </div>
            </div>

            {/* Right Side - Form */}
            <div className="w-full lg:w-1/2 flex items-center justify-center p-8 bg-charcoal-bg relative">
                <div className="absolute top-0 right-0 p-8">
                    <div className="flex items-center gap-2 text-royal-purple">
                        <span className="material-symbols-outlined text-2xl">all_inclusive</span>
                        <span className="text-sm font-bold tracking-widest uppercase">Cortex</span>
                    </div>
                </div>

                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.5, delay: 0.2 }}
                    className="w-full max-w-sm"
                >
                    <div className="mb-8">
                        <h2 className="text-3xl font-bold text-crisp-white mb-2">Bem-vindo de volta</h2>
                        <p className="text-slate-low text-sm">Acesse seu dashboard financeiro premium.</p>
                    </div>

                    <AnimatePresence mode="wait">
                        {error && (
                            <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                className="mb-6 p-4 rounded-lg bg-crimson-bright/10 border border-crimson-bright/30 flex items-start gap-3"
                            >
                                <span className="material-symbols-outlined text-crimson-bright text-xl">gpp_maybe</span>
                                <p className="text-xs font-medium text-crimson-bright mt-0.5">{error}</p>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    <div className="bg-graphite-card border border-graphite-border rounded-xl p-8 shadow-2xl relative overflow-hidden">
                        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-royal-purple via-emerald-vibrant to-royal-purple" />

                        {step === 'phone' ? (
                            <motion.div
                                key="step-phone"
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                className="space-y-6"
                            >
                                <div>
                                    <label className="block text-xs font-bold text-slate-low uppercase tracking-widest mb-2">WhatsApp</label>
                                    <div className="relative">
                                        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-low">smartphone</span>
                                        <input
                                            type="tel"
                                            placeholder="5511999999999"
                                            value={phone}
                                            onChange={(e) => setPhone(e.target.value)}
                                            className="w-full bg-charcoal-bg border border-graphite-border rounded-lg pl-10 pr-4 py-3 text-sm text-crisp-white placeholder:text-slate-low/50 focus:ring-1 focus:ring-royal-purple focus:border-royal-purple outline-none transition-colors"
                                        />
                                    </div>
                                    <p className="text-[10px] text-slate-low mt-2">Digite seu número completo com DDD (apenas números).</p>
                                </div>
                                <button
                                    onClick={handleRequestOtp}
                                    disabled={loading || !phone}
                                    className="w-full bg-royal-purple hover:bg-royal-purple/90 text-crisp-white font-bold py-3.5 rounded-lg transition-all shadow-lg shadow-royal-purple/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 group"
                                >
                                    {loading ? (
                                        <span className="material-symbols-outlined animate-spin text-xl">progress_activity</span>
                                    ) : (
                                        <>
                                            Receber Código
                                            <span className="material-symbols-outlined text-sm group-hover:translate-x-1 transition-transform">arrow_forward</span>
                                        </>
                                    )}
                                </button>
                            </motion.div>
                        ) : (
                            <motion.div
                                key="step-otp"
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                className="space-y-6"
                            >
                                <div className="bg-royal-purple/10 p-3 rounded-lg border border-royal-purple/20 text-center">
                                    <p className="text-xs text-royal-purple font-medium">{instruction}</p>
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-slate-low uppercase tracking-widest mb-2">Código de 6 dígitos</label>
                                    <div className="relative">
                                        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-low">lock</span>
                                        <input
                                            type="text"
                                            placeholder="000000"
                                            value={otp}
                                            onChange={(e) => setOtp(e.target.value)}
                                            maxLength={6}
                                            className="w-full bg-charcoal-bg border border-graphite-border rounded-lg pl-10 pr-4 py-3 text-center text-xl tracking-[0.5em] font-mono text-crisp-white placeholder:text-slate-low/30 focus:ring-1 focus:ring-emerald-vibrant focus:border-emerald-vibrant outline-none transition-colors"
                                        />
                                    </div>
                                </div>

                                <button
                                    onClick={handleVerifyOtp}
                                    disabled={loading || otp.length !== 6}
                                    className="w-full bg-emerald-vibrant hover:bg-emerald-600 text-charcoal-bg font-bold py-3.5 rounded-lg transition-all shadow-lg shadow-emerald-vibrant/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                >
                                    {loading ? (
                                        <span className="material-symbols-outlined animate-spin text-xl">progress_activity</span>
                                    ) : (
                                        <>
                                            Entrar no Dashboard
                                            <span className="material-symbols-outlined text-sm">login</span>
                                        </>
                                    )}
                                </button>

                                <button
                                    onClick={() => setStep('phone')}
                                    className="w-full text-xs font-bold text-slate-low hover:text-royal-purple mt-4 flex items-center justify-center gap-1 transition-colors"
                                >
                                    <span className="material-symbols-outlined text-sm">arrow_back</span>
                                    Corrigir número
                                </button>
                            </motion.div>
                        )}
                    </div>

                    <div className="mt-8 text-center flex items-center justify-center gap-2 text-slate-low/60">
                        <span className="material-symbols-outlined text-sm">lock</span>
                        <p className="text-[10px] font-medium uppercase tracking-wider">Criptografia de ponta a ponta</p>
                    </div>
                </motion.div>
            </div>
        </div>
    );
}
