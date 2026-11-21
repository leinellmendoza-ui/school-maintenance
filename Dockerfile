FROM node:20-alpine

# Install system dependencies needed for native modules like bcrypt
RUN apk add --no-cache openssl python3 make g++

WORKDIR /app

# Copy package files first to leverage Docker caching
COPY package*.json ./

# Install dependencies but skip scripts to prevent Prisma from running prematurely
RUN npm install --ignore-scripts

# Copy the rest of your application code
COPY . .

# Provide dummy URLs for the build phase
ENV DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy"
ENV DATABASE_URL_UNPOOLED="postgresql://dummy:dummy@localhost:5432/dummy"

# Generate the Prisma client now that all files are present
RUN npx prisma generate

EXPOSE 8080

# Start the application
CMD ["npx", "tsx", "src/index.ts"]