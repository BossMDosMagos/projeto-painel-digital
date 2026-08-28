# Painel Digital GPS para Moto

Aplicação web PWA ultraleve que transforma o smartphone em painel digital de moto estilo LCD segmentado.

## 🎯 Características

- **Velocímetro GPS** - Velocidade em tempo real via Geolocation API (km/h)
- **Hodômetros** - TRIP A (parcial, com reset) + ODO Total (com calibração inicial)
- **Relógio 24h** - Sincronizado em tempo real
- **Indicadores** - Status GPS (conectado/buscando/sem sinal) + Bateria do dispositivo
- **Estética LCD** - Fundo cinza #D1D6D3, dígitos pretos #0D0D0D, fonte segmentada Orbitron
- **Mobile-First** - Responsivo fluido com CSS clamp(), pronto para split-screen
- **Wake Lock** - Mantém tela acesa durante pilotagem
- **Persistência** - localStorage auto-save (sobrevive a reload/fechamento)
- **PWA** - Instalável, funciona offline via Service Worker

## 🚀 Como Executar

### Opção 1: Servidor Local (Recomendado)
```bash
# Python 3
python -m http.server 8080

# Node.js
npx serve .

# PHP
php -S localhost:8080
```
Acesse `http://localhost:8080` no celular.

### Opção 2: HTTPS Local (Necessário para GPS + Wake Lock + PWA)
```bash
# mkcert para certificado local confiável
mkcert localhost 127.0.0.1 ::1

# Servidor com HTTPS
npx serve -l 8080 --ssl-cert localhost.pem --ssl-key localhost-key.pem
```

### Opção 3: Deploy Rápido
- **Netlify/Vercel**: Arraste a pasta para deploy
- **GitHub Pages**: Push para repo e ative Pages
- **Cloudflare Pages**: Conecte repo

> ⚠️ **GPS, Wake Lock e PWA exigem HTTPS** (ou localhost). HTTP não funcionará no celular.

## 📱 Instalação no Celular (PWA)

1. Abra no Chrome/Edge/Safari mobile via HTTPS
2. Menu → "Instalar app" / "Adicionar à tela inicial"
3. Ícone aparece no launcher como app nativo
4. Abre em tela cheia (fullscreen)

## 🧪 Testes

Abra `test-harness.html` no navegador e clique em **Executar Todos os Testes**.

22 testes cobrindo:
- Layout & Responsividade (6)
- Funcionalidades Core (6)
- Persistência & APIs Nativas (4)
- Estética LCD (3)
- PWA & Acessibilidade (3)

## 🎨 Personalização

### Ajustar ODO Inicial
1. Toque em **AJUSTAR ODO**
2. Digite a quilometragem real do hodômetro da moto
3. Confirme - o app soma automaticamente o TRIP A ao valor base

### Resetar TRIP A
- Toque em **RESET TRIP** (área ampla para uso com luva)

## 🔧 Tecnologias

- **HTML5** semântico + ARIA
- **CSS3** - Custom Properties, clamp(), Grid/Flex, Media Queries
- **Vanilla JS** - ES Modules, Geolocation, Wake Lock, Battery, localStorage
- **PWA** - Manifest + Service Worker (cache-first)
- **Fontes** - Orbitron (Google Fonts) + fallbacks locais

## 📐 Breakpoints Testados

| Dispositivo | Largura | Layout |
|-------------|---------|--------|
| Galaxy Fold | 280px | Portrait stack |
| iPhone SE | 375px | Standard |
| Pixel 7 | 412px | Standard |
| Split 50% | ~180px | Compacto |
| Split 30% | ~120px | Mínimo |
| Landscape | 500px altura | Compacto |

## 🛡️ Permissões Necessárias

- **Localização** (GPS) - Obrigatório para velocímetro
- **Wake Lock** - Automático ao carregar
- **Bateria** - Somente leitura, sem prompt

## 📄 Licença

MIT - Livre para uso pessoal e comercial.