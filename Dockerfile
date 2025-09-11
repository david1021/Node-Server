FROM alpine:3.22.1
RUN apk add --no-cache nodejs npm
WORKDIR /usr/local/app
COPY package*.json ./
RUN npm install
COPY ./src ./src
EXPOSE 5000
CMD ["npm", "run", "devStart"]