FROM node:20-alpine

WORKDIR /app

COPY package*.json ./

RUN npm ci --omit=dev

COPY prisma ./prisma/
RUN npx prisma generate

COPY . .

EXPOSE 5000

CMD ["sh", "-c", "echo \"DATABASE_URL set: $([ -n \"$DATABASE_URL\" ] && echo 'yes' || echo 'no')\" && npx prisma migrate deploy && echo 'Migration done' || echo 'Migration failed' && node src/server.js"]
