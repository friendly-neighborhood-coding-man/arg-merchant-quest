# Production image for one Next.js process on a Railway service with a volume
# mounted at /data (see docs/DEPLOYMENT.md).
#
# The app uses node:sqlite (DatabaseSync), which needs Node 22.5 or newer, and
# SQLite needs a real local filesystem: the volume is the database, so this
# service must never run more than one replica.
FROM node:24-bookworm-slim

WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# Dev dependencies are needed for `next build` (TypeScript, Tailwind), so the
# install happens before NODE_ENV is switched to production.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# `next start` reads PORT and HOSTNAME; Railway routes to the injected PORT and
# the process has to listen on all interfaces.
ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    ARG_DATA_DIR=/data

EXPOSE 3000
CMD ["npm", "start"]
