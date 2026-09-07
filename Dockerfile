FROM node:20-alpine

WORKDIR /app

COPY package*.json ./

RUN npm ci --omit=dev

COPY prisma ./prisma/
RUN npx prisma generate

COPY . .

EXPOSE 5000

CMD ["sh", "-c", "chmod +x start.sh && ./start.sh"]
