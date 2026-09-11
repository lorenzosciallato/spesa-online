# Immagine ufficiale Playwright: ha gia' Chromium e tutte le librerie.
FROM mcr.microsoft.com/playwright:v1.56.1-noble

WORKDIR /app
ENV NODE_ENV=production \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
    CATALOGO=conad \
    CONAD_HEADLESS=1 \
    CONAD_PROFILO=/dati/profilo \
    PORT=3000

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY public ./public
COPY scripts ./scripts

VOLUME ["/dati"]
EXPOSE 3000
CMD ["node", "src/server.js"]
