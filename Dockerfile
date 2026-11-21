FROM node:20-alpine

# Install OpenSSL (needed for Prisma)
RUN apk add --no-cache openssl

WORKDIR /app

# Copy package files first for better caching
COPY package*.json ./

# Install dependencies (ignore scripts to avoid premature prisma generate)
RUN npm install --ignore-scripts

# Copy the rest of the app
COPY . .

# Generate Prisma Client (now that schema.prisma is available)
RUN npx prisma generate

EXPOSE 8080

# Start the app with the correct path for Linux
CMD ["npx", "tsx", "src/index.ts"]