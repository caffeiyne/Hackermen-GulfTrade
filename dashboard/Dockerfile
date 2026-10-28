FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm install

# Copy application code
COPY . .

# Expose port
EXPOSE 3000

# Start dev server — binds to 0.0.0.0 so it's reachable on the LAN
CMD ["npm", "run", "dev", "--", "--hostname", "0.0.0.0"]
