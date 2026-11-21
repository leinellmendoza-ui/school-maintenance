FROM node:20-alpine

# Install OpenSSL for Prisma
RUN apk add --no-cache openssl

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of your code
COPY . .

# --- THE FIX ---
# Provide a dummy URL so Prisma can generate during the build phase
ENV DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy"

# Generate the Prisma client
RUN npx prisma generate
# ----------------

EXPOSE 8080

# Start the app
CMD ["npx", "tsx", "src/index.ts"]