# Velocímetro GPS Moto (Analógico)

PWA ultraleve que transforma o smartphone em um **painel de moto analógico** com velocímetro de agulha, odômetro total e parcial, relógio 24h e GPS em tempo real.

## 🎯 Características

- **Velocímetro analógico** — mostrador SVG 0–200 km/h com agulha de movimento suave (física de mola)
- **GPS em tempo real** — velocidade via `watchPosition` + `Haversine`, com LED de precisão (verde/amarelo/apagado)
- **Odômetros** — ODO Total (com calibração) + TRIP parcial (reset com um toque)
- **Relógio 24h** — estilo LCD, sincronizado em tempo real
- **Modo Noturno** — automático baseado em horário ou manual, com cores de traços/números customizáveis
- **Wake Lock** — mantém a tela acesa durante a pilotagem (compatibilidade delegada pelo SO quando em pause)
- **Persistência** — `localStorage` auto-save (ODO, TRIP, preferências noturnas)
- **PWA instalável** — offline-first via Service Worker com cache + atualização em segundo plano
- **Mobile-First** — `clamp()`, `100dvh`, safe-area insets (notch/pill), targets de toque ≥ 46px

## 🚀 Como Executar

### Local (desenvolvimento)
```bash
python -m http.server 8080
```
Abra `http://localhost:8080`.

> ⚠️ **GPS, Wake Lock e PWA exigem HTTPS** (ou localhost). Em produção use HTTPS.

### Produção (gratuito, com HTTPS)
- **Vercel / Netlify**: importe o repositório → deploy automático
- **GitHub Pages**: Settings → Pages → Source: *Deploy from a branch* → `master` → `/ (root)`
- **Cloudflare Pages**: conecte o repositório (sem build, output: raiz)

## 📱 Instalação no Celular (PWA)

1. Abra a URL HTTPS no Chrome/Edge/Safari mobile
2. Menu → **Instalar app** / **Adicionar à tela inicial**
3. Abre em tela cheia como app nativo

## 🎮 Interações

| Gesto | Ação |
|-------|------|
| Toque no TRIP | Zera o odômetro parcial |
| Toque no ODO total | Abre configurações |
| **Segurar o dedo fora do painel (800 ms)** | Abre o painel de configurações |
| Tecla `N` (desktop) | Alterna dia/noite |
| Setas ↑/↓ (desktop) | Simula aceleração/freio (sem GPS) |

### Painel de Configurações
- **Calibrar ODO** — define a quilometragem real da moto
- **Zerar Trip** — reseta o odômetro parcial
- **Modo Noturno** — cores customizadas de traços e números + toggle manual

## 🛡️ Permissões

- **Localização (GPS)** — obrigatória para velocidade em tempo real
- **Wake Lock** — solicitado automaticamente (silencioso, sem prompt)

## 🔧 Tecnologias

- **HTML5** — `dialog` nativo para configurações
- **CSS3** — Custom Properties, Gradients, `env(safe-area-inset-*)`, Media Queries
- **Vanilla JS** — Geolocation, Haversine, Wake Lock, `requestAnimationFrame`
- **PWA** — Manifest + Service Worker (cache-first com atualização em background)
- **Fontes** — Titillium Web (mostrador) + DS-Digital (relógio LCD local, offline)

## 🗂️ Estrutura

```
├── index.html        # Painel + dialog de configurações
├── style.css         # Estilos (modo dia/noite, toasts, dialogo, relógio LCD)
├── main.js           # GPS, física da agulha, odômetros, relógio, config
├── manifest.json     # Manifest PWA
├── sw.js             # Service Worker (offline-first)
├── DS-DIGIB.TTF      # Fonte LCD do relógio (+ DIGITAL.TXT, licença do autor)
└── icons/            # Ícones PNG 192/512 (any + maskable)
```

## 📄 Licença

MIT — livre para uso pessoal e comercial.