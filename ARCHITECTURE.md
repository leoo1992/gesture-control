# Arquitetura

O Gesture Control é dividido em três blocos:

- **Web / Next.js**: câmera, MediaPipe, reconhecimento de gestos e interface.
- **API local**: ponte entre a aplicação web e recursos locais.
- **Windows Agent**: companion .NET responsável pelo controle global do Windows.

A entrega é validada por GitHub Actions com type checking, lint, testes, cobertura mínima de 80%, build web, compilação Python, build do companion Windows e build do container.
