# Gesture Control — Mobile → Windows

Controle o navegador e o próprio Windows usando movimentos da mão capturados pela câmera do celular.

A aplicação possui dois modos:

- **Modo navegador:** funciona apenas em páginas comuns do Chrome/Edge.
- **Modo global do Windows:** usa um aplicativo nativo para mover o cursor real, clicar, rolar, executar atalhos e desenhar o esqueleto da mão sobre todas as janelas.

## Arquitetura

```text
Celular
  │
  │ câmera + MediaPipe Hands
  │ landmarks + comandos
  ▼
WebRTC / PeerJS
  ▼
Página do PC
  │
  ▼
Extensão Chrome/Edge
  │
  ├─ fallback: controla a página atual
  │
  └─ Native Messaging
       ▼
GestureControl.Windows.exe
       ├─ cursor real do Windows
       ├─ clique / scroll / atalhos
       └─ overlay transparente da mão
```

O vídeo da câmera permanece no celular. São transmitidos apenas landmarks e comandos.

## Gestos

| Gesto | Ação |
|---|---|
| Indicador | Move o cursor |
| Pinça polegar + indicador | Clique |
| Mão aberta + movimento vertical | Scroll |
| Mão aberta + swipe lateral | Voltar / avançar |

## Controle global do Windows

O aplicativo nativo é um host de **Chrome/Edge Native Messaging**.

Ele é executado automaticamente pela extensão e usa APIs nativas do Windows para:

- mover o cursor real;
- clique esquerdo;
- scroll;
- atalhos de navegação;
- overlay click-through sempre no topo;
- desenho da mão com linhas verdes e pontos vermelhos.

### Instalação

A própria tela **Estou no computador** orienta o processo:

1. instale/reinstale a extensão atual;
2. baixe `GestureControl.Windows.exe`;
3. execute o arquivo uma vez;
4. volte ao navegador;
5. aguarde o status **Controle global ativo**.

O executável se copia para:

```text
%LOCALAPPDATA%\GestureControl\GestureControl.Windows.exe
```

e registra o host Native Messaging apenas para o usuário atual.

### Atalho de segurança

```text
Ctrl + Alt + G
```

Pausa ou retoma imediatamente a injeção de mouse/teclado. O overlay informa quando o controle está pausado.

## Extensão Chrome/Edge

A versão 0.2.0 possui um ID estável para permitir a conexão segura com o host nativo.

Se uma versão anterior da extensão já estiver instalada:

1. remova a extensão antiga;
2. baixe novamente o ZIP pelo Gesture Control;
3. abra `chrome://extensions/` ou `edge://extensions/`;
4. ative **Modo do desenvolvedor**;
5. use **Carregar sem compactação**;
6. selecione a pasta `gesture-control-extension`.

## Executar o site

```bash
npm install
npm run dev
```

## Testes e qualidade

```bash
npm run lint
npm run test
npm run build
python -m compileall api
docker build -t gesture-control .
dotnet build windows-agent/GestureControl.Windows.csproj -c Release
```

O CI valida frontend, testes, Docker, Python e o aplicativo Windows.

## Privacidade

- vídeo permanece no celular;
- nenhuma captura é armazenada;
- somente landmarks/comandos atravessam a conexão;
- o host Windows é local;
- o overlay é visual e não captura a tela.

## Limitações

O controle global usa APIs de entrada do Windows e funciona sobre aplicativos normais. Janelas elevadas como administrador podem exigir que o aplicativo de controle esteja no mesmo nível de privilégio. O executável publicado automaticamente não possui assinatura comercial de código, então o Windows SmartScreen pode exibir um aviso na primeira execução.

## Licença

MIT.