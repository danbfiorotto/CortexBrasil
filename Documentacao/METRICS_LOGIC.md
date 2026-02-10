# Lógica de Funcionamento - Métricas do Dashboard (HUD)

Este documento detalha a lógica de negócio e os cálculos técnicos por trás dos três cards principais do Head-Up Display (HUD) no dashboard do Cortex.

---

## 1. Safe-to-Spend (Livre para Gastar)

Indica quanto do orçamento mensal ainda está disponível para gastos após considerar os compromissos financeiros e a renda disponível.

### Lógica de Negócio: Renda Híbrida
Para lidar com rendas variáveis ou que chegam em partes, o sistema utiliza uma lógica híbrida:
1. **Renda Esperada (Meta)**: O valor definido pelo usuário no onboarding.
2. **Renda Realizada**: A soma de todas as transações do tipo `INCOME` no mês atual.
3. **Renda Efetiva**: O maior valor entre a *Meta* e o *Realizado* (`Max(Expected, Realized)`).

Isso garante que:
- No início do mês (sem rendas), o planejamento baseia-se na sua expectativa.
- Se você ganhar mais que o esperado, o sistema reconhece o bônus e aumenta seu "Safe-to-Spend".

### Cálculo Técnico
- **Fórmula**: `Safe-to-Spend = Renda_Efetiva - Total_Budgets`
- **Variáveis**:
  - `Renda_Efetiva`: Calculada dinamicamente via `Max(UserProfile.monthly_income, sum(INCOME transactions))`.
  - `Total_Budgets`: Soma de todos os registros na tabela `budgets` para o mês atual.

---

## 2. Burn Rate Speedometer (Velocidade de Gastos)

Um indicador visual do ritmo de consumo em relação à sua **Renda Efetiva**.

### Lógica de Negócio
Avalia se a sua média de gastos diários é sustentável perante sua renda total disponível.

### Cálculo Técnico
1. **Média Diária**: `Gasto_MTD / Dias_Passados`
   - `Gasto_MTD`: Soma total das transações de gasto (`EXPENSE`) até o momento.
2. **Projeção de Consumo**: `Média_Diária * Dias_Totais_do_Mês`
3. **Percentual do Limite**: `(Projeção_de_Consumo / Renda_Efetiva) * 100`

---

## 3. Onboarding e Persistência

- **Onboarding**: Coleta a meta de renda mensal inicial.
- **Detecção**: O sistema monitora transações de `INCOME` em tempo real para atualizar o dashboard sem necessidade de intervenção manual.
- **Visualização**: O dashboard exibe explicitamente quanto foi **Realizado** vs a **Meta** para total transparência.

---

## Referências de Código
- **Backend (Cálculos e Profile)**: `backend/api/dashboard.py`
- **Frontend (Interface HUD)**: `frontend/src/components/HUD.tsx`
- **Modelos de Dados**: `backend/db/models.py`
