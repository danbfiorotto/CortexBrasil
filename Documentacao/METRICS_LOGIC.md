# Lógica de Funcionamento - Métricas do Dashboard (HUD)

Este documento detalha a lógica de negócio e os cálculos técnicos por trás dos três cards principais do Head-Up Display (HUD) no dashboard do Cortex.

---

## 1. Safe-to-Spend (Livre para Gastar)

Indica quanto do orçamento mensal ainda está disponível para gastos após considerar os compromissos financeiros.

### Lógica de Negócio
O sistema calcula a diferença entre o que você espera ganhar e o que você já comprometeu através de orçamentos (budgets).

### Cálculo Técnico
- **Fórmula**: `Safe-to-Spend = Renda_Estimada - Total_Budgets`
- **Variáveis**:
  - `Renda_Estimada`: Obtida dinamicamente da tabela `user_profiles`. Se o usuário ainda não definiu sua renda, o sistema aciona o fluxo de **Onboarding**.
  - `Total_Budgets`: Soma de todos os registros na tabela `budgets` para o mês atual.

---

## 2. Burn Rate Speedometer (Velocidade de Gastos)

Um indicador visual do ritmo de consumo do seu dinheiro em relação ao tempo decorrido no mês.

### Lógica de Negócio
Avalia se a sua média de gastos diários levaria você a ultrapassar sua renda total ao final do mês.

### Cálculo Técnico
1. **Média Diária**: `Gasto_MTD / Dias_Passados`
   - `Gasto_MTD`: Soma total das transações do dia 1 até hoje.
   - `Dias_Passados`: Dia atual do mês.
2. **Projeção de Consumo**: `Média_Diária * Dias_Totais_do_Mês`
3. **Percentual do Limite**: `(Projeção_de_Consumo / Renda_Estimada) * 100`

---

## 3. Onboarding e Persistência

O sistema agora detecta automaticamente se o usuário possui os dados necessários para uma análise precisa.

### Fluxo de Onboarding
- **Detecção**: O backend retorna `needs_onboarding: true` se a renda mensal não estiver configurada.
- **Interface**: Um modal premium é exibido no dashboard solicitando a renda mensal.
- **Persistência**: Os dados são salvos na tabela `user_profiles` e os indicadores são recalculados instantaneamente.

---

## Referências de Código
- **Backend (Cálculos e Profile)**: `backend/api/dashboard.py`
- **Frontend (Interface HUD)**: `frontend/src/components/HUD.tsx`
- **Componente de Onboarding**: `frontend/src/components/OnboardingModal.tsx`
- **Modelos de Dados**: `backend/db/models.py`
