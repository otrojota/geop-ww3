const config = require("./Config").getConfig();
const moment = require("moment-timezone");
const fs = require("fs");
const gdal = require("./GDAL");
const PNG = require("pngjs").PNG;

class Variables {
    static get instance() {
        if (Variables.singleton) return Variables.singleton;
        Variables.singleton = new Variables();
        return Variables.singleton;
    }
    constructor() {
        this.units = Object.keys(config.variablesPorBanda).reduce((map, gribElementCode) => {
            let vars = config.variablesPorBanda[gribElementCode];
            vars.forEach(v => map[v.code] = v.unit);
            return map;
        }, {});
        fs.mkdir(config.dataPath + "/tmp", err => {
        });
        fs.mkdir(config.dataPath + "/tmp/windgl-files", err => {
        });
    }

    normalizaTiempo(timestamp) {
        let dt = moment.tz(timestamp, "UTC");
        dt.minutes(0); dt.seconds(0); dt.milliseconds(0);
        /*
        let hh = dt.hours();
        if (hh % 3) {
            if (hh % 3 == 1) dt.subtract(1, "hours");
            else dt.add(1, "hours");
        }
        */
        return dt;
    }
    getPath(tiempo) {
        return config.dataPath + "/" + tiempo.format("YYYY") + "/" + tiempo.format("MM");
    }
    getMetadata(timestamp) {
        return new Promise((resolve, reject) => {
            let dt = this.normalizaTiempo(timestamp);
            let path = this.getPath(dt) + "/" + dt.format("DD_HH00") + ".metadata";  
            fs.readFile(path, (err, data) => {
                let metadata = null;
                if (!err) {
                    metadata = JSON.parse(data);
                }
                resolve(metadata);
            });
        });
    }
    setMetadata(timestamp, metadata) {
        return new Promise((resolve, reject) => {
            let dt = this.normalizaTiempo(timestamp);
            let path = this.getPath(dt) + "/" + dt.format("DD_HH00") + ".metadata";
            fs.writeFile(path, JSON.stringify(metadata), err => {
                if (err) {
                    reject(err);
                    return;
                }
                resolve();
            })
        });
    }
    async findMetadata(timestamp, dsCode, levelIndex) {
        let varCode = dsCode + "-" + levelIndex;         
        let t0 = this.normalizaTiempo(timestamp).valueOf();
        let intentos = 0;
        while (intentos < 100) {
            let t = t0 - intentos * 60 * 60 * 1000;
            let m = await this.getMetadata(t);
            if (m && m.variables[varCode]) {
                m.tiempo = t;
                return m;
            }
            if (intentos > 0) {
                t = t0 + intentos * 60 * 60 * 1000;
                m = await this.getMetadata(t);
                if (m && m.variables[varCode]) {
                    m.tiempo = t;
                    return m;
                }
            }
            intentos++;
        }
        return null;
    }

    /*
    normalizaBBox(lng0, lat0, lng1, lat1) {
        let _lng0 = 0.5 * parseInt(lng0 / 0.5) - 0.5;
        let _lat0 = 0.5 * parseInt(lat0 / 0.5) - 0.5;
        let _lng1 = 0.5 * parseInt(lng1 / 0.5) + 0.5;
        let _lat1 = 0.5 * parseInt(lat1 / 0.5) + 0.5;
        let limites = config.limites;
        if (_lng0 < limites.w) _lng0 = limites.w;
        if (_lng0 > limites.e) _lng0 = limites.e;
        if (_lng1 < limites.w) _lng1 = limites.w;
        if (_lng1 > limites.e) _lng1 = limites.e;
        if (_lat0 < limites.s) _lat0 = limites.s;
        if (_lat0 > limites.n) _lat0 = limites.n;
        if (_lat1 < limites.s) _lat1 = limites.s;
        if (_lat1 > limites.n) _lat1 = limites.n;
        return {lng0:_lng0, lat0:_lat0, lng1:_lng1, lat1:_lat1};
    }

    exportaTIFF(band, srcPath, outPath, lng0, lat0, lng1, lat1) {
        return new Promise((resolve, reject) => {
            let bbox = this.normalizaBBox(lng0, lat0, lng1, lat1);
            if (bbox.lng0 == bbox.lng1 || bbox.lat0 == bbox.lat1) reject("Área sin Datos");
            gdal.translateWindow(bbox.lng0, bbox.lat0, bbox.lng1, bbox.lat1, srcPath, outPath, [band])
                .then(_ => resolve(bbox))
                .catch(err => reject(err));
        });
    }

    calculaMagnitud(inputFileU, inputFileV, outputPath) {
        return new Promise((resolve, reject) => {
            gdal.calc([{
                codigo:"U", path:inputFileU
            }, {
                codigo:"V", path:inputFileV
            }], outputPath, "numpy.sqrt(U*U + V*V)")
            .then(_ => resolve())
            .catch(err => reject(err));
        });
    }


    */
}

module.exports = Variables.instance;