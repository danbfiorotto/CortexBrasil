# Memory — CortexBrasil

## Backend Restart

O backend roda em um servidor Windows remoto via SSH. O projeto usa Docker.

**Comando para reiniciar:**
```bash
ssh danilo_fiorotto@ssh.cortexbrasil.com.br "docker restart cortex-app-1"
```

**Detalhes do ambiente remoto:**
- SO: Windows
- Usuário: `Danilo Fiorotto` (C:\Users\Danilo Fiorotto)
- Docker rodando nativamente no Windows
- Container do backend: `cortex-app-1` (imagem `cortex-app:latest`, porta 8000)
- Outros containers: `cortex-redis-1`, `cortex-db-1`, `cortex-cloudflared-1`, `cortex-vllm`

**Para ver containers rodando:**
```bash
ssh danilo_fiorotto@ssh.cortexbrasil.com.br "docker ps"
```

**Obs:** No servidor remoto, usar comandos Windows (ex: `dir` ao invés de `ls`). O `docker` funciona direto sem prefixo.

## Workflow Obrigatório após Qualquer Alteração

**SEMPRE** após qualquer mudança de código (frontend ou backend):
1. Fazer `git add` + `git commit` + `git push` para o GitHub
2. Fazer `git pull` no servidor remoto (o volume `.:/app` monta o repo local no container):
   ```bash
   ssh danilo_fiorotto@ssh.cortexbrasil.com.br 'cd "C:\Users\Danilo Fiorotto\Documents\programacao\Cortex" && git pull'
   ```
3. Reiniciar o container (apenas para mudanças no backend):
   ```bash
   ssh danilo_fiorotto@ssh.cortexbrasil.com.br "docker restart cortex-app-1"
   ```
4. Mudanças **só no frontend** (Next.js) não precisam reiniciar o backend, mas ainda precisam do git pull.

**Repo no servidor:** `C:\Users\Danilo Fiorotto\Documents\programacao\Cortex` (montado como `/app` no container via volume)

Isso é **obrigatório** — não perguntar, só fazer.

## Arquivos Chave
- Frontend charts: `frontend/src/components/charts/`
- Investimentos: `frontend/src/app/dashboard/investments/page.tsx`
- HoldingsTreemap: `frontend/src/components/charts/HoldingsTreemap.tsx`
