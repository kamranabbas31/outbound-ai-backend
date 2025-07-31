# 1. Use official Node.js image
FROM node:20-alpine

# 2. Set working directory
WORKDIR /app

# 3. Copy package files and install dependencies
COPY package*.json ./

# Install pm2 globally
RUN npm install -g pm2 && npm install

# 4. Copy the rest of your files
COPY . .

# 5. Generate Prisma client
RUN npx prisma generate

# 5. Build the project
RUN npm run build

# 6. Copy PM2 process file
COPY pm2.config.js .

# 7. Start both the main app and worker
CMD ["pm2-runtime", "pm2.config.js"]
