FROM node:22-alpine

WORKDIR /app

RUN apk add --no-cache libc6-compat

ENV NODE_ENV=production
ENV PORT=3000

# Copy package files
COPY Diary_Chat_AI/package*.json ./
RUN npm install

# Copy application source
COPY Diary_Chat_AI/ ./

# Build Next.js
RUN npm run build

EXPOSE 3000

CMD ["npm", "start"]
