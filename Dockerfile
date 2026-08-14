FROM node:22-alpine AS dependencies

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

FROM dependencies AS development

COPY . .

EXPOSE 5173

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173"]

FROM dependencies AS check

ARG VITE_BASE_PATH=/
ENV VITE_BASE_PATH=${VITE_BASE_PATH}

COPY . .

CMD ["sh", "-c", "npm run typecheck && npm run test:run && npm run build"]

FROM dependencies AS build

ARG VITE_BASE_PATH=/
ENV VITE_BASE_PATH=${VITE_BASE_PATH}

COPY . .

RUN npm run typecheck && npm run test:run && npm run build

FROM mcr.microsoft.com/playwright:v1.62.1-noble AS e2e

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

CMD ["npm", "run", "test:e2e"]

FROM node:22-alpine AS preview

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY --from=build /app/dist ./dist

EXPOSE 4173

CMD ["npm", "run", "preview", "--", "--host", "0.0.0.0", "--port", "4173"]
