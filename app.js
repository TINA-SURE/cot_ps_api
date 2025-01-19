
/* REQUIREMENTS */

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

//const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const puppeteer = require('puppeteer');
const https = require("https");
const CryptoJS = require("crypto-js");
const Tesseract = require('tesseract.js');
const sharp = require('sharp');
const axios = require('axios');
const stringSimilarity = require('string-similarity');
const fs = require('fs')
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const UserAgent = require('user-agents');
const { faker } = require('@faker-js/faker');
const agent = new https.Agent({ rejectUnauthorized: false, });

/* DATA GLOBAL */

const zonaspositiva = [{ "id": 1, "name": "AMAZONAS" }, { "id": 2, "name": "ANCASH" }, { "id": 3, "name": "APURIMAC" }, { "id": 4, "name": "AREQUIPA" }, { "id": 5, "name": "AYACUCHO" }, { "id": 6, "name": "CAJAMARCA" }, { "id": 7, "name": "CALLAO" }, { "id": 8, "name": "CUSCO" }, { "id": 9, "name": "HUANCAVELICA" }, { "id": 10, "name": "HUANUCO" }, { "id": 11, "name": "ICA" }, { "id": 12, "name": "JUNIN" }, { "id": 13, "name": "LA LIBERTAD" }, { "id": 14, "name": "LAMBAYEQUE" }, { "id": 15, "name": "LIMA" }, { "id": 16, "name": "LORETO" }, { "id": 17, "name": "MADRE DE DIOS" }, { "id": 18, "name": "MOQUEGUA" }, { "id": 19, "name": "PASCO" }, { "id": 20, "name": "PIURA" }, { "id": 21, "name": "PUNO" }, { "id": 22, "name": "SAN MARTIN" }, { "id": 23, "name": "TACNA" }, { "id": 24, "name": "TUMBES" }, { "id": 25, "name": "UCAYALI" }];
let brandsArrayPositiva = JSON.parse(fs.readFileSync("MARCAS/positiva.json", "utf-8"));
let brandsArray = JSON.parse(fs.readFileSync("MARCAS/pacifico.json", "utf-8"));


/* FUNCIONES CON ACCESO GLOBAL */

async function launchBrowser(profileId, userAgent, viewport) {
    const profilePath = path.join(__dirname, 'profiles', profileId);

    // Crear el directorio del perfil si no existe
    if (!fs.existsSync(profilePath)) {
        fs.mkdirSync(profilePath, { recursive: true });
    }

    const browser = await puppeteer.launch({
        headless: true,
        userDataDir: profilePath,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-blink-features=AutomationControlled', 
            '--disable-infobars', 
            '--disable-dev-shm-usage',
            `--user-agent=${userAgent}`, // Configurar User-Agent
            '--lang=es-ES,es', // Configurar idioma del navegador
        ],
        executablePath: '/usr/bin/chromium-browser',
    });

    const page = await browser.newPage();

    // Configurar User-Agent
    await page.setUserAgent(userAgent);

    // Configurar viewport
    await page.setViewport(viewport);

    // Configurar cabeceras HTTP para español
    await page.setExtraHTTPHeaders({
        'Accept-Language': 'es-ES,es;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
    });

    // Inyectar scripts para evitar detección y configurar idioma en navigator
    await page.evaluateOnNewDocument(() => {
        // Ocultar propiedad webdriver
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        // Simular plugins instalados
        Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3] });
        // Configurar idiomas en español
        Object.defineProperty(navigator, 'languages', { get: () => ['es-ES', 'es'] });
    });

    // Retornar navegador, página y ruta del perfil
    return { browser, page, profilePath };
}

async function deleteProfile(profilePath) {
    try {
        fs.rmSync(profilePath, { recursive: true, force: true });
    } catch (error) {
    }
}

async function positivaconsulta(placa, dni) {
    try {
        const maxIntentosIniciales = 3; // Intentos máximos para la consulta inicial
        let intentosIniciales = 0;

        let response;
        while (intentosIniciales < maxIntentosIniciales) {
            try {
                // response = await axios.post("http://localhost:3004/consulta/", { "placa": placa }); - PARA COTIZADOR NORMAL
                response = await axios.post("http://217.15.175.55:3010/consulta/", { "placa": placa, "dni": dni });
                break; // Si tiene éxito, salimos del bucle
            } catch (error) {
                intentosIniciales++;
                console.error(`Error en consulta principal (intento ${intentosIniciales}):`, error.message);
                if (intentosIniciales >= maxIntentosIniciales) {
                    console.error("No se pudo completar la consulta inicial después de varios intentos.");
                    return "Error en consulta inicial";
                }
                await delay(3000); // Esperar 3 segundos antes de reintentar
            }
        }

        const consultaId = response?.data?.consultaId;
        if (!consultaId) {
            console.error("consultaId no recibido en la respuesta inicial");
            return "Error en consulta inicial";
        }

        let completado = false;
        let resultado;
        let intentos = 0;
        const maxIntentos = 150;

        while (!completado && intentos < maxIntentos) {
            try {
                // const consulta = await axios.post(`http://localhost:3004/consulta/${consultaId}`); - PARA COTIZADOR NORMAL
                const consulta = await axios.post(`http://217.15.175.55:3010/consulta/${consultaId}`);
                if (consulta.data && consulta.data.estado) {
                    if (consulta.data.estado === 'en proceso') {
                        completado = false;
                        intentos++;
                        await delay(10000); // Espera antes de volver a intentar
                    } else if (consulta.data.estado === 'completado') {
                        completado = true;
                        // resultado = consulta.data.resultado; - PARA COTIZADOR NORMAL
                        resultado = consulta.data?.resultado?.Tarifa?.Monto?.toString();
                    } else {
                        throw new Error(`Estado inesperado: ${consulta.data.estado}`);
                    }
                } else {
                    throw new Error("Respuesta inesperada del servidor");
                }
            } catch (error) {
                console.error("Error en consulta de estado:", error.message);
                intentos++;
                await delay(6000); // Espera antes de intentar de nuevo si hay un error en la consulta
            }
        }

        if (!completado) {
            console.warn(`No se pudo completar la consulta después de ${maxIntentos} intentos.`);
            return "Consulta no completada";
        }

        return resultado;
    } catch (error) {
        return "Error en consulta";
    }
}

function generateDesktopUserAgent() {
    const userAgent = new UserAgent({ deviceCategory: 'desktop' });
    return userAgent.toString();
}

function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getRandomNumberForIP() {
    const dato1 = Math.floor(Math.random() * (250 - 150 + 1)) + 150;
    const dato2 = Math.floor(Math.random() * (250 - 150 + 1)) + 150;
    const dato3 = Math.floor(Math.random() * (250 - 150 + 1)) + 150;
    const dato4 = Math.floor(Math.random() * (250 - 150 + 1)) + 150;
    return dato1 + "." + dato2 + "." + dato3 + "." + dato4;
}

function generateUniqueId() {
    return crypto.randomBytes(16).toString('hex');
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/* COTIZACION CON ENCAPSULAMIENTO INDIVIDUAL DE VARIABLES */

async function ENCAPSULAMIENTO(placa, dni) {
    let nrovin = Array.from({ length: 15 }, () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'[Math.floor(Math.random() * 36)]).join('');;
    let nrovinpositiva = "";
    let marca = "";
    let modelo = "";
    let anio = "2021";
    let nombremarcaparaarchivo = "";
    let nroreintento = 0;
    let placavalida = "Si";
    let pacificoResult, positivaResult;
    let sunarp;
    let iniciodetiempo = performance.now();
    let findetiempo = 0;
    let resultadofinal = { "claveautorizacion": "FJU7Y3GSYFEIUFR3", datos: {} };
    let genero, nombres, apellido_paterno, apellido_materno, fecha_nacimiento, nombre_completo, codigo_verificacion;

    try {
        function findClosestBrand(searchName) {
            try {
                const normalizedSearchName = searchName.trim().toUpperCase();
                for (const brand of brandsArray) {
                    if (brand.desMarca.trim().toUpperCase() === normalizedSearchName) {
                        return {
                            matchType: 'exact',
                            brand: brand
                        };
                    }
                }
                let bestMatch = null;
                let highestSimilarity = 0;
                for (const brand of brandsArray) {
                    const brandName = brand.desMarca.trim().toUpperCase();
                    const similarity = stringSimilarity.compareTwoStrings(normalizedSearchName, brandName);
                    if (similarity > highestSimilarity) {
                        highestSimilarity = similarity;
                        bestMatch = brand;
                    }
                }
                return {
                    matchType: 'closest',
                    brand: bestMatch,
                    similarity: highestSimilarity
                };
            } catch (error) {
                return {
                    matchType: 'closest',
                    brand: null,
                    similarity: 0
                }
            }
        }

        function findClosestModel(nombremarcaparaarchivo, modeloabuscar) {
            try {


                let data = "";
                let ruta = `MODELOS/PACIFICO/${nombremarcaparaarchivo}.json`;
                let rutalimpia = ruta.replace(" ", "");
                try {
                    data = fs.readFileSync(rutalimpia, 'utf-8');
                } catch (error) {
                    return "No se puede realizar la consulta";
                }

                let jsonData;
                try {
                    jsonData = JSON.parse(data);
                    if (!Array.isArray(jsonData)) {
                        throw new Error("El JSON no es un array");
                    }
                } catch (error) {
                    return "No se pudo parsear el JSON o el formato es incorrecto";
                }

                const normalizedSearchName = modeloabuscar.trim().toUpperCase();
                let bestMatch = null;
                let highestSimilarity = 0;

                // Buscar el mejor modelo similar
                for (const vehiculo of jsonData) {
                    if (vehiculo && vehiculo.modelo && vehiculo.modelo.descModelo) {
                        const modeloName = vehiculo.modelo.descModelo.trim().toUpperCase();
                        const similarity = stringSimilarity.compareTwoStrings(normalizedSearchName, modeloName);

                        if (similarity > highestSimilarity) {
                            highestSimilarity = similarity;
                            bestMatch = vehiculo;
                        }
                    }
                }

                // Si no se encuentra un buen match, elegir un modelo aleatorio
                if (!bestMatch && jsonData.length > 0) {
                    bestMatch = jsonData[Math.floor(Math.random() * jsonData.length)];
                }

                return {
                    matchType: bestMatch ? 'closest' : 'any',
                    vehiculo: bestMatch,
                    similarity: highestSimilarity
                };
            } catch (error) {
                return {
                    matchType: 'closest',
                    vehiculo: null,
                    similarity: 0
                }
            }
        }

        async function pacificoconsulta(placa) {
            try {
                let marcaaelegir = "";
                let modeloaelegir = "";
                try {
                    const result = findClosestBrand(marca);
                    marcaaelegir = result.brand.desMarca;
                    nombremarcaparaarchivo = result.brand.desMarca;
                    const resultadomodelo = findClosestModel(nombremarcaparaarchivo, modelo);
                    modeloaelegir = resultadomodelo.vehiculo.modelo.descModelo;
                } catch (error) {
                    if (sunarp == "La placa es inválida según SUNARP") {
                        return "Placa inválida según SUNARP"
                    } else {
                        return "No se puede realizar la consulta"
                    }
                }
                const width = getRandomInt(1200, 1300);
                const height = getRandomInt(595, 605);
                const profileId = generateUniqueId();
                const userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101";
                const viewport = { width: width, height: height };
                const { browser, page, profilePath } = await launchBrowser(profileId, userAgent, viewport);
                try {
                    await page.goto("https://soat.pacifico.com.pe/yape/derivacion/?numero-placa=" + placa, { waitUntil: 'load', timeout: 0 });
                    //await delay(1000)
                    //try {
                    //    await page.waitForSelector('body > div.ub-emb-container > div > div.ub-emb-overlay.ub-emb-visible > div.ub-emb-scroll-wrapper > div.ub-emb-iframe-wrapper.ub-emb-visible > iframe', { timeout: 30000 });
                    //    await browser.close();
                    //    await deleteProfile(profilePath);
                    //    return "Pacífico Seguros está en mantenimiento";
                    //} catch (error) { }
                    //await page.waitForSelector('#cotiza > div.flex.flex-col-reverse.tablet\\:block.lg\\:items-end.mx-auto > form > div.pacifico-ui-input > span > input');
                    //const inputElement = await page.$('#cotiza > div.flex.flex-col-reverse.tablet\\:block.lg\\:items-end.mx-auto > form > div.pacifico-ui-input > span > input');
                    //await inputElement.type(placa);
                    //const validandoplacamessage = 'div.h-\\[30px\\].flex.justify-center > p > span';
                    //await page.waitForSelector(validandoplacamessage, { visible: true });
                    //await page.waitForFunction(selector => {
                    //    return !document.querySelector(selector);
                    //}, {}, validandoplacamessage);

                    try {
                        await page.waitForSelector("#cotiza > div.flex.flex-col-reverse.tablet\\:block.lg\\:items-end.mx-auto > form > div.pt-5 > select", { timeout: 2000 })
                        const options = await page.evaluate(() => {
                            const selectElement = document.querySelector('#cotiza > div.flex.flex-col-reverse.tablet\\:block.lg\\:items-end.mx-auto > form > div.pt-5 > select');
                            const optionsArray = Array.from(selectElement.options);
                            return optionsArray.map(option => ({
                                text: option.text,
                                value: option.value
                            }));
                        });

                        const zonascirculacionOA = [
                            'Lima', 'Ucayali', 'San Martin', 'Madre de Dios', 'Huanuco', 'Amazonas',
                            'Loreto', 'Puno', 'Cusco', 'Apurimac', 'Cajamarca', 'Ancash', 'Arequipa',
                            'Lambayeque', 'Tacna', 'Huancavelica', 'Piura', 'Junin', 'Pasco', 'Tumbes',
                            'Ica', 'Moquegua', 'Ayacucho', 'La Libertad'
                        ];

                        const optionMap = new Map(options.map(option => [option.text, option]));
                        let elegido = null;

                        for (const zone of zonascirculacionOA) {
                            if (optionMap.has(zone)) {
                                elegido = optionMap.get(zone);
                                break;
                            }
                        }
                        await page.select('#cotiza > div.flex.flex-col-reverse.tablet\\:block.lg\\:items-end.mx-auto > form > div.pt-5 > select', elegido.value);
                        await delay(2000)
                        await page.waitForSelector("#cotiza > div.flex.flex-col-reverse.tablet\\:block.lg\\:items-end.mx-auto > form > div.mt-5.lg\\:mt-5 > button");
                        await page.click("#cotiza > div.flex.flex-col-reverse.tablet\\:block.lg\\:items-end.mx-auto > form > div.mt-5.lg\\:mt-5 > button")
                    } catch (error) {
                    }
                    await delay(500)

                    const pantalladecargaselector = 'div[data-testid="loading-overlay"]';
                    await page.waitForSelector(pantalladecargaselector, { visible: true });
                    await page.waitForFunction(selector => {
                        return !document.querySelector(selector);
                    }, {}, pantalladecargaselector);
                    try {
                        await page.waitForSelector('#modal-root > div:nth-child(5) > div > div > div > div.mx-auto.relative.pt-\\[80px\\].sm\\:pt-\\[108px\\] > button > span', { timeout: 3000 });
                        await browser.close();
                        await deleteProfile(profilePath);
                        nroreintento++
                        if (nroreintento < 4) {
                            return pacificoconsulta(placa);
                        } else {
                            return "Maximos reintentos excedidos"
                        }
                    } catch (error) { }
                    let pideinfo = false
                    try {
                        await page.waitForSelector("#modal-root > div:nth-child(5) > div > div > section > form > div > div.flex.flex-col.sm\\:flex-row.sm\\:justify-between.gap-y-5.gap-x-6.pb-\\[28px\\].lg\\:pb-\\[32px\\] > div.sm\\:w-\\[199px\\] > div.relative > input", { timeout: 5000 });
                        await page.type("#modal-root > div:nth-child(5) > div > div > section > form > div > div.flex.flex-col.sm\\:flex-row.sm\\:justify-between.gap-y-5.gap-x-6.pb-\\[28px\\].lg\\:pb-\\[32px\\] > div.sm\\:w-\\[199px\\] > div.relative > input", "9" + Array.from({ length: 8 }, () => Math.floor(Math.random() * 10)).join(''));
                        await delay(500);
                        await page.type("#modal-root > div:nth-child(5) > div > div > section > form > div > div.flex.flex-col.sm\\:flex-row.sm\\:justify-between.gap-y-5.gap-x-6.pb-\\[28px\\].lg\\:pb-\\[32px\\] > div.mt-1.sm\\:mt-0.sm\\:w-\\[290px\\] > div.relative > input", faker.internet.email().toLowerCase())
                        await delay(500);
                        await page.click("#modal-root > div:nth-child(5) > div > div > section > form > div > div.text-center.mx-auto.pt-\\[28px\\].w-\\[271px\\].sm\\:w-\\[285px\\].sm\\:pt-\\[18px\\] > button");
                    } catch (error) {
                        pideinfo = true;
                    }
                    if (pideinfo == true) {
                        try {
                            await page.waitForSelector("#react-select-6-input", { timeout: 20000 });
                            await page.click("#react-select-6-input");
                            await delay(500);

                            const brandElements = await page.evaluate(() => {
                                const elements = Array.from(document.querySelectorAll('.css-10wo9uf-option'));
                                return elements.map(el => ({
                                    id: el.id,
                                    text: el.innerText.trim()
                                }));
                            });

                            const matchingElement = brandElements.find(el => el.text === marcaaelegir);

                            if (matchingElement) {
                                page.click("#" + matchingElement.id);
                            }

                            await delay(3000);
                            await page.waitForSelector("#react-select-2-input");
                            await page.click("#react-select-2-input");
                            await delay(500);
                            if (modeloaelegir !== null) {
                                const modelElements = await page.evaluate(() => {
                                    const elements = Array.from(document.querySelectorAll('.css-10wo9uf-option'));
                                    return elements.map(el => ({
                                        id: el.id,
                                        text: el.innerText.trim()
                                    }));
                                });

                                const matchingModels = modelElements.filter(el => el.text === modeloaelegir);

                                if (matchingModels.length > 0) {

                                    if (matchingModels.length > 1) {
                                        await page.click("#" + matchingModels[1].id);
                                    } else {
                                        await page.click("#" + matchingModels[0].id);
                                    }
                                } else {
                                    await page.keyboard.press('Enter');
                                }
                            } else {
                                await page.keyboard.press('Enter');
                            }

                            await delay(500);
                            await page.click("#react-select-3-input");
                            await delay(500);
                            await page.type('#react-select-3-input', "2");
                            await delay(100);
                            await page.keyboard.press('Enter');
                            await delay(500);
                            await page.click("#react-select-4-input");
                            await delay(500);
                            await page.type("#react-select-4-input", anio);
                            await delay(100);
                            await page.keyboard.press('Enter');
                            await delay(500);
                            if (nrovinpositiva !== "") {
                                await page.evaluate(() => {
                                    const input = document.querySelector("#modal-root > div:nth-child(5) > div > div > section > section > form > section > div.col-span-2.lg\\:col-span-3.lg\\:order-5 > div.relative > input");
                                    if (input) {
                                        input.value = '';
                                        input.dispatchEvent(new Event('input', { bubbles: true }));
                                    }
                                });
                                await page.type("#modal-root > div:nth-child(5) > div > div > section > section > form > section > div.col-span-2.lg\\:col-span-3.lg\\:order-5 > div.relative > input", nrovinpositiva.slice(0, 8));
                            } else {
                                await page.evaluate(() => {
                                    const input = document.querySelector("#modal-root > div:nth-child(5) > div > div > section > section > form > section > div.col-span-2.lg\\:col-span-3.lg\\:order-5 > div.relative > input");
                                    if (input) {
                                        input.value = '';
                                        input.dispatchEvent(new Event('input', { bubbles: true }));
                                    }
                                });
                                await page.type("#modal-root > div:nth-child(5) > div > div > section > section > form > section > div.col-span-2.lg\\:col-span-3.lg\\:order-5 > div.relative > input", nrovin.slice(0, 8))
                            }
                            await delay(100);
                            await page.click("#react-select-5-input");
                            await delay(100);
                            await page.type('#react-select-5-input', "PARTICULAR");
                            await delay(400);
                            await page.keyboard.press('Enter');
                            await delay(500);
                            await page.click("#modal-root > div:nth-child(5) > div > div > section > section > form > div > button");

                        } catch (error) { }
                    }
                    try {
                        await page.waitForSelector('#modal-root > div:nth-child(5) > div > div > div > div.mx-auto.relative.pt-\\[80px\\].sm\\:pt-\\[108px\\] > button > span', { timeout: 5000 });
                        const textoerror = await page.evaluate(() => {
                            const element = document.querySelector('#modal-root > div:nth-child(5) > div > div > div > div.mx-auto.relative.pt-\\[80px\\].sm\\:pt-\\[108px\\] > p');
                            return element ? element.innerText : null;
                        });

                        const textoerror2 = await page.evaluate(() => {
                            const element = document.querySelector('#modal-root > div:nth-child(5) > div > div > div > div.mx-auto.relative.pt-\\[80px\\].sm\\:pt-\\[108px\\] > div > p');
                            return element ? element.innerText : null;
                        });

                        if (textoerror.replace("\n", " ").includes("Por ahora no tenemos") || textoerror2.replace("\n", " ").includes("cotizar tu SOAT")) {
                            await browser.close();
                            await deleteProfile(profilePath);
                            return "No tienen oferta para este cliente";
                        }
                        await browser.close();
                        await deleteProfile(profilePath);
                        await delay(3000);
                        if (nroreintento < 4) {
                            await delay(1000)
                            return pacificoconsulta(placa);
                        } else {
                            return "Maximos reintentos excedidos"
                        }
                    } catch (error) {
                    }
                    await page.waitForSelector('form div.text-center span.text-3xl', { timeout: 60000 });

                    const preciofinal = await page.evaluate(() => {
                        const element = document.querySelector('form div.text-center span.text-3xl');
                        return element ? element.innerText : null;
                    });
                    await browser.close();
                    await deleteProfile(profilePath);
                    return preciofinal;
                } catch (error) {
                    console.log(error)
                    await browser.close();
                    await deleteProfile(profilePath);
                    nroreintento++
                    if (nroreintento < 4) {
                        await delay(1000);
                        return pacificoconsulta(placa);
                    } else {
                        return "Maximos reintentos excedidos"
                    }
                }
            } catch (error) {
                console.log(error)
                return "Error en consulta";
            }
        }

        async function pacificostart(placa) {
            try {
                const url = "https://servicewapdigitalprd0100.azurewebsites.net/ecommerce-soat/auth/v2/token/";
                const response = await axios.post(url, {
                    resource: "6accfca2-3860-4ab9-81f5-9863159c543a"
                }, {
                    headers: {
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:129.0) Gecko/20100101 Firefox/129.0",
                        "Accept": "application/json, text/plain, */*",
                        "Accept-Language": "es-ES,es;q=0.8,en-US;q=0.5,en;q=0.3",
                        "Accept-Encoding": "gzip, deflate, br, zstd",
                        "Content-Type": "application/json",
                        "Origin": "https://soat.pacifico.com.pe",
                        "Connection": "keep-alive",
                        "Sec-Fetch-Dest": "empty",
                        "Sec-Fetch-Mode": "no-cors",
                        "Sec-Fetch-Site": "cross-site",
                        "Referer": "https://soat.pacifico.com.pe/",
                        "Pragma": "no-cache",
                        "Cache-Control": "no-cache"
                    },
                    httpsAgent: agent
                });

                const token = response.data.access_token;

                const url2 = `https://api.pacifico.com.pe/apigw/ecsoatcliente/ux-gestion-soat/v1/one-click/lugar-circulacion/${placa}`;
                const response2 = await axios.get(url2, {
                    headers: {
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:129.0) Gecko/20100101 Firefox/129.0",
                        "Accept": "application/json, text/plain, */*",
                        "Accept-Language": "es-ES,es;q=0.8,en-US;q=0.5,en;q=0.3",
                        "Accept-Encoding": "gzip, deflate, br, zstd",
                        "Referer": "https://soat.pacifico.com.pe/",
                        "Ocp-Apim-Subscription-Key": "8a37e5fc6a9b4d159a33b3850710d7bb",
                        "Aplicacion-Id": "ECommerceSOAT",
                        "Nombre-Aplicacion": "aplicacion",
                        "Nombre-Servicio-Consumidor": "servicio",
                        "Usuario-Consumidor-Id": "anonimus",
                        "Transaccion-Id": "21e22474-d31f-4119-8478-d9d448727cfe",
                        "Token-Seguridad": "token",
                        "Authorization": `Bearer ${token}`,
                        "Origin": "https://soat.pacifico.com.pe",
                        "Connection": "keep-alive",
                        "Sec-Fetch-Dest": "empty",
                        "Sec-Fetch-Mode": "cors",
                        "Sec-Fetch-Site": "same-site"
                    },
                    httpsAgent: agent
                });
                const namescirculacion = response2.data.datos.map(item => item.name);
                respuestacirculacionpacifico = response2.data.datos;
                if (namescirculacion.length > 1) {
                    multiplespacifico = true;
                } else if (namescirculacion.length === 1) {
                    const nombrecirculacionenpacifico = namescirculacion[0].toUpperCase();
                    circulacionidpacifico = zonaspositiva.find(zona => zona.name === nombrecirculacionenpacifico).id;
                    multiplespacifico = false;
                } else {
                    multiplespacifico = "error";
                }

                const marcasrequest = await axios.get("https://api.pacifico.com.pe/apigw/ecsoatcliente/ux-gestion-soat/v1/one-click/autos/marcas", {
                    headers: {
                        "Connection": "keep-alive",
                        "sec-ch-ua": "\"Chromium\";v=\"128\", \"Not;A=Brand\";v=\"24\", \"Brave\";v=\"128\"",
                        "Nombre-Servicio-Consumidor": "servicio",
                        "Usuario-Consumidor-Id": "anonimus",
                        "Aplicacion-Id": "ECommerceSOAT",
                        "sec-ch-ua-mobile": "?0",
                        "Transaccion-Id": "21e22474-d31f-4119-8478-d9d448727cfe",
                        "Authorization": `Bearer ${token}`,
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
                        "Ocp-Apim-Subscription-Key": "8a37e5fc6a9b4d159a33b3850710d7bb",
                        "Accept": "application/json, text/plain, */*",
                        "Token-Seguridad": "token",
                        "Nombre-Aplicacion": "aplicacion",
                        "sec-ch-ua-platform": "\"Windows\"",
                        "Sec-GPC": "1",
                        "Accept-Language": "es;q=0.9",
                        "Origin": "https://soat.pacifico.com.pe",
                        "Sec-Fetch-Site": "same-site",
                        "Sec-Fetch-Mode": "cors",
                        "Sec-Fetch-Dest": "empty",
                        "Referer": "https://soat.pacifico.com.pe/",
                        "Accept-Encoding": "gzip, deflate, br, zstd"
                    },
                    httpsAgent: agent
                });
                brandsArray = marcasrequest.data.datos.marcas;
            } catch (error) {
                multiplespacifico = "error";
            }
        }

        async function consultasunarp(placa) {
            try {
                function encryptdata(datatoencrypt) {
                    const key = "sV2zUWiuNo@3uv8nu9ir4";
                    return CryptoJS.AES.encrypt(datatoencrypt, key).toString();
                }

                const datatogetencrypt = JSON.stringify({
                    numPlaca: placa,
                    ipAddress: getRandomNumberForIP(),
                    appVersion: "1.0",
                    regPubId: null,
                    oficRegId: null
                });

                const dataencriptada = encryptdata(datatogetencrypt);
                const url = "https://api-gateway.sunarp.gob.pe:9443/sunarp/multiservicios/multiservicio-consvehicular/consulta/getDatosVehiculo";
                const response = await axios.post(url, {
                    dmFsdWU: dataencriptada
                }, {
                    headers: {
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:129.0) Gecko/20100101 Firefox/129.0",
                        "Accept": "application/json, text/plain, */*",
                        "Accept-Language": "es-ES,es;q=0.8,en-US;q=0.5,en;q=0.3",
                        "Accept-Encoding": "gzip, deflate, br, zstd",
                        "X-IBM-Client-Id": "70574c7d9194834316a156b1d68fdb90",
                        "Content-Type": "application/json",
                        "Origin": "https://www2.sunarp.gob.pe",
                        "Connection": "keep-alive",
                        "Referer": "https://www2.sunarp.gob.pe/",
                        "Sec-Fetch-Dest": "empty",
                        "Sec-Fetch-Mode": "cors",
                        "Sec-Fetch-Site": "same-site",
                        "TE": "trailers"
                    },
                    httpsAgent: agent
                });

                function decrypt(encryptedData) {
                    const key = "sV2zUWiuNo@3uv8nu9ir4";
                    const bytes = CryptoJS.AES.decrypt(encryptedData, key);
                    return bytes.toString(CryptoJS.enc.Utf8).replace(/"null"/g, "null");
                }

                const responsefinalsunarp = decrypt(response.data.cmVzcG9uc2U);

                if (!responsefinalsunarp.includes("Placa encontrada satisfactoriamente")) {
                    return "La placa es inválida según SUNARP";
                } else {
                    placavalida = "Si";
                    const base64Image = JSON.parse(responsefinalsunarp).model.imagen;
                    const minColor = { r: 200, g: 200, b: 200 };
                    const maxColor = { r: 255, g: 255, b: 255 };

                    const processImage = async (base64Image, minColor, maxColor) => {
                        try {
                            const buffer = Buffer.from(base64Image, 'base64');
                            const scaleFactor = 1;

                            const { data, info } = await sharp(buffer)
                                .extract({ width: 540, height: 410, left: 0, top: 165 })
                                .ensureAlpha()
                                .raw()
                                .toBuffer({ resolveWithObject: true });

                            for (let i = 0; i < data.length; i += 4) {
                                const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
                                if (
                                    r >= minColor.r && r <= maxColor.r &&
                                    g >= minColor.g && g <= maxColor.g &&
                                    b >= minColor.b && b <= maxColor.b
                                ) {
                                    data[i + 3] = 0;
                                }
                            }

                            const processedImageBuffer = await sharp(data, {
                                raw: { width: info.width, height: info.height, channels: 4 }
                            })
                                .resize({
                                    width: info.width * scaleFactor,
                                    height: info.height * scaleFactor,
                                    kernel: 'nearest'
                                })
                                .toFormat('png')
                                .modulate({ brightness: 0 })
                                .linear(1, 0)
                                .sharpen()
                                .withMetadata({ density: 70 })
                                .toBuffer();

                            const { data: { text } } = await Tesseract.recognize(
                                `data:image/png;base64,${processedImageBuffer.toString('base64')}`,
                                'spa',
                                {
                                    tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789Ñ():º,- ',
                                    preserve_interword_spaces: 1,
                                    tessedit_pageseg_mode: Tesseract.PSM.SINGLE_BLOCK
                                }
                            );

                            const limpio = text
                                .replace(/.{3}(PLACA:)/g, '$1')
                                .replace(/.{3}(SERIE:)/g, '$1')
                                .replace(/.{3}(VIN:)/g, '$1')
                                .replace(/.{3}(MOTOR:)/g, '$1')
                                .trim()
                                .split('\n')
                                .filter(linea => linea.trim())
                                .join('\n')
                                .trim();

                            const extractValue = (line) => line.split(': ')[1]?.trim() || '';
                            const lines = limpio.split('\n');

                            const cleanValue = (value) => value.replace(/[\[\]]/g, "J");

                            const jsonResult = {
                                placa: cleanValue(extractValue(lines[0])),
                                nroserie: cleanValue(extractValue(lines[1])),
                                nrovin: cleanValue(extractValue(lines[2])),
                                nromotor: cleanValue(extractValue(lines[3])),
                                colorvehiculo: cleanValue(extractValue(lines[4])),
                                marcavehiculo: cleanValue(extractValue(lines[5])),
                                modelovehiculo: cleanValue(extractValue(lines[6])),
                                placavigente: cleanValue(extractValue(lines[7])),
                                placaanterior: cleanValue(extractValue(lines[8])),
                                estadovehiculo: cleanValue(extractValue(lines[9])),
                                anotacionesvehiculo: cleanValue(extractValue(lines[10])),
                                sedevehiculo: cleanValue(extractValue(lines[11])),
                                propietariovehiculo: cleanValue(lines[14])
                            };
                            if (extractValue(lines[1]) !== "") {
                                nroserie = extractValue(lines[1])
                            }
                            if (extractValue(lines[2]) !== "") {
                                nrovin = extractValue(lines[2]);
                            }
                            marca = extractValue(lines[5]);
                            modelo = extractValue(lines[6]);
                            return jsonResult;
                        } catch (err) {
                            console.error('Error al procesar la imagen:', err);
                        }
                    };
                    return processImage(base64Image, minColor, maxColor);
                }
            } catch (error) {
                return "Error en consulta";
            }
        }

        async function APIDNI(dni) {
            try {
                const url = "https://api.perudevs.com/api/v1/dni/complete?document=" + dni + "&key=cGVydWRldnMucHJvZHVjdGlvbi5maXRjb2RlcnMuNjZlMjFjMWI5ZmE0MTczZjYxMzIwMzZh"
                const response = await axios.get(url, {})
                genero = response.data.resultado.genero;
                nombres = response.data.resultado.nombres;
                apellido_paterno = response.data.resultado.apellido_paterno;
                apellido_materno = response.data.resultado.apellido_materno;
                fecha_nacimiento = response.data.resultado.fecha_nacimiento;
                nombre_completo = response.data.resultado.nombre_completo;
                codigo_verificacion = response.data.resultado.codigo_verificacion;
                return response.data;
            } catch (error) {
                genero = "SIN REGISTROS";
                nombres = "SIN REGISTROS";
                apellido_paterno = "SIN REGISTROS";
                apellido_materno = "SIN REGISTROS";
                fecha_nacimiento = "SIN REGISTROS";
                nombre_completo = "SIN REGISTROS";
                codigo_verificacion = "SIN REGISTROS";
                return "SIN REGISTROS";
            }
        }

        async function iniciarconsulta(placa, dni, reintentos = 0) {
            try {
                const [pacificoStartResult, sunarpResult, dniResult] = await Promise.all([
                    pacificostart(placa),
                    consultasunarp(placa),
                    APIDNI(dni)
                ]);
                sunarp = sunarpResult;

                let resultadofinal;
                if (sunarp === "La placa es inválida según SUNARP") {
                    placavalida = "No";
                    const findetiempo = performance.now();
                    const demora = Math.round((findetiempo - iniciodetiempo) / 1000);

                    resultadofinal = {
                        "claveautorizacion": "FJU7Y3GSYFEIUFR3",
                        "datos": {
                            "placa": placa,
                            "placavalida": placavalida,
                            "ultimaaseguradora": "SIN REGISTROS",
                            "iniciosoathistorico": "SIN REGISTROS",
                            "vigenciasoat": "SIN REGISTROS",
                            "usodesoat": "SIN REGISTROS",
                            "estadodesoat": "SIN REGISTROS",
                            "tiposoat": "SIN REGISTROS",
                            "fidelidad": "SIN REGISTROS",
                            "interrupcion": "SIN REGISTROS",
                            "preciopacifico": "SIN REGISTROS",
                            "preciopositiva": "SIN REGISTROS",
                            "demora": `${demora}`,
                            "resultado": "Éxito",
                            "nroserie": sunarp.nroserie || "SIN REGISTROS",
                            "nrovin": sunarp.nrovin || "SIN REGISTROS",
                            "nromotor": sunarp.nromotor || "SIN REGISTROS",
                            "colorvehiculo": sunarp.colorvehiculo || "SIN REGISTROS",
                            "marcavehiculo": sunarp.marcavehiculo || "SIN REGISTROS",
                            "modelovehiculo": sunarp.modelovehiculo || "SIN REGISTROS",
                            "placavigente": sunarp.placavigente || "SIN REGISTROS",
                            "placaanterior": sunarp.placaanterior || "SIN REGISTROS",
                            "estadovehiculo": sunarp.estadovehiculo || "SIN REGISTROS",
                            "anotacionesvehiculo": sunarp.anotacionesvehiculo || "SIN REGISTROS",
                            "sedevehiculo": sunarp.sedevehiculo || "SIN REGISTROS",
                            "propietariovehiculo": sunarp.propietariovehiculo || "SIN REGISTROS"
                        }
                    };

                    return {
                        "resultado": resultadofinal,
                        "return": "Placa invalida"
                    }
                }

                const [pacificoConsultaResult, positivaConsultaResult] = await Promise.all([
                    pacificoconsulta(placa),
                    positivaconsulta(placa, dni)
                ]);

                pacificoResult = pacificoConsultaResult;
                positivaResult = positivaConsultaResult || positivaResult || "Error en consulta";
                findetiempo = performance.now();
                const demora = Math.round((findetiempo - iniciodetiempo) / 1000);
                resultadofinal = {
                    "claveautorizacion": "FJU7Y3GSYFEIUFR3",
                    "datos": {
                        "placa": placa,
                        "placavalida": placavalida,
                        "ultimaaseguradora": "SIN REGISTROS",
                        "iniciosoathistorico": "SIN REGISTROS",
                        "vigenciasoat": "SIN REGISTROS",
                        "usodesoat": "SIN REGISTROS",
                        "estadodesoat": "SIN REGISTROS",
                        "tiposoat": "SIN REGISTROS",
                        "fidelidad": "SIN REGISTROS",
                        "interrupcion": "SIN REGISTROS",
                        "preciopacifico": pacificoResult || "SIN REGISTROS",
                        "preciopositiva": positivaResult || "SIN REGISTROS",
                        "demora": `${demora}`,
                        "resultado": "Éxito",
                        "nroserie": sunarp.nroserie || "SIN REGISTROS",
                        "nrovin": sunarp.nrovin || "SIN REGISTROS",
                        "nromotor": sunarp.nromotor || "SIN REGISTROS",
                        "colorvehiculo": sunarp.colorvehiculo || "SIN REGISTROS",
                        "marcavehiculo": sunarp.marcavehiculo || "SIN REGISTROS",
                        "modelovehiculo": sunarp.modelovehiculo || "SIN REGISTROS",
                        "placavigente": sunarp.placavigente || "SIN REGISTROS",
                        "placaanterior": sunarp.placaanterior || "SIN REGISTROS",
                        "estadovehiculo": sunarp.estadovehiculo || "SIN REGISTROS",
                        "anotacionesvehiculo": sunarp.anotacionesvehiculo || "SIN REGISTROS",
                        "sedevehiculo": sunarp.sedevehiculo || "SIN REGISTROS",
                        "propietariovehiculo": sunarp.propietariovehiculo || "SIN REGISTROS",
                        "genero": genero || "",
                        "nombres": nombres || "",
                        "apellido_paterno": apellido_paterno || "",
                        "apellido_materno": apellido_materno || "",
                        "fecha_nacimiento": fecha_nacimiento || "",
                        "nombre_completo": nombre_completo || "",
                        "codigo_verificacion": codigo_verificacion || ""
                    }
                };

                resultadofinal.datos.resultado = "Éxito";
                return {
                    "resultado": resultadofinal,
                    "return": {
                        pacifico: pacificoResult,
                        positiva: positivaResult,
                        "nroserie": sunarpResult.nroserie,
                        "marca": sunarpResult.marcavehiculo,
                        "modelo": sunarpResult.modelovehiculo,
                        "nombreregistrado": sunarp.propietariovehiculo,
                        "nrovin": sunarpResult.nrovin,
                        "nromotor": sunarpResult.nromotor,
                        "colorvehiculo": sunarpResult.colorvehiculo,
                        "marcavehiculo": sunarpResult.marcavehiculo,
                        "estadovehiculo": sunarpResult.estadovehiculo,
                        "anotacionesvehiculo": sunarpResult.anotacionesvehiculo,
                        "sedevehiculo": sunarpResult.sedevehiculo
                    }
                };

            } catch (error) {
                console.log(error)
                if (reintentos < 1) {
                    return await iniciarconsulta(placa, dni, reintentos + 1);
                } else {
                    findetiempo = performance.now();
                    return {
                        "resultado": undefined,
                        "return": "Error en consulta"
                    };
                }
            }
        }

        const data = await iniciarconsulta(placa, dni);
        const resultadofinal = data.resultado;

        try {
            if (resultadofinal == undefined) {
                return data.return;
            }
            const urlpost = "https://tinasure.com/wSXj8xveJKtJFWZnKqE9Zu3WjNKQYX/XFdwPt1zUAch6nA1SQ5Fauvn7wd8wRsdat/"
            const subirdata = await axios.post(urlpost, resultadofinal, {
                headers: {
                    "Content-Type": "application/json"
                },
                httpsAgent: agent
            });
        } catch (error) {
            console.log(error)
        }
        return data.return;
    } catch (error) {
        console.log(error)
        return "Error en consulta"
    }
}


/*
SERVER DEPLOY
CONFIG
*/

/* VARIABLES PARA ACCESO HTTP A CONSULTA */

const app = express();
const port = 3003;
const consultas = {};
const colaConsultas = [];
let consultasSimultaneas = 0;
const MAX_CONSULTAS_SIMULTANEAS = 4;

/* FUNCIONES DE PROCESAMIENTO Y COLA DE COTIZACION */

async function procesarConsulta(consultaId, placa, dni) {
    consultasSimultaneas++;
    try {
        const resultado = await ENCAPSULAMIENTO(placa, dni);
        consultas[consultaId] = { estado: 'completado', resultado };
        console.log(resultado)
        console.log(`Consulta completada | PLACA: ${placa} | DNI: ${dni} | UUID: ${consultaId}`);
    } catch (error) {
        consultas[consultaId] = { estado: 'error', mensaje: error.message };
        console.error(`Error en la consulta ${consultaId}:`, error.message);
    } finally {
        consultasSimultaneas--;
        procesarSiguienteConsultaEnCola();
    }
}

function procesarSiguienteConsultaEnCola() {
    if (consultasSimultaneas <= MAX_CONSULTAS_SIMULTANEAS && colaConsultas.length > 0) {
        const { consultaId, placa, dni } = colaConsultas.shift();
        procesarConsulta(consultaId, placa, dni);
    }
}

/* SERVER HTTP SETTINGS AND DEPLOY */

app.use(express.json());
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.post('/consulta', async (req, res) => {
    const { placa, dni } = req.body;

    console.log(`Datos recibidos en /consulta: PLACA: ${placa} | DNI: ${dni}`);

    if (!placa || !dni) {
        return res.status(400).json({ error: 'Faltan datos en tu consulta' });
    }

    const consultaId = uuidv4();
    consultas[consultaId] = { estado: 'en proceso', resultado: null };

    if (consultasSimultaneas < MAX_CONSULTAS_SIMULTANEAS) {
        procesarConsulta(consultaId, placa, dni);
    } else {
        colaConsultas.push({ consultaId, placa, dni });
        console.log(`Consulta en cola | PLACA: ${placa} | DNI: ${dni} | UUID: ${consultaId}`);
    }

    res.json({ message: 'Consulta agregada a la cola', consultaId });
});

app.post('/consulta/:id', (req, res) => {
    const { id } = req.params;
    const consulta = consultas[id];

    if (!consulta) {
        return res.status(404).json({ error: 'Consulta no encontrada' });
    }

    if (consulta.estado === 'completado') {
        delete consultas[id];
    }

    res.json(consulta);
});

app.listen(port, () => {
    process.stdout.write('\x1Bc');
    console.log(`Servidor corriendo en http://localhost:${port}`);
});
