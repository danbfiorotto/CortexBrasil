'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';

export default function RegisterPage() {
    const router = useRouter();
    const [step, setStep] = useState<'form' | 'success'>('form');
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [whatsappLink, setWhatsappLink] = useState('');

    const handleRegister = async () => {
        setLoading(true);
        setError('');
        try {
            const formattedPhone = phone.replace(/\D/g, '');
            if (!name || !email || !formattedPhone) {
                setError('Preencha todos os campos.');
                setLoading(false);
                return;
            }

            const response = await api.post('/auth/register', {
                name,
                email,
                phone_number: formattedPhone
            });

            if (response.data.whatsapp_link) {
                setWhatsappLink(response.data.whatsapp_link);
            }
            setStep('success');
        } catch (err: any) {
            setError('Erro ao criar conta. Tente novamente.');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex w-full bg-charcoal-bg text-crisp-white overflow-hidden">
            {/* Left Side - Brand / Visuals (Same as Login) */}
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
                        <h1 className="text-5xl font-bold mb-6 tracking-tight leading-[1.1] text-crisp-white">
                            Junte-se ao <span className="text-transparent bg-clip-text bg-gradient-to-r from-royal-purple to-emerald-vibrant">Futuro</span>.
                        </h1>
                        <p className="text-lg text-slate-low leading-relaxed max-w-md">
                            Crie sua conta e deixe a Inteligência Artificial cuidar do seu patrimônio.
                        </p>
                    </motion.div>
                </div>
            </div>

            {/* Right Side - Form */}
            <div className="w-full lg:w-1/2 flex items-center justify-center p-8 bg-charcoal-bg relative">
                <div className="absolute top-0 right-0 p-8">
                    <Link href="/login" className="flex items-center gap-2 text-slate-low hover:text-royal-purple transition-colors">
                        <span className="text-sm font-bold tracking-widest uppercase">Login</span>
                        <span className="material-symbols-outlined text-2xl">login</span>
                    </Link>
                </div>

                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.5, delay: 0.2 }}
                    className="w-full max-w-sm"
                >
                    <div className="mb-8">
                        <h2 className="text-3xl font-bold text-crisp-white mb-2">Criar Conta</h2>
                        <p className="text-slate-low text-sm">Preencha seus dados para começar.</p>
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

                        {step === 'form' ? (
                            <motion.div
                                key="step-form"
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                className="space-y-4"
                            >
                                <div>
                                    <label className="block text-xs font-bold text-slate-low uppercase tracking-widest mb-2">Nome Completo</label>
                                    <input
                                        type="text"
                                        placeholder="Seu Nome"
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        className="w-full bg-charcoal-bg border border-graphite-border rounded-lg px-4 py-3 text-sm text-crisp-white placeholder:text-slate-low/50 focus:ring-1 focus:ring-royal-purple focus:border-royal-purple outline-none transition-colors"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-low uppercase tracking-widest mb-2">Email</label>
                                    <input
                                        type="email"
                                        placeholder="seu@email.com"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        className="w-full bg-charcoal-bg border border-graphite-border rounded-lg px-4 py-3 text-sm text-crisp-white placeholder:text-slate-low/50 focus:ring-1 focus:ring-royal-purple focus:border-royal-purple outline-none transition-colors"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-low uppercase tracking-widest mb-2">WhatsApp</label>
                                    <input
                                        type="tel"
                                        placeholder="5511999999999"
                                        value={phone}
                                        onChange={(e) => setPhone(e.target.value)}
                                        className="w-full bg-charcoal-bg border border-graphite-border rounded-lg px-4 py-3 text-sm text-crisp-white placeholder:text-slate-low/50 focus:ring-1 focus:ring-royal-purple focus:border-royal-purple outline-none transition-colors"
                                    />
                                </div>

                                <button
                                    onClick={handleRegister}
                                    disabled={loading}
                                    className="w-full mt-4 bg-royal-purple hover:bg-royal-purple/90 text-crisp-white font-bold py-3.5 rounded-lg transition-all shadow-lg shadow-royal-purple/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                >
                                    {loading ? (
                                        <span className="material-symbols-outlined animate-spin text-xl">progress_activity</span>
                                    ) : (
                                        <>
                                            Cadastrar
                                            <span className="material-symbols-outlined text-sm">person_add</span>
                                        </>
                                    )}
                                </button>
                            </motion.div>
                        ) : (
                            <motion.div
                                key="step-success"
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                className="space-y-6 text-center"
                            >
                                <div className="w-16 h-16 bg-emerald-vibrant/20 rounded-full flex items-center justify-center mx-auto mb-4">
                                    <span className="material-symbols-outlined text-3xl text-emerald-vibrant">check</span>
                                </div>
                                <h3 className="text-xl font-bold text-crisp-white">Cadastro Realizado!</h3>
                                <p className="text-slate-low text-sm">
                                    Para ativar sua conta, envie a mensagem de confirmação no WhatsApp.
                                </p>

                                <a
                                    href={whatsappLink}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="block w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-4 rounded-lg transition-all shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-2"
                                >
                                    <span className="material-symbols-outlined text-xl">chat</span>
                                    Enviar Mensagem
                                </a>

                                <Link
                                    href="/login"
                                    className="block w-full text-xs font-bold text-slate-low hover:text-royal-purple mt-4 transition-colors"
                                >
                                    Voltar para Login
                                </Link>
                            </motion.div>
                        )}
                    </div>
                </motion.div>
            </div>
        </div>
    );
}
