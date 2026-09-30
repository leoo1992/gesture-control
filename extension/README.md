# Gesture Control Bridge

Este complemento conecta a página do Gesture Control ao navegador e ao aplicativo nativo do Windows.

## Instalação

1. Extraia o ZIP.
2. Abra `chrome://extensions/` ou `edge://extensions/`.
3. Ative **Modo do desenvolvedor**.
4. Clique em **Carregar sem compactação**.
5. Escolha a pasta `gesture-control-extension`.

A versão 0.2.0 possui um ID estável para permitir a comunicação segura com o aplicativo nativo do Windows.

Se você já utilizava uma versão anterior do complemento, remova a versão antiga e carregue novamente esta pasta.

## Modos

- Sem o aplicativo Windows: controla páginas comuns do navegador.
- Com o aplicativo Windows instalado: envia os comandos para o cursor real do Windows e mostra a mão em um overlay transparente sobre todas as janelas.

Páginas internas como `chrome://extensions/` continuam protegidas contra content scripts, mas o modo global do Windows controla o cursor real do sistema.
