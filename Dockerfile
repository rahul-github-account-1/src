FROM node:18-slim

RUN apt-get update && apt-get install -y \
    python3 make g++ build-essential \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
CMD ["node", "index.js"] 