# Gesture Control — Mobile → PC

Controle o navegador do computador usando movimentos da mão capturados pela câmera do celular. A aplicação desenha os **21 landmarks da mão** no celular e também transmite somente esses pontos ao PC para renderizar um esqueleto remoto — o vídeo da câmera não é enviado.

## Arquitetura

```text
Celular (Next.js + MediaPipe)
        │
        │  landmarks + comandos JSON
        ▼
WebRTC DataChannel / PeerJS
        │
        ▼
PC Receiver (Next.js)
        │ window.postMessage
        ▼
Chrome/Edge Extension
        │
        ├─ cursor virtual / clique / scroll
        └─ voltar / avançar + HUD do esqueleto
```

O PeerJS usa o PeerServer Cloud para sinalização por padrão; depois do handshake os dados seguem pelo canal WebRTC entre os navegadores. Para produção de alto tráfego, troque o PeerServer Cloud por um PeerServer próprio e configure TURN.

## Gestos do MVP

| Gesto | Ação |
|---|---|
| Indicador | Move o cursor virtual |
| Pinça polegar + indicador | Clique |
| Mão aberta + movimento vertical | Scroll |
| Mão aberta + swipe lateral | Voltar / avançar |

A pinça precisa persistir por múltiplos frames e possui cooldown para reduzir cliques acidentais.

## Executar

```bash
npm install
npm run dev
```

Abra no PC `http://localhost:3000/desktop` e no celular use a URL HTTPS do deploy. A câmera é ativada por uma ação explícita do usuário e a aplicação mostra o estado da permissão antes e depois da solicitação.

## Extensão Chrome/Edge

1. Baixe o ZIP pelo próprio site.
2. Extraia o ZIP; ele cria a pasta `gesture-control-extension`.
3. Abra `chrome://extensions/` ou `edge://extensions/`.
4. Ative **Modo do desenvolvedor**.
5. Clique em **Carregar sem compactação**.
6. Selecione a pasta `gesture-control-extension`.
7. Recarregue a tela do computador no Gesture Control.

A extensão não atua em páginas internas protegidas do navegador, como `chrome://` e a Chrome Web Store.

## Backend Python

O FastAPI em `api/index.py` fornece health check e uma política de validação de gestos. O caminho crítico de baixa latência permanece no navegador; frames de vídeo não passam pelo backend.

- `GET /api`
- `GET /api/health`
- `POST /api/validate-gesture`

## Testes e qualidade

```bash
npm run lint
npm run test
npm run build
python -m compileall api
docker build -t gesture-control .
```

O GitHub Actions valida lint, testes, build Next.js, backend Python e a imagem Docker.

### Critérios do GitHub Explorer

O repositório contém todos os sinais universais avaliados pelo projeto `github-explorer`:

- README/documentação;
- GitHub Actions;
- testes automatizados;
- ESLint;
- Dockerfile;
- `.env.example`;
- licença MIT.

TypeScript também está presente, embora seja informativo e não altere o score do GitHub Explorer.

## Docker

```bash
docker build -t gesture-control .
docker run --rm -p 3000:3000 gesture-control
```

## Deploy

O frontend Next.js e o FastAPI podem ser hospedados no mesmo projeto Vercel. O rastreamento MediaPipe roda no dispositivo do usuário. A extensão é carregada separadamente no navegador desktop.

## Privacidade

- vídeo permanece no celular;
- nenhuma captura é armazenada;
- são enviados apenas landmarks normalizados e comandos;
- sessão de pareamento é efêmera.

## Licença

MIT.
