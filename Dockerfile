FROM node:20-slim

# Patchright + Pokémon Center monitor needs full Google Chrome (not headless-shell)
# and a virtual framebuffer because Imperva detects --headless reliably.
# We run Chrome through xvfb-run and use channel: 'chrome', headless: false.

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl gnupg wget fonts-liberation \
    libasound2 libatk-bridge2.0-0 libatk1.0-0 libcairo2 libcups2 libdbus-1-3 \
    libdrm2 libgbm1 libglib2.0-0 libgtk-3-0 libnspr4 libnss3 libpango-1.0-0 \
    libx11-6 libx11-xcb1 libxcb1 libxcomposite1 libxdamage1 libxext6 libxfixes3 \
    libxkbcommon0 libxrandr2 libxshmfence1 xdg-utils xvfb \
  && curl -fsSL https://dl.google.com/linux/linux_signing_key.pub | gpg --dearmor -o /etc/apt/keyrings/google.gpg \
  && echo "deb [signed-by=/etc/apt/keyrings/google.gpg] https://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google-chrome.list \
  && apt-get update && apt-get install -y --no-install-recommends google-chrome-stable \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

# Patchright needs to know about the Chrome binary it'll launch via channel: 'chrome'.
# patchright install chrome verifies/downloads its own copy of Chrome stable.
RUN npx patchright install chrome || true

COPY . .

EXPOSE 3456

# Use xvfb-run so Chrome can run "headed" (required to bypass Imperva's
# headless detection) without a real display.
CMD ["xvfb-run", "--auto-servernum", "--server-args=-screen 0 1440x900x24", "node", "server.js"]
