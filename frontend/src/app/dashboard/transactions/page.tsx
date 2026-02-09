'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';
import {
    Card, Title, Text, Table, TableHead, TableRow, TableHeaderCell, TableBody, TableCell,
    Badge, Button, Select, SelectItem, DateRangePicker, DateRangePickerValue,
    Flex, TextInput
} from '@tremor/react';
import {
    ChevronLeft, ChevronRight, Search, Filter, Download
} from 'lucide-react';
import { motion } from 'framer-motion';

interface Transaction {
    id: string;
    amount: number;
    category: string;
    description: string;
    date: string;
    is_installment: boolean;
    installment_info: string | null;
}

const CATEGORIES = [
    "Alimentação", "Transporte", "Moradia", "Lazer", "Saúde",
    "Educação", "Compras", "Serviços", "Outros"
];

export default function TransactionsPage() {
    const [data, setData] = useState<Transaction[]>([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [category, setCategory] = useState<string>('');

    // Debounce search could be added later, currently filtering by category only

    useEffect(() => {
        fetchTransactions();
    }, [page, category]);

    const fetchTransactions = async () => {
        setLoading(true);
        try {
            const params: any = { page, limit: 10 };
            if (category && category !== 'Todas') params.category = category;

            const res = await api.get('/api/dashboard/transactions', { params });
            setData(res.data.data);
            setTotalPages(res.data.meta.pages);
        } catch (error) {
            console.error("Failed to fetch transactions", error);
        } finally {
            setLoading(false);
        }
    };

    const valueFormatter = (number: number) =>
        `R$ ${new Intl.NumberFormat('pt-BR').format(number).toString()}`;

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
        >
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <Title>Transações</Title>
                    <Text>Gerencie e visualize todo o seu histórico financeiro.</Text>
                </div>
                <Button variant="secondary" icon={Download} disabled>
                    Exportar CSV
                </Button>
            </div>

            <Card className="ring-0 shadow-xl border border-slate-100 dark:border-slate-800 dark:bg-slate-800/50">
                {/* Filters */}
                <div className="flex flex-col md:flex-row gap-4 mb-6 pb-6 border-b border-slate-100 dark:border-slate-700">
                    <div className="w-full md:w-64">
                        <Text className="mb-1">Categoria</Text>
                        <Select value={category} onValueChange={(val) => { setCategory(val); setPage(1); }}>
                            <SelectItem value="">Todas</SelectItem>
                            {CATEGORIES.map(cat => (
                                <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                            ))}
                        </Select>
                    </div>
                    {/* 
            <div className="w-full md:w-auto">
                <Text className="mb-1">Período</Text>
                <DateRangePicker className="mx-auto" placeholder="Selecionar datas..." />
            </div>
            */}
                </div>

                {/* Table */}
                {loading ? (
                    <div className="py-20 text-center">
                        <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"></div>
                        <Text>Carregando transações...</Text>
                    </div>
                ) : (
                    <>
                        <Table>
                            <TableHead>
                                <TableRow>
                                    <TableHeaderCell>Data</TableHeaderCell>
                                    <TableHeaderCell>Descrição</TableHeaderCell>
                                    <TableHeaderCell>Categoria</TableHeaderCell>
                                    <TableHeaderCell className="text-right">Valor</TableHeaderCell>
                                    <TableHeaderCell>Detalhes</TableHeaderCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {data.map((tx) => (
                                    <TableRow key={tx.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                                        <TableCell>
                                            {new Date(tx.date).toLocaleDateString('pt-BR')}
                                        </TableCell>
                                        <TableCell>
                                            <Text className="font-medium text-slate-900 dark:text-slate-100">{tx.description}</Text>
                                        </TableCell>
                                        <TableCell>
                                            <Badge size="xs" color="gray">{tx.category}</Badge>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <Text className="font-semibold text-slate-700 dark:text-slate-200">
                                                {valueFormatter(tx.amount)}
                                            </Text>
                                        </TableCell>
                                        <TableCell>
                                            {tx.is_installment && (
                                                <Badge size="xs" color="purple">
                                                    {tx.installment_info || "Parcelado"}
                                                </Badge>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>

                        {/* Pagination */}
                        <div className="mt-6 flex items-center justify-between border-t border-slate-100 dark:border-slate-700 pt-4">
                            <Text>Página {page} de {totalPages}</Text>
                            <div className="flex gap-2">
                                <Button
                                    variant="secondary"
                                    icon={ChevronLeft}
                                    disabled={page === 1}
                                    onClick={() => setPage(p => Math.max(1, p - 1))}
                                >
                                    Anterior
                                </Button>
                                <Button
                                    variant="secondary"
                                    icon={ChevronRight}
                                    disabled={page === totalPages}
                                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                >
                                    Próxima
                                </Button>
                            </div>
                        </div>
                    </>
                )}
            </Card>
        </motion.div>
    );
}
