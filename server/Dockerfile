FROM node:22.19-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .
RUN mkdir -p /app/data

ENV NODE_ENV=production
EXPOSE 3001

CMD ["node", "index.js"]
