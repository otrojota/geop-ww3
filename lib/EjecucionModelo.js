const http = require('https');
const moment = require("moment-timezone");
const url = require('url'); 
const fs = require('fs');
const config = require("./Config").getConfig();
const DescargaPronostico = require("./DescargaPronostico");

const baseNOAAURL = "https://nomads.ncep.noaa.gov/pub/data/nccf/com/wave/prod/";

class EjecucionModelo {
    constructor(date) {
        if (!date) {
            let ahora = moment.tz("UTC").startOf("hour");
            date = ahora.format("YYYY-MM-DD HH:mm");
        }
        this.tiempo = moment.tz(date, "UTC");
        let hora = this.tiempo.hours();
        if (hora % 6) {
            hora = 6 * parseInt(hora / 6);
            this.tiempo.hours(hora);
        }
        this.descargasPendientes = [];
        this.descargasActivas = [];
        this.nDescargasParalelo = config.nDescargasParalelo;
        this.maxReintentosDescarga = 5;
        this.resumenImportacion = {
            t0:0, t1:0, nDescargasOk:0, nDescargasError:0
        }
    }

    getNOAAUrl(horaPronostico, extension) {  
        if (extension === undefined) extension = "";      
        let hh = "" + horaPronostico;
        if (hh.length < 3) hh = "0" + hh;
        if (hh.length < 3) hh = "0" + hh;
        return baseNOAAURL + "multi_1." + this.tiempo.format("YYYYMMDD") + "/multi_1.glo_30m.t" + this.tiempo.format("HH") + "z.f" + hh + extension;
    }

    estaPublicado() {
        return new Promise((resolve, reject) => {            
            // Buscar archivo ".idx" para la hora de pronóstico "0000"
            let testUrl = this.getNOAAUrl(0, ".grib2.idx");
            // Probar si existe el archivo apuntado (se corrió el modelo para esa hora)
            let parsed = url.parse(testUrl);
            let options = {
                method:"HEAD",
                host:parsed.host,
                //port:parsed.port?parsed.port:,
                path: parsed.pathname,
                protocol:parsed.protocol
            };
            try {
                let req = http.request(options, r => {
                    if (r.statusCode == 200) {
                        resolve(true);
                    } else if (r.statusCode == 404) {
                        resolve(false);
                    } else {
                        reject("[" + r.statusCode + "] " + r.statusMessage);
                    }
                });
                req.end();
            } catch(error) {
                reject(error);
            }
        });        
    }

    dec() {
        this.tiempo.subtract(6, "hours");
    }

    importa() {        
        return new Promise((resolve, reject) => {
            let downloadPath = config.dataPath + "/downloads";            
            fs.mkdir(downloadPath, err => {
                if (err && err.code != "EEXIST") {
                    reject(err);
                    return;
                }
                let h = 0;
                while (h <= 180) {
                    this.descargasPendientes.push(new DescargaPronostico(this, h));
                    h++;
                }
                this.resolveImportacion = resolve;
                this.rejectImportacion = reject;
                this.iniciaDescargasIniciales();
            });            
        })
    }

    async iniciaDescargasIniciales() {
        while (this.descargasActivas.length < this.nDescargasParalelo) {
            this.iniciaSiguienteDescarga();
            await (new Promise(resolve => {setTimeout(_ => resolve(), 30000)}));
        }
    }

    iniciaSiguienteDescarga() {
        if (!this.descargasPendientes.length) {
            if (!this.descargasActivas.length) {
                if (this.resumenImportacion.nDescargasOk > this.resumenImportacion.nDescargasError) {
                    this.resolveImportacion(this.resumenImportacion);
                } else {
                    this.rejectImportacion(this.resumenImportacion);
                }
            }
            return;
        }
        let d = this.descargasPendientes[0];
        this.descargasPendientes.splice(0,1);
        this.descargasActivas.push(d);
        d.descarga()
            .then(_ => {
                let idx = this.descargasActivas.indexOf(d);
                this.descargasActivas.splice(idx, 1);
                this.resumenImportacion.nDescargasOk++;
                this.iniciaSiguienteDescarga();
            })
            .catch(error => {
                let idx = this.descargasActivas.indexOf(d);
                this.descargasActivas.splice(idx, 1);
                if (error.startsWith("[404]")) {
                    // Ignorar
                    this.iniciaSiguienteDescarga();
                    return;
                }
                if (++d.nReintentos > this.maxReintentosDescarga) {
                    this.resumenImportacion.nDescargasError++;
                    console.log(error);
                } else {
                    this.descargasPendientes.push(d);
                }
                this.iniciaSiguienteDescarga();
            })
    }
}

module.exports = EjecucionModelo;