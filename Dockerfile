FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --ignore-scripts
COPY . .
EXPOSE 8080
CMD ["npx", "tsx", "src/index.ts"]