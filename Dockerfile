FROM node:20-alpine

# Set working directory
WORKDIR /usr/src/app

# Install app dependencies
# A wildcard is used to ensure both package.json AND package-lock.json are copied
COPY package*.json ./

# Install dependencies (production only if preferred, but doing all for now)
RUN npm install --production

# Bundle app source
COPY . .

# Expose port
EXPOSE 3000

# Start command
CMD [ "npm", "start" ]
