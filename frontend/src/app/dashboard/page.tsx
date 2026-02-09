'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';
import {
    Card, Title, Text, Table, TableHead, TableRow, TableHeaderCell, TableBody, TableCell, Badge,
    Flex, Metric
} from '@tremor/react';
import { motion } from 'framer-motion';
import { Wallet, Search } from 'lucide-react';

import BudgetsCard from '@/components/BudgetsCard';
import GoalsCard from '@/components/GoalsCard';
import HUD from '@/components/HUD';
import PulseFeed from '@/components/PulseFeed';
import CommitmentMountain from '@/components/CommitmentMountain';

interface Transaction {
    id: string;
    amount: number;
    category: string;
    description: string;
    date: string;
    is_installment: boolean;
}

interface DashboardData {
    user: string;
    recent_transactions: Transaction[];
    // Other fields might be unused now as HUD fetches its own, but we keep for safety or remove
}

const valueFormatter = (number: number) =>
    `R$ ${new Intl.NumberFormat('pt-BR').format(number).toString()}`;

export default function DashboardPage() {
    const [data, setData] = useState<DashboardData | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const res = await api.get('/api/dashboard/summary');
                setData(res.data);
            } catch (error) {
                console.error("Failed to fetch dashboard data", error);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, []);

    if (loading) return (
        <div className="flex flex-col items-center justify-center h-screen space-y-4 bg-slate-950 text-slate-200">
            <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
            <Text className="animate-pulse">Carregando Cortex...</Text>
        </div>
    );

    if (!data) return <div className="p-10 text-center"><Text>Erro ao carregar dados.</Text></div>;

    // Animation variants
    const container = {
        hidden: { opacity: 0 },
        show: {
            opacity: 1,
            transition: { staggerChildren: 0.1 }
        }
    };

    const item = {
        hidden: { opacity: 0, y: 20 },
        show: { opacity: 1, y: 0 }
    };

    return (
        <motion.div
            variants={container}
            initial="hidden"
            animate="show"
            className="space-y-8 pb-10"
        >
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
                <div>
                    <h2 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-indigo-400">
                        Olá, {data.user}
                    </h2>
                    <Text className="mt-1 text-slate-400">Visão Geral Financeira</Text>
                </div>
            </div>

            {/* 1. HUD (Zero Interface - Vital Stats) */}
            <motion.div variants={item}>
                <HUD />
            </motion.div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Left Column: Future & Data */}
                <div className="lg:col-span-2 space-y-8">

                    {/* 2. Commitment Mountain (Future) */}
                    <motion.div variants={item}>
                        <CommitmentMountain />
                    </motion.div>

                    {/* 3. Transaction Explorer (Data Grid) */}
                    <motion.div variants={item}>
                        <Card className="h-full bg-slate-900/50 border-slate-800 ring-1 ring-slate-700/50 backdrop-blur-md">
                            <div className="flex items-center justify-between mb-6">
                                <Title className="text-slate-200">Explorador de Transações</Title>
                                <div className="relative">
                                    <Search className="w-4 h-4 absolute left-3 top-3 text-slate-500" />
                                    <input
                                        type="text"
                                        placeholder="Buscar..."
                                        className="pl-9 pr-4 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-blue-500 transition-colors"
                                    />
                                </div>
                            </div>
                            <Table>
                                <TableHead>
                                    <TableRow>
                                        <TableHeaderCell className="text-slate-400">Descrição</TableHeaderCell>
                                        <TableHeaderCell className="text-slate-400">Categoria</TableHeaderCell>
                                        <TableHeaderCell className="text-right text-slate-400">Valor</TableHeaderCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {data.recent_transactions.map((tx) => (
                                        <TableRow key={tx.id} className="hover:bg-slate-800/30 transition-colors">
                                            <TableCell>
                                                <div className="flex flex-col">
                                                    <Text className="font-medium text-slate-200">{tx.description}</Text>
                                                    <Text className="text-xs text-slate-500">{new Date(tx.date).toLocaleDateString('pt-BR')}</Text>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <Badge size="xs" color="gray" className="bg-slate-800 text-slate-300 ring-1 ring-slate-700">{tx.category}</Badge>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <Text className="font-semibold text-slate-100">
                                                    {valueFormatter(tx.amount)}
                                                </Text>
                                                {tx.is_installment && (
                                                    <div className="flex justify-end mt-1">
                                                        <span className="text-[10px] text-purple-400 px-1.5 py-0.5 uppercase font-bold tracking-wider">Parcelado</span>
                                                    </div>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                            <div className="mt-4 pt-4 border-t border-slate-800 flex justify-center">
                                <button className="text-sm text-blue-400 hover:text-blue-300 transition-colors font-medium">Ver Histórico Completo</button>
                            </div>
                        </Card>
                    </motion.div>
                </div>

                {/* Right Column: Intelligence & Goals */}
                <div className="lg:col-span-1 space-y-8">

                    {/* 4. Pulse Feed (AI) */}
                    <motion.div variants={item}>
                        <PulseFeed />
                    </motion.div>

                    {/* 5. Goals (Gamified) */}
                    <motion.div variants={item}>
                        <GoalsCard />
                    </motion.div>

                    {/* 6. Budgets */}
                    <motion.div variants={item}>
                        <BudgetsCard />
                    </motion.div>
                </div>
            </div>
        </motion.div>
    );
}
