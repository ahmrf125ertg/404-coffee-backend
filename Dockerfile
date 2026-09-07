FROM node:20-alpine

WORKDIR /app

COPY package*.json ./

RUN npm ci --omit=dev

COPY prisma ./prisma/
RUN npx prisma generate

COPY . .

EXPOSE 5000

CMD ["sh", "-c", "echo 'Running migrations...' && npx prisma migrate deploy 2>&1; echo 'Starting server...' && node src/server.js"]
