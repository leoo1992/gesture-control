# Gesture Control Bridge

1. Abra `chrome://extensions` no Chrome/Edge.
2. Ative **Modo do desenvolvedor**.
3. Clique em **Carregar sem compactação**.
4. Selecione a pasta `extension/` deste repositório.
5. Recarregue a página `/desktop` do Gesture Control.

A extensão recebe comandos do receptor WebRTC e os encaminha para a aba ativa. Em páginas comuns ela desenha um cursor e um HUD com o esqueleto remoto da mão. Páginas internas do navegador (`chrome://`, loja de extensões etc.) não permitem injeção de content scripts.
