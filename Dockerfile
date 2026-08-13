# Dockerfile for PulseQueue Backend Engine
FROM node:20-alpine

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
COPY prisma ./prisma/

RUN npm install

# Copy source code
COPY . .

# Generate Prisma Client
RUN npx prisma generate

# Build TypeScript code
RUN npm run build

EXPOSE 3000

# Start server
CMD ["npm", "start"]
