FROM node:20
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /app
COPY . .
RUN pnpm install --no-frozen-lockfile
RUN pnpm --filter @workspace/api-server build
CMD ["pnpm", "--filter", "@workspace/api-server", "start"]