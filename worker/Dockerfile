# CECH Kane worker: Node 22 + Google Chrome + kane-cli.
# Deploy to any host that runs long-lived containers (Railway, Fly.io, Render, a VM).
FROM node:22-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends wget gnupg ca-certificates fonts-liberation \
  && wget -q -O /tmp/chrome.deb https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb \
  && apt-get install -y --no-install-recommends /tmp/chrome.deb \
  && rm -rf /tmp/chrome.deb /var/lib/apt/lists/*

RUN npm install -g @testmuai/kane-cli@0.10.7

WORKDIR /app
COPY package.json package-lock.json* tsconfig.json ./
RUN npm ci || npm install
COPY src ./src
RUN npm run build

ENV NODE_ENV=production PORT=8787 KANE_HEADLESS=true
EXPOSE 8787
# Runs as a non-root user; kane-cli stores its login profile in $HOME.
RUN useradd -m cech && chown -R cech /app
USER cech
CMD ["node", "dist/server.js"]
