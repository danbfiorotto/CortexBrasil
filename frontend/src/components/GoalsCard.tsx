'use client';

import { useState, useEffect, Fragment } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import api from '@/lib/api';

interface Goal {
    id: string;
    name: string;
    target_amount: number;
    current_amount: number;
    deadline?: string;
    percentage?: number;
}

const formatBRL = (val: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(val);

export default function GoalsCard() {
    const [isOpen, setIsOpen] = useState(false);
    const [goals, setGoals] = useState<Goal[]>([]);
    const [loading, setLoading] = useState(true);

    const [name, setName] = useState('');
    const [target, setTarget] = useState<number>(0);
    const [current, setCurrent] = useState<number>(0);

    const fetchGoals = async () => {
        try {
            const response = await api.get('/api/goals/');
            const data = response.data.map((g: Goal) => ({
                ...g,
                percentage: Math.min(100, Math.round((g.current_amount / g.target_amount) * 100)),
            }));
            setGoals(data);
        } catch (error) {
            console.error("Failed to fetch goals", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchGoals();
    }, []);

    const handleSave = async () => {
        try {
            const safeTarget = isNaN(Number(target)) ? 0 : Number(target);
            const safeCurrent = isNaN(Number(current)) ? 0 : Number(current);

            await api.post('/api/goals/', {
                name,
                target_amount: safeTarget,
                current_amount: safeCurrent,
                deadline: null,
            });

            setIsOpen(false);
            fetchGoals();
            setName('');
            setTarget(0);
            setCurrent(0);
        } catch (e: unknown) {
            const errorMessage = e instanceof Error ? e.message : 'Erro desconhecido';
            console.error(e);
            alert(`Erro ao salvar meta: ${errorMessage}`);
        }
    };

    return (
        <section className="bg-graphite-card rounded-xl border border-graphite-border p-6 shadow-sm">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h3 className="text-md font-bold flex items-center gap-2 text-crisp-white">
                        <span className="material-symbols-outlined text-royal-purple text-xl">flight_takeoff</span>
                        Metas Financeiras
                    </h3>
                </div>
                <button
                    onClick={() => setIsOpen(true)}
                    className="text-[10px] font-bold uppercase tracking-widest text-royal-purple hover:text-royal-purple/80 transition-colors"
                >
                    + Criar Meta
                </button>
            </div>

            <div className="space-y-5">
                {loading ? (
                    <div className="space-y-3 animate-pulse">
                        <div className="h-16 bg-graphite-border/30 rounded-lg" />
                        <div className="h-16 bg-graphite-border/30 rounded-lg" />
                    </div>
                ) : goals.length === 0 ? (
                    <p className="text-slate-low text-xs italic">Nenhuma meta definida.</p>
                ) : (
                    goals.map((goal) => (
                        <div key={goal.id} className="space-y-3">
                            <div className="flex items-center justify-between">
                                <span className="text-sm font-bold text-crisp-white">{goal.name}</span>
                                <span className="text-royal-purple font-bold subtle-glow-purple">
                                    {goal.percentage}%
                                </span>
                            </div>
                            <div className="relative h-3 bg-graphite-border rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-gradient-to-r from-royal-purple to-royal-purple/60 rounded-full transition-all duration-500"
                                    style={{ width: `${goal.percentage}%` }}
                                />
                            </div>
                            <p className="text-[10px] font-bold text-slate-low tracking-wider">
                                META: {formatBRL(goal.target_amount)} | <span className="text-crisp-white">{formatBRL(goal.current_amount)} SALDO</span>
                            </p>
                        </div>
                    ))
                )}
            </div>

            {/* Create Goal Dialog */}
            <Transition appear show={isOpen} as={Fragment}>
                <Dialog as="div" className="relative z-50" onClose={() => setIsOpen(false)}>
                    <Transition.Child
                        as={Fragment}
                        enter="ease-out duration-300"
                        enterFrom="opacity-0"
                        enterTo="opacity-100"
                        leave="ease-in duration-200"
                        leaveFrom="opacity-100"
                        leaveTo="opacity-0"
                    >
                        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" />
                    </Transition.Child>

                    <div className="fixed inset-0 overflow-y-auto">
                        <div className="flex min-h-full items-center justify-center p-4">
                            <Transition.Child
                                as={Fragment}
                                enter="ease-out duration-300"
                                enterFrom="opacity-0 scale-95"
                                enterTo="opacity-100 scale-100"
                                leave="ease-in duration-200"
                                leaveFrom="opacity-100 scale-100"
                                leaveTo="opacity-0 scale-95"
                            >
                                <Dialog.Panel className="w-full max-w-md bg-graphite-card border border-graphite-border rounded-xl p-6 shadow-2xl">
                                    <Dialog.Title className="text-lg font-bold text-crisp-white mb-6">
                                        Nova Meta
                                    </Dialog.Title>

                                    <div className="space-y-4">
                                        <div>
                                            <label className="text-[10px] font-bold text-slate-low uppercase tracking-widest block mb-2">
                                                Nome da Meta
                                            </label>
                                            <input
                                                type="text"
                                                placeholder="Ex: Viagem, Carro Novo"
                                                value={name}
                                                onChange={(e) => setName(e.target.value)}
                                                className="w-full bg-charcoal-bg border border-graphite-border rounded-lg px-4 py-2.5 text-sm text-crisp-white placeholder:text-slate-low/50 focus:ring-1 focus:ring-royal-purple focus:border-royal-purple outline-none transition-colors"
                                            />
                                        </div>

                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="text-[10px] font-bold text-slate-low uppercase tracking-widest block mb-2">
                                                    Valor Alvo (R$)
                                                </label>
                                                <input
                                                    type="number"
                                                    placeholder="0.00"
                                                    value={target || ''}
                                                    onChange={(e) => setTarget(Number(e.target.value) || 0)}
                                                    min={0}
                                                    className="w-full bg-charcoal-bg border border-graphite-border rounded-lg px-4 py-2.5 text-sm text-crisp-white placeholder:text-slate-low/50 focus:ring-1 focus:ring-royal-purple focus:border-royal-purple outline-none transition-colors"
                                                />
                                            </div>
                                            <div>
                                                <label className="text-[10px] font-bold text-slate-low uppercase tracking-widest block mb-2">
                                                    Já Guardado (R$)
                                                </label>
                                                <input
                                                    type="number"
                                                    placeholder="0.00"
                                                    value={current || ''}
                                                    onChange={(e) => setCurrent(Number(e.target.value) || 0)}
                                                    min={0}
                                                    className="w-full bg-charcoal-bg border border-graphite-border rounded-lg px-4 py-2.5 text-sm text-crisp-white placeholder:text-slate-low/50 focus:ring-1 focus:ring-royal-purple focus:border-royal-purple outline-none transition-colors"
                                                />
                                            </div>
                                        </div>

                                        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-graphite-border">
                                            <button
                                                onClick={() => setIsOpen(false)}
                                                className="px-4 py-2 text-sm font-bold text-slate-low hover:text-crisp-white transition-colors rounded-lg border border-graphite-border hover:bg-graphite-border/30"
                                            >
                                                Cancelar
                                            </button>
                                            <button
                                                onClick={handleSave}
                                                className="px-4 py-2 text-sm font-bold text-crisp-white bg-royal-purple hover:bg-royal-purple/90 rounded-lg transition-colors shadow-lg shadow-royal-purple/20"
                                            >
                                                Salvar
                                            </button>
                                        </div>
                                    </div>
                                </Dialog.Panel>
                            </Transition.Child>
                        </div>
                    </div>
                </Dialog>
            </Transition>
        </section>
    );
}
