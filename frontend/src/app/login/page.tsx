'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import Cookies from 'js-cookie';
import { Card, TextInput, Button, Text, Title, Callout } from '@tremor/react';
import { ShieldCheck, Smartphone, ArrowRight, Loader2, Sparkles, Lock } from 'lucide-react';
import { motion } from 'framer-motion';

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
                console.warn("Tentativa de login falhou: Código inválido.");
            } else {
                setError('Erro no servidor. Tente novamente.');
                console.error(err);
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex w-full">
            {/* Left Side - Brand / Visuals */}
            <div className="hidden lg:flex w-1/2 bg-slate-900 relative overflow-hidden items-center justify-center p-12">
                <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1639322537228-ad714dd474f5?q=80&w=2664&auto=format&fit=crop')] bg-cover bg-center opacity-20 mix-blend-overlay"></div>
                <div className="absolute inset-0 bg-gradient-to-tr from-blue-900/40 to-indigo-900/40"></div>

                <div className="relative z-10 max-w-lg text-white">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.8 }}
                    >
                        <div className="flex items-center gap-3 mb-6">
                            <div className="p-3 bg-blue-600 rounded-xl shadow-lg shadow-blue-500/30">
                                <Sparkles className="w-8 h-8 text-white" />
                            </div>
                        </div>
                        <h1 className="text-5xl font-bold mb-6 tracking-tight leading-tight">
                            Domine suas finanças com Inteligência.
                        </h1>
                        <p className="text-xl text-slate-300 leading-relaxed">
                            O Cortex Brasil usa IA avançada para analisar, categorizar e otimizar seu patrimônio em tempo real. Sem planilhas, sem esforço.
                        </p>

                        <div className="mt-12 flex gap-4">
                            <div className="flex -space-x-4">
                                {[1, 2, 3].map(i => (
                                    <div key={i} className="w-10 h-10 rounded-full border-2 border-slate-900 bg-slate-700"></div>
                                ))}
                            </div>
                            <div className="flex flex-col justify-center">
                                <span className="text-sm font-bold">Junte-se a 1.000+ usuários</span>
                                <span className="text-xs text-slate-400">que controlam o futuro.</span>
                            </div>
                        </div>
                    </motion.div>
                </div>
            </div>

            {/* Right Side - Form */}
            <div className="w-full lg:w-1/2 bg-white dark:bg-slate-950 flex items-center justify-center p-8">
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.5 }}
                    className="w-full max-w-md"
                >
                    <div className="mb-10 text-center lg:text-left">
                        <div className="lg:hidden flex justify-center mb-4">
                            <div className="p-3 bg-blue-600 rounded-xl">
                                <Sparkles className="w-6 h-6 text-white" />
                            </div>
                        </div>
                        <h2 className="text-3xl font-bold text-slate-900 dark:text-white">Bem-vindo de volta</h2>
                        <p className="text-slate-500 dark:text-slate-400 mt-2">Acesse sua conta para visualizar seu dashboard.</p>
                    </div>

                    {error && (
                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} className="mb-6">
                            <Callout title="Erro de Acesso" color="red" icon={ShieldCheck}>
                                {error}
                            </Callout>
                        </motion.div>
                    )}

                    <Card className="ring-0 shadow-none border-0 p-0 bg-transparent">
                        {step === 'phone' ? (
                            <div className="space-y-6">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">WhatsApp</label>
                                    <TextInput
                                        icon={Smartphone}
                                        placeholder="5511999999999"
                                        value={phone}
                                        onValueChange={setPhone}
                                        className="h-12 text-lg"
                                    />
                                    <p className="text-xs text-slate-400 mt-2 ml-1">Digite seu número completo com DDD.</p>
                                </div>
                                <Button
                                    size="xl"
                                    className="w-full font-bold shadow-lg shadow-blue-500/20 hover:shadow-blue-500/40 transition-all"
                                    onClick={handleRequestOtp}
                                    loading={loading}
                                    disabled={!phone}
                                >
                                    Receber Código de Acesso
                                </Button>
                            </div>
                        ) : (
                            <div className="space-y-6">
                                <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl border border-blue-100 dark:border-blue-800">
                                    <p className="text-sm text-blue-800 dark:text-blue-200">{instruction}</p>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Código de 6 dígitos</label>
                                    <TextInput
                                        icon={Lock}
                                        placeholder="000000"
                                        value={otp}
                                        onValueChange={setOtp}
                                        className="text-center text-2xl tracking-[0.5em] font-mono h-14"
                                        maxLength={6}
                                    />
                                </div>

                                <Button
                                    size="xl"
                                    className="w-full font-bold shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/40 transition-all bg-emerald-600 hover:bg-emerald-700 border-none"
                                    onClick={handleVerifyOtp}
                                    loading={loading}
                                    disabled={otp.length !== 6}
                                >
                                    Entrar no Dashboard
                                </Button>

                                <button
                                    onClick={() => setStep('phone')}
                                    className="w-full text-sm text-slate-500 hover:text-blue-600 mt-4 flex items-center justify-center gap-2"
                                >
                                    <ArrowRight className="w-4 h-4 rotate-180" />
                                    Corrigir número
                                </button>
                            </div>
                        )}
                    </Card>

                    <div className="mt-12 text-center">
                        <p className="text-xs text-slate-400">Protegido por criptografia de ponta a ponta.</p>
                    </div>
                </motion.div>
            </div>
        </div>
    );
}
