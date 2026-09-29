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

Abra no PC `http://localhost:3000/desktop` e no celular use a URL HTTPS do deploy (câmera mobile exige contexto seguro). Digite no celular o código de 6 dígitos mostrado no PC.

## Extensão Chrome/Edge

1. Abra `chrome://extensions`.
2. Ative **Modo do desenvolvedor**.
3. Clique em **Carregar sem compactação**.
4. Selecione `extension/`.
5. Recarregue `/desktop`.
6. Depois do pareamento, mude para uma página comum e controle-a com a mão.

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
```

O GitHub Actions executa as quatro validações em pushes e pull requests.

## Deploy

O frontend Next.js e o FastAPI podem ser hospedados no mesmo projeto Vercel. O rastreamento MediaPipe roda no dispositivo do usuário. A extensão é carregada separadamente no navegador desktop.

## Privacidade

- vídeo permanece no celular;
- nenhuma captura é armazenada;
- são enviados apenas landmarks normalizados e comandos;
- sessão de pareamento é efêmera.

## Licença

MIT.
