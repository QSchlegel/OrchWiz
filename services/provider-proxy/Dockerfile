FROM node:20-bookworm-slim AS runtime

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src

RUN npm run build

# Codex CLI for ChatGPT-backed auth + execution.
RUN npm install -g @openai/codex

ENV NODE_ENV=production
ENV PROVIDER_PROXY_HOST=0.0.0.0
ENV PROVIDER_PROXY_PORT=4000

EXPOSE 4000

CMD ["node", "dist/server.js"]

