# Painel Digital — Wrapper Android (GPS em segundo plano)

Projeto Android (Kotlin + WebView + foreground service) que abre o PWA
`https://bossmdosmagos.github.io/projeto-painel-digital/?native=1` e mantém o
**GPS ativo e o odômetro contando mesmo com o app em segundo plano**.

## Como funciona

| Peça | Papel |
|------|-------|
| `MainActivity` | WebView fullscreen abrindo o painel; configura permissões e inicia o serviço |
| `TrackingService` | **Foreground service** (START_STICKY + WakeLock) que captura o GPS nativo (LocationManager) a cada 1s e injeta no painel via `window.__panelNativePos(lat,lng,acc,speed,ts)` |
| `TrackingBridge` | ponte estática serviço → Activity → `webView.evaluateJavascript(...)` |
| PWA (main.js) | em modo `?native=1` o navegador **não** usa o `watchPosition` HTML5; quem alimenta o painel é o serviço nativo (evita contagem dupla) |

Limites: o `WebView` nunca é pausado (`onPause` não chama `webView.onPause()`),
então o JS continua vivo em segundo plano enquanto o foreground service mantém o
processo. Se o Android matar o processo (ou você "arrastar para fora"), o
rastreio para — por isso os ajustes do HyperOS abaixo.

## Compilar no Android Studio

1. **Requisitos:** Android Studio (Ladybug ou recente) com SDK **34** instalado.
   (Não precisa de Internet nova aqui: as dependências baixam do Maven/Google no primeiro sync.)
2. **Abra o projeto:** File → Open → selecione a pasta `android-wrapper/` deste repositório.
3. **Aguarde o Gradle sync** (primeira vez pode demorar).
4. **Gere o APK:** Build → Build App Bundle(s) / APK(s) → **Build APK(s)**.
   - O APK sai em `android-wrapper/app/build/outputs/apk/debug/app-debug.apk`.
5. **Instale no celular (Redmi Note 13 Pro / HyperOS):**
   - Copie o `.apk` pro celular (cabo, Drive, etc.) e toque no arquivo.
   - Ative *"Instalar apps de fontes desconhecidas"* quando o sistema pedir.
   - Ou, com o celular conectado via USB + depuração USB: `adb install app-debug.apk` (ou instale direto pelo Android Studio → botão Run ▶).

## Primeira execução

1. Abra o **Painel Digital**.
2. Conceda **Localização — "Sempre permitir"** (para funcionar em segundo plano)
   e **Notificações** (Android 13+).
3. Ative a **captura de navegação da 99**:
   Configurações → Apps → **Acesso especial** → **Acesso a notificações** →
   marque **Painel Digital**. (Sem isso o serviço que lê o endereço da 99 não roda.)
4. Toque em **Configurações** (segure fora do painel) e confira o GPS LED no topo (verde).

## Navegação 50/50 (automática)

- Enquanto roda uma corrida da 99, o painel captura o endereço de destino,
  geocodifica (Nominatim, grátis) e **ativa sozinho o modo dividido**.
- O **turn-by-turn real é feito pelo próprio painel** (no WebView), pelo roteador
  público **OSRM** (`router.project-osrm.org`) — **sem precisar de chave**.
  A tela mostra ícone fixo de manobra (reto/à esquerda/à direita/rotatória),
  distância contando até a próxima conversão e o nome da próxima rua.
- Para testar em pista sem o app 99: use os campos **Origem/Destino** no menu —
  há **autocomplete** (Nominatim) que prioriza endereços na região do GPS,
  ou digite coordenadas `lat, lng` direto.
- Quando a corrida é finalizada, o painel **volta sozinho** para o velocímetro em tela cheia.
- Botão manual em **Configurações** alterna o modo dividido quando você quiser.

## Testar a captura da 99

1. Ative o acesso às notificações (passo 3 acima).
2. Peça uma corrida e **aceite-a** no celular.
3. Abra o Logcat e filtre por `PainelDigital.99` — se o endereço aparecer
   (`99 notificação -> ...`), está funcionando.
4. Se **não** aparecer o endereço na notificação (varia por versão do app 99),
   o plano B é um `AccessibilityService` lendo o texto da tela — o pipeline
   (`Navigator`) já está pronto para receber essa fonte com pouca mudança.

## Ajustes obrigatórios no Redmi Note 13 Pro (HyperOS)

Para o Android não matar o serviço:

1. Configurações → **Aplicativos → Gerenciar aplicativos → Painel Digital**
   → *Outras permissões* → **Inicialização automática: ON**.
2. Configurações → **Bateria → Painel Digital → Sem restrições**.
3. Multitarefas → segure o cartão do **Painel Digital** → **bloquear (cadeado)**.
4. Confirme que **Localização** ficou em *"Permitir sempre"* (não "apenas enquanto usa").

## Testar o comportamento em segundo plano

1. Abra o Painel e **agurde fixar o GPS** (LED verde).
2. Aperte **Home** (o painel vai para segundo plano — a notificação "Painel Digital ativo" deve aparecer).
3. Saia andando/na moto por alguns minutos.
4. Volte ao **Painel Digital**: o **odômetro deve ter acumulado os km** no período.

## Dica de integração

Com o wrapper instalado, atualize a regra do MacroDroid (`MACRODROID.md`) para
abrir o **Painel Digital (app)** em vez do PWA do navegador — ele já abre em
fullscreen e agora conta km em segundo plano, permitindo usar 99 Moto/Waze por cima.

## Perguntas comuns

- **Por que não funciona no iOS?** Não existe WebView/serviço de primeiro plano
  comparável acessível via web; para iOS, manter o painel em primeiro plano com tela
  sempre acesa continua sendo a única via (Wake Lock já ativo).
- **Posso mudar a URL do painel?** Sim: em `MainActivity.targetUrl()`.