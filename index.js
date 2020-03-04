global.confPath = __dirname + "/config.json";

let downloader = false;
let test = false;

for (let i=2; i<process.argv.length; i++) {
    let arg = process.argv[i].toLowerCase();
    if (arg == "-d" || arg == "-download" || arg == "-downloader") downloader = true;
    if (arg == "-test" || arg == "-t") test = true;
}
if (!downloader && process.env.DOWNLOADER) {
    downloader = true;
}

if (test) {
    const config = require("./lib/Config").getConfig();
    let testFile = config.dataPath + "/downloads/test.grib2";
    console.log("Iniciando importación de prueba de " + testFile);
    const DescargaPronostico = require("./lib/DescargaPronostico");
    const EjecucionModelo = require("./lib/EjecucionModelo");
    const descargador = new DescargaPronostico(new EjecucionModelo(), 0);
    descargador.importa(testFile)
        .then(_ => console.log("Importación Finalizada"))
        .catch(error => console.error(error));
    return;
}

const ProveedorCapasWW3 = require("./lib/ProveedorCapasWW3");

if (downloader) {
    console.log("[WW3] Iniciando en modo Downloader");
    require("./lib/Downloader").init();
} else {
    const config = require("./lib/Config").getConfig();
    const proveedorCapas = new ProveedorCapasWW3({
        puertoHTTP:config.webServer.http.port,
        directorioWeb:__dirname + "/www",
        directorioPublicacion:config.publishPath
    });
    proveedorCapas.start();
}

