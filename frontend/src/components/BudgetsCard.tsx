'use client';

import { Card, Title, BarList, Button, TextInput, NumberInput, Dialog, DialogPanel } from '@tremor/react';
import { useState, useEffect } from 'react';
import api from '@/lib/api';

interface Budget {
    id: string;
    category: string;
    amount: number;
    month: string;
    spent?: number; // To be calculated or fetched
}

export default function BudgetsCard() {
    const [isOpen, setIsOpen] = useState(false);
    const [budgets, setBudgets] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    // Form State
    const [category, setCategory] = useState('');
    const [amount, setAmount] = useState<number>(0);

    const fetchBudgets = async () => {
        try {
            const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
            const response = await api.get(`/api/budgets/?month=${currentMonth}`);

            // For now, we mock "spent" or we need another API call. 
            // Let's assume the API eventually returns spent vs budget. 
            // For MVP, just list the limits.
            const data = response.data.map((b: any) => ({
                name: b.category,
                value: b.amount,
                // spent: ...
            }));
            setBudgets(data);
        } catch (error) {
            console.error("Failed to fetch budgets", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchBudgets();
    }, []);

    const handleSave = async () => {
        try {
            const currentMonth = new Date().toISOString().slice(0, 7);
            // Ensure amount is a valid number, default to 0 if NaN
            const safeAmount = isNaN(Number(amount)) ? 0 : Number(amount);

            await api.post('/api/budgets/', {
                category,
                amount: safeAmount,
                month: currentMonth
            });

            setIsOpen(false);
            fetchBudgets();
            // Reset form
            setCategory('');
            setAmount(0);
        } catch (e) {
            console.error(e);
            alert("Erro ao salvar orçamento");
        }
    };

    return (
        <Card>
            <div className="flex justify-between items-center mb-4">
                <Title>Orçamentos (Este Mês)</Title>
                <Button size="xs" variant="secondary" onClick={() => setIsOpen(true)}>
                    + Definir
                </Button>
            </div>

            <div className="mt-4">
                {loading ? (
                    <p className="text-gray-500">Carregando...</p>
                ) : budgets.length === 0 ? (
                    <p className="text-gray-500 italic">Nenhum orçamento definido.</p>
                ) : (
                    <BarList data={budgets} className="mt-2" />
                )}
            </div>

            <Dialog open={isOpen} onClose={() => setIsOpen(false)} static={true}>
                <DialogPanel>
                    <Title className="mb-4">Definir Orçamento</Title>

                    <div className="space-y-4">
                        <div>
                            <label className="text-sm text-gray-500">Categoria</label>
                            <TextInput placeholder="Ex: Alimentação" value={category} onValueChange={setCategory} />
                        </div>
                        <div>
                            <label className="text-sm text-gray-500">Valor Limite (R$)</label>
                            <NumberInput
                                placeholder="0.00"
                                value={amount}
                                onValueChange={(v) => setAmount(Number(v) || 0)}
                                min={0}
                            />
                        </div>

                        <div className="flex justify-end gap-2 mt-6">
                            <Button variant="secondary" onClick={() => setIsOpen(false)}>Cancelar</Button>
                            <Button onClick={handleSave}>Salvar</Button>
                        </div>
                    </div>
                </DialogPanel>
            </Dialog>
        </Card>
    );
}
