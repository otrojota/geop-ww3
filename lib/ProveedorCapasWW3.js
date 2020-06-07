const {ProveedorCapas, Origen, CapaRaster} = require("geop-base-proveedor-capas");
const config = require("./Config").getConfig();
const variables = require("./Variables");
const moment = require("moment-timezone");
const gdal = require("./GDAL");
const fsProm = require("fs").promises;
const fs = require("fs");
const PNG = require("pngjs").PNG;

class ProveedorCapasWW3 extends ProveedorCapas {
    constructor(opciones) {
        super("ww3", opciones);
        Object.keys(config.variablesPorBanda).forEach(codWW3 => {
            let variableWW3 = config.variablesPorBanda[codWW3];
            variableWW3.forEach(variable => {
                let opciones = {
                    formatos:{
                        isolineas:true, isobandas:true, serieTiempo:true, valorEnPunto:true, matrizRectangular:true
                    },
                    decimales:variable.decimales !== undefined?variable.decimales:2,
                    visualizadoresIniciales:variable.visualizadoresIniciales?variable.visualizadoresIniciales:undefined
                }
                if (variable.opacidad !== undefined) opciones.opacidad = variable.opacidad;
                if (variable.direccion || variable.vector) {
                    opciones.formatos.uv = true;
                    opciones.direccion = variable.direccion;
                    opciones.vector = variable.vector;
                }
                /*
                if (variable.codigo == "WIND_DIRECTION") {
                    opciones.formatos.uv = true;
                    opciones.vector = {capaU:"WIND_UGRD", capaV:"WIND_VGRD"}
                } else if (variable.codigo == "OLAS_DIR_PRIM") {
                    opciones.formatos.uv = true;
                    opciones.direccion = {capa:"OLAS_DIR_PRIM", transformacion:"estandar-oceanografia"}
                } else if (variable.codigo == "OLAS_DIR_WIND") {
                    opciones.formatos.uv = true;
                    opciones.direccion = {capa:"OLAS_DIR_WIND", transformacion:"estandar-oceanografia"}
                } else if (variable.codigo == "OLAS_DIR_SWELL1") {
                    opciones.formatos.uv = true;
                    opciones.direccion = {capa:"OLAS_DIR_SWELL1", transformacion:"estandar-oceanografia"}
                } else if (variable.codigo == "OLAS_DIR_SWELL2") {
                    opciones.formatos.uv = true;
                    opciones.direccion = {capa:"OLAS_DIR_SWELL2", transformacion:"estandar-oceanografia"}
                }                
                */
                if (variable.codigo == "WIND_SPEED") {
                    opciones.formatos.uv = true;
                    opciones.vector = {capaU:"WIND_UGRD", capaV:"WIND_VGRD"}
                } else if (variable.codigo == "OLAS_MEAN_PER_PRIM") {
                    opciones.formatos.uv = true;
                    opciones.direccion = {capa:"OLAS_DIR_PRIM", transformacion:"estandar-oceanografia"}
                } else if (variable.codigo == "OLAS_ALT_WIND") {
                    opciones.formatos.uv = true;
                    opciones.direccion = {capa:"OLAS_DIR_WIND", transformacion:"estandar-oceanografia"}
                } else if (variable.codigo == "OLAS_ALT_SWELL1") {
                    opciones.formatos.uv = true;
                    opciones.direccion = {capa:"OLAS_DIR_SWELL1", transformacion:"estandar-oceanografia"}
                } else if (variable.codigo == "OLAS_MEAN_PER_SWELL1") {
                    opciones.formatos.uv = true;
                    opciones.direccion = {capa:"OLAS_DIR_SWELL1", transformacion:"estandar-oceanografia"}
                } else if (variable.codigo == "OLAS_ALT_SWELL2") {
                    opciones.formatos.uv = true;
                    opciones.direccion = {capa:"OLAS_DIR_SWELL2", transformacion:"estandar-oceanografia"}
                } else if (variable.codigo == "OLASMEAN_PER_SWELL2") {
                    opciones.formatos.uv = true;
                    opciones.direccion = {capa:"OLAS_DIR_SWELL2", transformacion:"estandar-oceanografia"}
                }     
                this.addCapa(
                    new CapaRaster("ww3", variable.codigo, variable.nombre, "noaa", opciones, variable.grupos, variable.icono, variable.unidad, variable.niveles, variable.nivelInicial
                ))    
            })
        });
        setInterval(_ => this.eliminaArchivosPublicados(), 60000);
        this.eliminaArchivosPublicados();
    }

    async comandoGET(cmd, req, res) {
        try {
            switch(cmd) {
                case "fullReindexar":
                    let dp = new (require("./DescargaPronostico"))();
                    await dp.fullReindexar();
                    res.status(200).send("Ok").end();
                    break;
                default: throw "Comando '" + cmd + "' no implementado";
            }
        } catch(error) {
            console.error(error);
            if (typeof error == "string") {
                res.send(error).status(401).end();
            } else {
                res.send("Error Interno").status(500).end();
            }
        }
    }

    async eliminaArchivosPublicados() {
        try {
            let dir = await fsProm.readdir(config.publishPath);
            let ahora = new Date().getTime();
            let limite = ahora - 60 * 1000;
            for (let i=0; i<dir.length; i++) {
                let path = config.publishPath + "/" + dir[i];
                let stats = await fsProm.stat(path);
                let t = stats.mtimeMs;
                if (t < limite) {
                    try {
                        await fsProm.unlink(path);
                    } catch(err) {
                        console.error("Eliminando archivo", err);
                    }
                }
            }
        } catch(error) {
            console.error(error);
        }
    }

    getPath(dt) {
        return config.dataPath + "/" + dt.format("YYYY") + "/" + dt.format("MM");
    }
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

    async getPreconsulta(codigoCapa, lng0, lat0, lng1, lat1, tiempo, nivel, maxWidth, maxHeight) {
        try {
            let capa = this.getCapa(codigoCapa);            
            if (!capa) throw "No se encontró la capa '" + codigoCapa + "'";
            let metadata = await variables.findMetadata(tiempo, codigoCapa, nivel);
            if (!metadata) throw "No hay datos";
            let varMetadata = metadata.variables[codigoCapa + "-" + nivel];
            let ret = {
                minGlobal:varMetadata.min,
                maxGlobal:varMetadata.max,
                atributos:{
                    "Ejecución Modelo":varMetadata.modelo
                },
                errores:[], advertencias:[], mensajes:[]
            }
            if (varMetadata.noDataValue) ret.noDataValue = varMetadata.noDataValue;
            let outFileName = "tmp_" + parseInt(Math.random() * 9999999999) + ".tif";
            let outPath = config.publishPath + "/" + outFileName;
            let dt = moment.tz(metadata.tiempo, "UTC");
            let srcPath = this.getPath(dt) + "/" + dt.format("DD_HH00") + ".grb2";            

            let bbox = this.normalizaBBox(lng0, lat0, lng1, lat1);
            if (bbox.lng0 == bbox.lng1 || bbox.lat0 == bbox.lat1) throw "Área sin Datos";
            maxWidth = maxWidth || 150;
            maxHeight = maxHeight || 150;
            let res = 0.5, width = undefined, height = undefined;            
            if ((bbox.lng1 - bbox.lng0) / res > maxWidth) {
                width = maxWidth;
                height = (bbox.lat1 - bbox.lat0) / res;
            }
            if ((bbox.lat1 - bbox.lat0) / res > maxHeight) {
                height = maxHeight;
                width = width || (bbox.lng1 - bbox.lng0) / res;
            }
            if (width || height) ret.advertencias.push(`Se han interpolado los datos para restringir los resultados a una matriz de ${width} x ${height} puntos. Para usar los datos originales, consulte por un área más pequeña`);

            await gdal.translateWindow(bbox.lng0, bbox.lat0, bbox.lng1, bbox.lat1, srcPath, outPath, [varMetadata.banda], (width || height)?{width:width, height:height}:null);

            ret.bbox = bbox;         
            let info = await gdal.info(outPath, true);
            let banda = info.bands[0];
            ret.atributos["Nivel"] = banda.description;
            ret.atributos.Tiempo = metadata.tiempo;
            ret.atributos["Tiempo Consultado"] = tiempo;
            let md = banda.metadata[""];
            if (md) {
                ret.atributos["Variable WW3"] = md.GRIB_COMMENT;
                ret.atributos["Disciplina WW3"] = md.GRIB_DISCIPLINE;
                ret.atributos["Unidad WW3"] = md.GRIB_UNIT;
                ret.atributos["Pronóstico"] = md.GRIB_FORECAST_SECONDS;
            }
            ret.min = banda.computedMin;
            ret.max = banda.computedMax;
            ret.tmpFileName = outFileName;
            ret.resX = info.size[0];
            ret.resY = info.size[1];
            return ret;
        } catch(error) {
            console.error(error);
            throw error;
        }
    }

    async resuelveConsulta(formato, args) {
        try {
            if (formato == "isolineas") {
                return await this.generaIsolineas(args);
            } else if (formato == "isobandas") {
                return await this.generaIsobandas(args);
            } else if (formato == "serieTiempo") {
                return await this.generaSerieTiempo(args);
            } else if (formato == "valorEnPunto") {
                return await this.generaValorEnPunto(args);
            } else if (formato == "uv") {
                return await this.generaMatrizUV(args);
            } else if (formato == "matrizRectangular") {
                return await this.generaMatrizRectangular(args);
            } else throw "Formato " + formato + " no soportado";
        } catch(error) {
            throw error;
        }
    }

    generaIsolineas(args) {
        try {
            let srcFile = config.publishPath + "/" + args.tmpFileName;
            let dstFile = srcFile + ".isocurvas.shp";
            let increment = args.incremento;
            return new Promise((resolve, reject) => {
                gdal.isolineas(srcFile, dstFile, increment)
                    .then(_ => {
                        resolve({fileName:args.tmpFileName + ".isocurvas.shp"});
                    })
                    .catch(err => reject(err));
            });
        } catch(error) {
            throw error;
        }
    }
    generaMarcadores(isolineas) {
        try {
            let ret = [];
            isolineas.features.forEach(f => {
                if (f.geometry.type == "LineString") {
                    let v = Math.round(f.properties.value * 100) / 100;
                    let n = f.geometry.coordinates.length;
                    let med = parseInt((n - 0.1) / 2);
                    let p0 = f.geometry.coordinates[med], p1 = f.geometry.coordinates[med+1];
                    let lng = (p0[0] + p1[0]) / 2;
                    let lat = (p0[1] + p1[1]) / 2;
                    ret.push({lat:lat, lng:lng, value:v});
                }
            });
            return ret;
        } catch(error) {
            console.error(error);
            return [];
        }
    }

    generaIsobandas(args) {
        try {
            let srcFile = config.publishPath + "/" + args.tmpFileName;
            let dstFile = srcFile + ".isobandas.shp";
            let increment = args.incremento;
            return new Promise((resolve, reject) => {
                gdal.isobandas(srcFile, dstFile, increment)
                    .then(_ => {
                        resolve({fileName:args.tmpFileName + ".isobandas.shp"});
                    })
                    .catch(err => reject(err));
            });
        } catch(error) {
            throw error;
        }
    }

    async generaSerieTiempo(args) {
        try {
            let capa = this.getCapa(args.codigoVariable);
            if (!capa) throw "No se encontró la variable '" + args.codigoVariable + "'";
            let levelIndex = 0;
            if (args.levelIndex) levelIndex = args.levelIndex;

            let lat = args.lat;
            let lng = args.lng;
            let advertencias = [];
            let t0 = args.time0;
            let t1 = args.time1;
            let ajusto = false;
            if ((t1 - t0) > 1000 * 60 * 60 * 24 * 20) {
                t1 = t0 + 1000 * 60 * 60 * 24 * 20;
                advertencias.push("El período de consulta es muy amplio. Se ha ajustado a 20 días desde el inicio consultado")
                ajusto = true;
            }
            let time0 = variables.normalizaTiempo(t0);
            let time1 = variables.normalizaTiempo(t1);


            let puntosPendientes = [];
            let time = time0.clone();
            while (!time.isAfter(time1)) {
                let metadata = await variables.getMetadata(time);
                if (metadata) {
                    let varMetadata = metadata.variables[args.codigoVariable + "-" + levelIndex];
                    if (varMetadata) {
                        let banda = varMetadata.banda;
                        let path = this.getPath(time) + "/" + time.format("DD_HH00") + ".grb2";
                        varMetadata["Tiempo"] = time.valueOf();
                        puntosPendientes.push({time:time.valueOf(), lng:lng, lat:lat, path:path, banda:banda, tmpPath:config.dataPath + "/tmp", metadata:varMetadata})
                    }
                }
                time = time.add(3, "hours");
            }
            let ret = {
                lat:lat, lng:lng,
                time0:time0.valueOf(), time1:time1.valueOf(), levelIndex:levelIndex,
                advertencias:advertencias
            }  
            if (!puntosPendientes.length) {
                ret.data = [];
                ret.unit = variables.units[args.codigoVariable];
                return ret;
            }  
            ret.unit = variables.units[args.codigoVariable];
            let puntos = await this.getPuntosTimeSerieEnParalelo(puntosPendientes, 10);
            ret.data = puntos;
            return ret;
        } catch(error) {
            throw error;
        }
    }

    getPuntosTimeSerieEnParalelo(puntosPendientes, nHebras) {
        return new Promise((resolve, reject) => {
            let control = {nPendientesTermino:puntosPendientes.length, resolve:resolve, reject:reject};
            let puntos = [];
            let i=0; 
            while (i<nHebras && puntosPendientes.length) {
                this.iniciaExtraccionSiguientePuntoSerieTiempo(puntosPendientes, puntos, control);
                i++;
            }
        });
    }
    iniciaExtraccionSiguientePuntoSerieTiempo(puntosPendientes, puntosAgregados, control) {
        if (puntosPendientes.length) {
            let args = puntosPendientes[0];
            puntosPendientes.splice(0,1);
            //gdal.getPointValue(args.lng, args.lat, args.path, args.banda, args.tmpPath)
            gdal.getPixelValue(args.lng, args.lat, args.path, args.banda, args.metadata)
                .then(punto => {
                    if (punto.value !== undefined) {
                        let atributos = {
                            "Ejecución Modelo":args.metadata.modelo,
                            "Tiempo":args.metadata.Tiempo
                        }
                        atributos.realLat = punto.realLat;
                        atributos.realLng = punto.realLng;
                        puntosAgregados.push({time:args.time, value:punto.value, atributos:atributos});
                    }
                    control.nPendientesTermino--;
                    this.iniciaExtraccionSiguientePuntoSerieTiempo(puntosPendientes, puntosAgregados, control);
                })
                .catch(error => {
                    control.nPendientesTermino--;
                    this.iniciaExtraccionSiguientePuntoSerieTiempo(puntosPendientes, puntosAgregados, control);
                });            
        } else {
            if (!control.nPendientesTermino) {
                puntosAgregados.sort((p0, p1) => (p0.time - p1.time));
                control.resolve(puntosAgregados);
            }
        }
    }
    
    async generaValorEnPunto(args) {
        try {
            let capa = this.getCapa(args.codigoVariable);
            if (!capa) throw "No se encontró la variable '" + args.codigoVariable + "'";
            let levelIndex = 0;
            if (args.levelIndex) levelIndex = args.levelIndex;

            let lat = args.lat;
            let lng = args.lng;
            let time = variables.normalizaTiempo(args.time);
            let metadata = await variables.getMetadata(time);
            if (!metadata) return "S/D";
            let varMetadata = metadata.variables[args.codigoVariable + "-" + levelIndex];
            if (varMetadata) {
                let atributos = {
                    Tiempo:time,
                    "Ejecución Modelo":varMetadata.modelo
                }
                let banda = varMetadata.banda;
                let path = this.getPath(time) + "/" + time.format("DD_HH00") + ".grb2";
                //let punto = await gdal.getPointValue(lng, lat, path, banda, config.dataPath + "/tmp");
                let punto = await gdal.getPixelValue(lng, lat, path, banda, varMetadata);
                if (!punto) return "S/D";
                atributos.realLng = punto.realLng;
                atributos.realLat = punto.realLat;
                if (args.metadataCompleta) {
                    let info = await gdal.info(path, false);
                    let mdBanda = info.bands[banda - 1];                
                    atributos["Nivel"] = mdBanda.description;
                    let md = mdBanda.metadata[""];
                    if (md) {
                        atributos["Variable GFS"] = md.GRIB_COMMENT;
                        atributos["Disciplina GFS"] = md.GRIB_DISCIPLINE;
                        atributos["Unidad GFS"] = md.GRIB_UNIT;
                        atributos["Pronóstico"] = md.GRIB_FORECAST_SECONDS;
                    }
                }
                return {lng:lng, lat:lat, time:time, metadata:varMetadata, value:punto.value, atributos:atributos}
            }
            return "S/D";
        } catch(error) {
            console.error(error);
            throw error;
        }
    }

    async generaMatrizUV(args) {
        try {
            let capa = this.getCapa(args.codigoVariable);
            let atributos, matrizU, matrizV;
            if (capa.opciones.vector) {
                let argsU = JSON.parse(JSON.stringify(args)); argsU.codigoVariable = capa.opciones.vector.capaU;
                let argsV = JSON.parse(JSON.stringify(args)); argsV.codigoVariable = capa.opciones.vector.capaV;
                let ret = await Promise.all([
                    this.generaMatrizRectangular(argsU),
                    this.generaMatrizRectangular(argsV)
               ]);
                matrizU = ret[0];
                matrizV = ret[1];
                if (!matrizU || !matrizV) throw "No hay Datos";
                atributos = Object.keys(matrizU.metadata).reduce((map, att) => {
                    let aU = matrizU.metadata[att];
                    let aV = matrizV.metadata[att];
                    map[att] = "U:" + aU + ", V:" + aV;
                    return map;
                }, {});
                atributos["Tiempo U"] = matrizU.time;
                atributos["Tiempo V"] = matrizV.time;

            } else if (capa.opciones.direccion) {
                let magnitudes = await this.generaMatrizRectangular(args);
                if (!magnitudes || !magnitudes.rows || !magnitudes.rows.length) throw "No hay Datos";
                atributos = Object.keys(magnitudes.metadata).reduce((map, att) => {
                    map[att] = magnitudes.metadata[att];
                    return map;
                }, {});
                atributos["Tiempo"] = magnitudes.time;

                let argsCapaDireccion = JSON.parse(JSON.stringify(args));
                argsCapaDireccion.codigoVariable = capa.opciones.direccion.capa;

                let direcciones = await this.generaMatrizRectangular(argsCapaDireccion);
                let rowsDirecciones = direcciones.rows;
                matrizU = JSON.parse(JSON.stringify(magnitudes)); matrizU.rows = [];
                matrizV = JSON.parse(JSON.stringify(magnitudes)); matrizV.rows = [];
                rowsDirecciones.forEach((row, i) => {
                    let rowU = [], rowV = [];
                    row.forEach((grados, j) => {
                        let magnitud = magnitudes.rows[i][j];
                        if (magnitud === null || magnitud === undefined || grados === null || grados === undefined) {
                            rowU.push(null); rowV.push(null);
                        } else {
                            let u, v;
                            if (capa.opciones.direccion.transformacion == "estandar-oceanografia") {
                                // http://tornado.sfsu.edu/geosciences/classes/m430/Wind/WindDirection.html
                                u = -Math.sin(Math.PI / 180 * grados);
                                v = -Math.cos(Math.PI / 180 * grados);
                            } else {
                                u = Math.sin(Math.PI / 180 * grados);
                                v = Math.cos(Math.PI / 180 * grados);
                            }
                            rowU.push(magnitud * u); rowV.push(magnitud * v);
                        }
                    })
                    matrizU.rows.push(rowU);
                    matrizV.rows.push(rowV);
                })
            }
            let data = [];
            matrizU.rows.forEach((row, iRow) => {
                row.forEach((vU, iCol) => {
                    let vV = matrizV.rows[iRow][iCol];
                    if (vU !== undefined && vU !== null && vV !== undefined && vV !== null) {
                        data.push(vU, vV);
                    } else {
                        data.push(null, null);
                    }
                });
            });
            let ret = {
                time:variables.normalizaTiempo(args.time).valueOf(),
                lng0:matrizU.lng0, lat0:matrizU.lat0, lng1:matrizU.lng1, lat1:matrizU.lat1,
                deltaLng:matrizU.dx, deltaLat:matrizU.dy,
                nrows:matrizU.nrows, ncols:matrizU.ncols,
                resolution:args.resolution,
                metadataU:matrizU.metadata,
                metadataV:matrizV.metadata,
                atributos:atributos,
                data:data
            }
            return ret;
        } catch(error) {
            console.error(error);
            throw error;
        }
    }

    async generaMatrizRectangular(args, interpolacion) {
        try { 
            let capa = this.getCapa(args.codigoVariable);
            if (!capa) throw "No se encontró la variable '" + args.codigoVariable + "'";
            let levelIndex = 0;
            if (args.levelIndex) levelIndex = args.levelIndex;
            let b = this.normalizaBBox(args.lng0, args.lat0, args.lng1, args.lat1);
            let time = variables.normalizaTiempo(args.time);
            let metadata = await variables.getMetadata(time);
            let varMetadata = metadata?metadata.variables[args.codigoVariable + "-" + levelIndex]:null;
            if (!varMetadata) throw "No hay Datos";

            let maxWidth = args.resolution || args.maxWidth || 250;
            let maxHeight = args.resolution || args.maxHeight || 250;

            let banda = varMetadata.banda;
            let path = this.getPath(time) + "/" + time.format("DD_HH00") + ".grb2";
            let {data, box} = await gdal.getRectangularMatrix(b.lng0, b.lat0, b.lng1, b.lat1, path, banda, maxWidth, maxHeight, config.publishPath, varMetadata, interpolacion);
            data.metadata = varMetadata;
            data.time = time.valueOf();
            data.unit = variables.units[args.codigoVariable];

            if (varMetadata.noDataValue) {
                let min = undefined, max = undefined; // corregir min / max
                data.rows.forEach(row => {
                    row.forEach((v, i) => {
                        if (v == varMetadata.noDataValue) {
                            row[i] = null;
                        } else {
                            if (min === undefined || v < min) min = v;
                            if (max === undefined || v > max) max = v;
                        }
                    });
                })
                data.min = min;
                data.max = max;
            }
            data.advertencias = [];
            if (box.width != box.outWidth) data.advertencias.push("Se ha ajustado el ancho desde " + box.width + " a " + box.outWidth + ". Disminuya el área de consulta para ver todos los datos originales");
            if (box.height != box.outHeight) data.advertencias.push("Se ha ajustado el alto desde " + box.height + " a " + box.outHeight + ". Disminuya el área de consulta para ver todos los datos originales");
            return data;
        } catch(error) {
            console.error(error);
            throw error;
        }
    }
}

module.exports = ProveedorCapasWW3;