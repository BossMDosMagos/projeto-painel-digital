# Automação: ao conectar o carregador da moto, abrir 99 Moto + Waze + Painel

Guia completo para o **MacroDroid** (Android). Foco nos aparelhos Xiaomi/Redmi
com **HyperOS** (ex.: Redmi Note 13 Pro), que não possuem automação nativa.

> **Limitação técnica importante:** no Android, apenas o **último** app aberto
> fica na frente. Os demais abrem em segundo plano (lista de recentes).
> A ordem das ações define quem aparece na tela.

---

## 1. Pré-requisitos

- **Painel Digital instalado como PWA** (ver passo 2).
- **99 Moto** e **Waze** instalados na Play Store.
- **MacroDroid** instalado (Play Store).

## 2. Instalar o PWA "Painel Digital"

1. Abra `https://bossmdosmagos.github.io/projeto-painel-digital/` no Chrome.
2. Menu do Chrome (⋮) → **"Adicionar à tela inicial"** / **"Instalar app"**.
3. Confirme. Isso cria o atalho **"Painel Digital"** em fullscreen.

## 3. Permissões obrigatórias no HyperOS (Xiaomi/Redmi)

Sem isso o Android mata o MacroDroid e a regra não dispara:

1. **Auto-start ON**
   - Configurações → **Aplicativos → Gerenciar aplicativos → MacroDroid**
   - → **Outras permissões** (ou *Outros*) → **Inicialização automática** → **ON**.
2. **Bateria sem restrição**
   - Configurações → **Bateria → MacroDroid → Sem restrições**.
3. **Proteger do Kill**
   - Multitarefas → segure o cartão do **MacroDroid** → **bloquear/cadeado**.

> Dica extra: após configurar, plugue o carregador uma vez e confirme que a
> regra dispara. Se não disparar, repita o passo 3 e teste com a tela
> desbloqueada.

## 4. Criar a macro (ordem sugerida)

| # | Categoria | Ação | Observação |
|---|-----------|------|------------|
| 1 | **Bateria** | **Energia conectada** (_Power Connected_) | **TRIGGER** — dispara ao plugar |
| 2 | **Exibição** | **Tela acesa** (_Screen On_) | acorda a tela se estiver travada |
| 3 | **Aplicativos** | **Iniciar aplicativo** → **99 Moto** | abre em segundo plano |
| 4 | **Diversos** | **Aguardar antes da próxima ação** → `1s` | dá tempo de abrir |
| 5 | **Aplicativos** | **Iniciar aplicativo** → **Waze** | abre em segundo plano |
| 6 | **Diversos** | **Aguardar antes da próxima ação** → `1s` | dá tempo de abrir |
| 7 | **Aplicativos** | **Iniciar aplicativo** → **Painel Digital** (PWA) | fica na FRENTE |

Passos no MacroDroid:

1. Aba **Macros** → botão **"+"** → **Nome:** `Painel ao Carregar`.
2. Toque em **TRIGGERS** (`+`) → **Bateria** → **Energia conectada** → ✔.
3. Toque em **AÇÕES** (`+`) e adicione na ordem da tabela acima
   (action 2 → 3 → 4 → 5 → 6 → 7).
4. **Salvar** (✓) e coloque o **switch ON**.
5. Teste: bloqueie a tela e **pluge o carregador**.

Se o **Painel Digital** não aparecer na lista do *Launch App*:
use **Abrir site** (_Open Web Site_) com
`https://bossmdosmagos.github.io/projeto-painel-digital/` (perde fullscreen).

### Quem fica na frente?
A ação **por último** é a que fica visível. Para deixar o **Waze** na frente,
movimente as ações 5 e 7 (ordem sugerida alternada: 99 Moto → Painel → Waze).

## 5. Solução de problemas

| Problema | Provável causa | Solução |
|----------|----------------|---------|
| Nada acontece ao plugar | MacroDroid morto pelo sistema | Refaça o passo 3; autostart ON; cadeado no multitarefas |
| Só a tela acende, app não abre | MacroDroid demorou ou permissão | Adicione `Wait 2s` antes do Launch; confirme o app na lista |
| 99 Moto para numa tela de confirmação | O app pede verificação do motorista | Coloque o 99 primeiro e os demais depois |
| Painel abre sem fullscreen | Abriu via *Open Web Site* | Reinstale o PWA com "Instalar app" |
| Waze muito "falante" ao abrir | avisos padrão do app | Abra o Waze antes do Painel |

## 6. Outros aparelhos

- **Samsung (One UI):** existe nativo — **Modos e Rotinas** → Rotina → condição
  *"Ao iniciar o carregamento"* → ação *"Abrir app"* (não precisa do MacroDroid).
- **iPhone / iPad (Safari/PWA):** **não é possível** — web não tem evento de
  energia nem auto-abertura. Use Wake Lock (já ativo no painel) e abra manualmente.