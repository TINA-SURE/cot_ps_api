# Usar la imagen base de Ubuntu Server 24.04 LTS
FROM ubuntu:22.04

# Establecer el directorio de trabajo
WORKDIR /app

# Actualizar el sistema e instalar dependencias necesarias
RUN apt-get update && apt-get install -y \
    wget \
    ca-certificates \
    libx11-xcb-dev \
    libxcomposite-dev \
    libxrandr-dev \
    libatk-bridge2.0-dev \
    libatk1.0-dev \
    libgdk-pixbuf2.0-dev \
    libcups2 \
    libxss1 \
    libnss3 \
    libgconf-2-4 \
    libasound2 \
    libxtst6 \
    libgtk-3-0 \
    libappindicator3-1 \
    libnspr4 \
    libx11-6 \
    chromium-browser \
    && apt-get clean

# Verificar ubicación de Chromium
RUN which chromium-browser

# Instalar Node.js y npm
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && \
    npm install -g npm@latest

# Instalar dependencias globales de Puppeteer y otras librerías
RUN npm install -g puppeteer-extra puppeteer-extra-plugin-stealth \
    tesseract.js sharp axios string-similarity express cors faker @faker-js/faker user-agents

# Copiar el código fuente al contenedor
COPY . .

# Instalar dependencias del proyecto
RUN npm install

# Configurar variables de entorno necesarias
ENV NODE_TLS_REJECT_UNAUTHORIZED=0

# Exponer el puerto 3000 para la aplicación
EXPOSE 3003

# Comando de inicio
CMD ["node", "app.js"]
