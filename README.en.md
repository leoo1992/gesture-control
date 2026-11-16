# Gesture Control — Mobile to Windows

Control a browser and Windows desktop using hand movements captured by a mobile phone camera. The browser mode controls supported web pages; the global Windows mode uses a native application and browser Native Messaging.

## Architecture
- Mobile camera and MediaPipe Hands
- WebRTC / PeerJS for transmitting landmarks and commands
- Chrome/Edge extension
- Native Windows host for cursor, click, scroll, shortcuts, and hand overlay

The camera video stays on the phone; only hand landmarks and commands are transmitted.

## Stack
- Next.js / React / TypeScript
- MediaPipe Hands
- WebRTC / PeerJS
- Chrome/Edge extension and Windows native host

## Run
Follow the setup instructions in the repository for the web app, browser extension, and Windows host. The global control mode requires the native host to be installed and registered with Chrome or Edge.
