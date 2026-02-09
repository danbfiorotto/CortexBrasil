'use client';

import { Card, Title, ProgressBar, Button, TextInput, NumberInput, Dialog, DialogPanel, Flex, Text } from '@tremor/react';
import { useState, useEffect } from 'react';
import api from '@/lib/api';

interface Goal {
    id: string;
    name: string;
    target_amount: number;
    current_amount: number;
    deadline?: string;
    percentage?: number;
}

export default function GoalsCard() {
    const [isOpen, setIsOpen] = useState(false);
    const [goals, setGoals] = useState<Goal[]>([]);
    const [loading, setLoading] = useState(true);

    // Form State
    const [name, setName] = useState('');
    const [target, setTarget] = useState<number>(0);
    const [current, setCurrent] = useState<number>(0);

    const fetchGoals = async () => {
        try {
            const response = await api.get('/api/goals/');

            const data = response.data.map((g: any) => ({
                ...g,
                percentage: Math.min(100, Math.round((g.current_amount / g.target_amount) * 100))
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
                deadline: null // Optional for now
            });

            setIsOpen(false);
            fetchGoals();
            // Reset form
            setName('');
            setTarget(0);
            setCurrent(0);
        } catch (e: any) {
            console.error(e);
            alert(`Erro ao salvar meta: ${e.message || "Erro desconhecido"}`);
        }
    };

    return (
        <Card>
            <div className="flex justify-between items-center mb-4">
                <Title>Metas Financeiras</Title>
                <Button size="xs" variant="secondary" onClick={() => setIsOpen(true)}>
                    + Criar Meta
                </Button>
            </div>

            <div className="space-y-4 mt-4">
                {loading ? (
                    <p className="text-gray-500">Carregando...</p>
                ) : goals.length === 0 ? (
                    <p className="text-gray-500 italic">Nenhuma meta definida.</p>
                ) : (
                    goals.map((goal) => (
                        <div key={goal.id} className="space-y-1">
                            <Flex>
                                <Text>{goal.name}</Text>
                                <Text>R$ {goal.current_amount} / {goal.target_amount}</Text>
                            </Flex>
                            <ProgressBar value={goal.percentage || 0} color="indigo" className="mt-2" />
                        </div>
                    ))
                )}
            </div>

            <Dialog open={isOpen} onClose={() => setIsOpen(false)} static={true}>
                <DialogPanel>
                    <Title className="mb-4">Nova Meta</Title>

                    <div className="space-y-4">
                        <div>
                            <label className="text-sm text-gray-500">Nome da Meta</label>
                            <TextInput placeholder="Ex: Viagem, Carro Novo" value={name} onValueChange={setName} />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-sm text-gray-500">Valor Alvo (R$)</label>
                                <NumberInput
                                    placeholder="0.00"
                                    value={target}
                                    onValueChange={(v) => setTarget(Number(v) || 0)}
                                    min={0}
                                />
                            </div>
                            <div>
                                <label className="text-sm text-gray-500">Já Guardado (R$)</label>
                                <NumberInput
                                    placeholder="0.00"
                                    value={current}
                                    onValueChange={(v) => setCurrent(Number(v) || 0)}
                                    min={0}
                                />
                            </div>
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
