FROM node:22-bookworm-slim

ENV NODE_ENV=production \
    HOME=/home/node \
    HOST=0.0.0.0 \
    PORT=4317 \
    OUTLINE_CONTAINER=1 \
    OUTLINE_DATA_DIR=/app/data \
    OUTLINE_PYTHON=/opt/outline-venv/bin/python \
    CODEX_HOME=/home/node/.codex \
    CLAUDE_CONFIG_DIR=/home/node/.claude
WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-venv zip git ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY requirements.txt ./
RUN python3 -m venv /opt/outline-venv \
    && /opt/outline-venv/bin/pip install --no-cache-dir -r requirements.txt
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY . .
RUN mkdir -p /app/data /home/node/.codex /home/node/.claude \
    && chown -R node:node /app/data /home/node \
    && chmod 700 /app/data \
    && chmod +x scripts/docker-entrypoint.sh
USER node
EXPOSE 4317
HEALTHCHECK --interval=20s --timeout=5s --start-period=30s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:4317/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
ENTRYPOINT ["./scripts/docker-entrypoint.sh"]
CMD ["node", "server.mjs"]
