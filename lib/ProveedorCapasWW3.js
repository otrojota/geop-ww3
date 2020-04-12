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
                    opciones.formatos.windglPNG = true;
                    opciones.direccion = variable.direccion;
                    opciones.vector = variable.vector;
                }
                if (variable.codigo == "WIND_DIRECTION") {
                    opciones.formatos.uv = true;
                    opciones.formatos.windglPNG = true;
                    opciones.vector = {capaU:"WIND_UGRD", capaV:"WIND_VGRD"}
                } else if (variable.codigo == "OLAS_DIR_PRIM") {
                    opciones.formatos.uv = true;
                    opciones.formatos.windglPNG = true;
                    opciones.direccion = {capa:"OLAS_DIR_PRIM", transformacion:"estandar-oceanografia"}
                } else if (variable.codigo == "OLAS_DIR_WIND") {
                    opciones.formatos.uv = true;
                    opciones.formatos.windglPNG = true;
                    opciones.direccion = {capa:"OLAS_DIR_WIND", transformacion:"estandar-oceanografia"}
                } else if (variable.codigo == "OLAS_DIR_SWELL1") {
                    opciones.formatos.uv = true;
                    opciones.formatos.windglPNG = true;
                    opciones.direccion = {capa:"OLAS_DIR_SWELL1", transformacion:"estandar-oceanografia"}
                } else if (variable.codigo == "OLAS_DIR_SWELL2") {
                    opciones.formatos.uv = true;
                    opciones.formatos.windglPNG = true;
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
            } else if (formato == "windglPNG") {
                return await this.generaWindGLPNG(args);
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
            let time0 = variables.normalizaTiempo(args.time0);
            let time1 = variables.normalizaTiempo(args.time1);

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
                time0:time0.valueOf(), time1:time1.valueOf(), levelIndex:levelIndex
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
            gdal.getPointValue(args.lng, args.lat, args.path, args.banda, args.tmpPath)
                .then(punto => {
                    let atributos = {
                        "Ejecución Modelo":args.metadata.modelo,
                        "Tiempo":args.metadata.Tiempo
                    }
                    puntosAgregados.push({time:args.time, value:punto, atributos:atributos});
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
                let punto = await gdal.getPointValue(lng, lat, path, banda, config.dataPath + "/tmp");
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
                return {lng:lng, lat:lat, time:time, metadata:varMetadata, value:punto, atributos:atributos}
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
            let b = this.normalizaBBox(args.lng0, args.lat0, args.lng1, args.lat1);
            let atributos, matrizU, matrizV;
            if (capa.opciones.vector) {
                let argsU = JSON.parse(JSON.stringify(args)); argsU.codigoVariable = capa.opciones.vector.capaU;
                let argsV = JSON.parse(JSON.stringify(args)); argsV.codigoVariable = capa.opciones.vector.capaV;
                let ret = await Promise.all([
                    this.generaMatrizRegular(argsU),
                    this.generaMatrizRegular(argsV)
                ]);
                matrizU = ret[0];
                matrizV = ret[1];
                if (!matrizU || !matrizV) throw "No hay Datos";
                atributos = Object.keys(matrizU.atributos).reduce((map, att) => {
                    if (att == "Tiempo") {
                        map["Tiempo U"] = matrizU.atributos["Tiempo"];
                        map["Tiempo V"] = matrizV.atributos["Tiempo"];
                    } else {
                        let aU = matrizU.atributos[att];
                        let aV = matrizV.atributos[att];
                        map[att] = "U:" + aU + ", V:" + aV;
                    }
                    return map;
                }, {});
            } else if (capa.opciones.direccion) {
                let argsCapaDireccion = JSON.parse(JSON.stringify(args));
                argsCapaDireccion.codigoVariable = capa.opciones.direccion.capa;
                let ret = await this.generaMatrizRegular(argsCapaDireccion);
                matrizU = {data:[]}, matrizV = {data:[]};
                if (!ret || !ret.data) throw "No hay Datos";
                ret.data.forEach(grados => {
                    if (grados === null) {
                        matrizU.data.push(null); matrizV.data.push(null);
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
                        matrizU.data.push(u);
                        matrizV.data.push(v);
                    }
                });
                atributos = ret.atributos;
            }
            let ret = {
                time:variables.normalizaTiempo(args.time).valueOf(),
                lng0:b.lng0, lat0:b.lat0, lng1:b.lng1, lat1:b.lat1,
                deltaLng:(b.lng1 - b.lng0) / args.resolution,
                deltaLat:(b.lat1 - b.lat0) / args.resolution,
                resolution:args.resolution,
                metadataU:matrizU.metadata,
                metadataV:matrizV.metadata,
                atributos:atributos,
                data:matrizU.data.reduce((lista, v, i) => {
                    lista.push(v, matrizV.data[i]);
                    return lista;
                }, [])
            }
            return ret;
        } catch(error) {
            console.error(error);
            throw error;
        }
    }

    async generaMatrizRegular(args) {
        try {
            let levelIndex =    0;
            if (args.levelIndex) levelIndex = args.levelIndex;
            let b = this.normalizaBBox(args.lng0, args.lat0, args.lng1, args.lat1);
            let time = variables.normalizaTiempo(args.time);
            let metadata = await variables.getMetadata(time);
            let varMetadata = metadata?metadata.variables[args.codigoVariable + "-" + levelIndex]:null;
            let resolution = args.resolution;
            if (varMetadata) {
                let banda = varMetadata.banda;
                let path = this.getPath(time) + "/" + time.format("DD_HH00") + ".grb2";
                let retData = await gdal.getRegularMatrix(b.lng0, b.lat0, b.lng1, b.lat1, path, banda, resolution, config.publishPath);
                if (varMetadata.noDataValue !== undefined) {
                    retData = retData.reduce((lista, v) => {
                        if (v === varMetadata.noDataValue) lista.push(null);
                        else lista.push(v);
                        return lista;
                    }, []);
                }
                let info = await gdal.info(path, true, banda);
                let mdBanda = info.bands[banda - 1];
                let atributos = {};
                atributos["Nivel"] = mdBanda.description;
                atributos["Ejecución Modelo"] = varMetadata.modelo;
                atributos.Tiempo = time.valueOf();
                let md = mdBanda.metadata[""];
                if (md) {
                    atributos["Variable"] = md.GRIB_COMMENT;
                    atributos["Disciplina"] = md.GRIB_DISCIPLINE;
                    atributos["Unidad"] = md.GRIB_UNIT;
                    atributos["Pronóstico"] = md.GRIB_FORECAST_SECONDS;
                }
                return {
                    metadata:varMetadata,
                    data:retData,
                    atributos:atributos
                }
            } else {
                return null;
            }
        } catch(error) {
            console.error(error);
            throw error;
        }
    }

    async generaWindGLPNG(args) {
        try {
            let levelIndex = 0;
            if (args.levelIndex) levelIndex = args.levelIndex;
            let b = this.normalizaBBox(args.lng0, args.lat0, args.lng1, args.lat1);
            let time = variables.normalizaTiempo(args.time);
            let metadata = await variables.getMetadata(time);
            if (!metadata) throw "No hay Datos";
            let capa = this.getCapa(args.codigoVariable);
            if (!capa) throw "No se encontró la variable";
            let ret = {
                lat0:b.lat0, lat1:b.lat1, lng0:b.lng0, lng1:b.lng1, 
                time:time.valueOf(),
                levelIndex:levelIndex,
                mensajes:[], advertencias:[], errores:[],
                atributos:{}
            }
            let dLng = args.lng1 - args.lng0;
            let dLat = args.lat1 - args.lat0;
            let width, height;
            const resolution = 360;
            if (dLng > dLat) {
                width = resolution;
                height = resolution * dLat / dLng;
            } else {
                height = resolution;
                width = resolution * dLng / dLat;
            }
            if (width != parseInt(width)) width = parseInt(width) + 1;
            if (height != parseInt(height)) height = parseInt(height) + 1;
            ret.mensajes.push("Usando resolución " + width + "[lng] x " + height + "[lat]");

            let u = [], v = [];
            if (capa.opciones.vector) {
                let codigoVariableU = capa.opciones.vector.capaU;
                let codigoVariableV = capa.opciones.vector.capaV;
                let varMetadataU = metadata.variables[codigoVariableU + "-" + levelIndex];
                let varMetadataV = metadata.variables[codigoVariableV + "-" + levelIndex];
                if (!varMetadataU || !varMetadataV) throw "No hay Datos";            
                ret.unit = varMetadataU.unit;
                let path = this.getPath(time) + "/" + time.format("DD_HH00") + ".grb2";
                let bandaU = varMetadataU.banda;
                let bandaV = varMetadataV.banda;
                let [dataU, dataV] = await(
                    Promise.all([
                        gdal.getRectangularMatrix(b.lng0, b.lat0, b.lng1, b.lat1, path, bandaU, width, height, config.publishPath),
                        gdal.getRectangularMatrix(b.lng0, b.lat0, b.lng1, b.lat1, path, bandaV, width, height, config.publishPath)
                    ])
                );

                let info = await gdal.info(path, true);
                let mBandaU = info.bands[bandaU - 1];
                let mBandaV = info.bands[bandaV - 1];
                ret.atributos["Nivel"] = "U: " + mBandaU.description + ", V: " + mBandaV.description;
                ret.atributos.Tiempo = metadata.tiempo;
                let mdU = mBandaU.metadata[""];
                let mdV = mBandaV.metadata[""];
                if (mdU && mdV) {
                    ret.atributos["Variable"] = "U: " + mdU.GRIB_COMMENT + ", V: " + mdV.GRIB_COMMENT;
                    ret.atributos["Disciplina"] = "U: " + mdU.GRIB_DISCIPLINE + ", V: " + mdV.GRIB_DISCIPLINE;
                    ret.atributos["Unidad"] = "U: " + mdU.GRIB_UNIT + ", V: " + mdV.GRIB_UNIT;
                    ret.atributos["Pronóstico"] = "U: " + mdU.GRIB_FORECAST_SECONDS + ", V: " + mdV.GRIB_FORECAST_SECONDS;
                }

                dataU.rows.forEach(row => row.forEach(value => {
                    if (varMetadataU.noDataValue !== undefined && value === varMetadataU.noDataValue) u.push(null);
                    else u.push(value)
                }));
                dataV.rows.forEach(row => row.forEach(value => {
                    if (varMetadataV.noDataValue !== undefined && value === varMetadataV.noDataValue) v.push(null);
                    else v.push(value)
                }));
            } else if (capa.opciones.direccion) {  
                ret.vectorSinMagnitud = true;
                let argsCapaDireccion = JSON.parse(JSON.stringify(args));
                argsCapaDireccion.codigoVariable = capa.opciones.direccion.capa;
                let path = this.getPath(time) + "/" + time.format("DD_HH00") + ".grb2";
                let metadataDireccion = metadata.variables[capa.opciones.direccion.capa + "-" + levelIndex]
                let direccion = await gdal.getRectangularMatrix(b.lng0, b.lat0, b.lng1, b.lat1, path, metadataDireccion.banda, width, height, config.publishPath);
                direccion.rows.forEach(row => row.forEach(grados => {
                    if (metadataDireccion.noDataValue !== undefined && grados === metadataDireccion.noDataValue) {
                        u.push(null);
                        v.push(null);
                    } else {
                        let compU, compV;
                        if (capa.opciones.direccion.transformacion == "estandar-oceanografia") {
                            // http://tornado.sfsu.edu/geosciences/classes/m430/Wind/WindDirection.html
                            compU = -Math.sin(Math.PI / 180 * grados);
                            compV = -Math.cos(Math.PI / 180 * grados);
                        } else {
                            compU = Math.sin(Math.PI / 180 * grados);
                            compV = Math.cos(Math.PI / 180 * grados);
                        }
                        u.push(compU);
                        v.push(compV);
                    }
                }));
            }

            let minU, maxU, minV, maxV;
            if (!ret.vectorSinMagnitud) {
                u.filter(u => u !== undefined && u !== null).forEach(u => {
                    if (minU === undefined || u < minU) minU = u;
                    if (maxU === undefined || u > maxU) maxU = u;
                });
                v.filter(v => v !== undefined && v !== null).forEach(v => {
                    if (minV === undefined || v < minV) minV = v;
                    if (maxV === undefined || v > maxV) maxV = v;
                });
            } else {
                minU = -1; maxU = 1;
                minV = -1; maxV = 1;
            }
            let minMagnitud, maxMagnitud;
            if (!ret.vectorSinMagnitud) {
                for (let i=0; i<u.length; i++) {
                    if (u[i] !== null && v[i] !== null) {
                        let m = Math.sqrt(u[i] * u[i] + v[i] * v[i]);
                        if (minMagnitud === undefined || m < minMagnitud) minMagnitud = m;
                        if (maxMagnitud === undefined || m > maxMagnitud) maxMagnitud = m;
                    }
                }
            } else {
                minMagnitud = -1; maxMagnitud = 1;
            }
            ret.minMagnitud = minMagnitud;
            ret.maxMagnitud = maxMagnitud;

            const png = new PNG({
                colorType: 6,
                filterType: 4,
                width: width,
                height: height
            });
            const deltaU = maxU - minU, deltaV = maxV - minV;              
            for (let y=0; y<height; y++) {
                for (let x=0; x<width; x++) {
                    const i = ((height - y - 1) * width + x) * 4;
                    const k = y * width + x;
                    if (u[k] === null || v[k] === null) {
                        png.data[i + 0] = 255;
                        png.data[i + 1] = 0;
                        png.data[i + 2] = 0;
                        png.data[i + 3] = 0;
                    } else {
                        png.data[i + 0] = Math.floor(255 * (u[k] - minU) / deltaU);
                        png.data[i + 1] = Math.floor(255 * (v[k] - minV) / deltaV);
                        png.data[i + 2] = 0;
                        png.data[i + 3] = 255;
                    }
                    /*
                    let a = 90;
                    let uu = Math.cos(Math.PI / 180 * a), vv = Math.sin(Math.PI / 180 * a); 
                    png.data[i + 0] = Math.floor(255 * (uu + 1) / 2);
                    png.data[i + 1] = Math.floor(255 * (vv + 1) / 2);
                    png.data[i + 2] = 0;
                    png.data[i + 3] = 255;
                    */
                }
            }
            ret.width = width;
            ret.height = height;
            ret.uMin = minU;
            ret.uMax = maxU;
            ret.vMin = minV;
            ret.vMax = maxV;
            const fileName = "windgl-" + parseInt(10000*Math.random()) + ".png";
            let filePath = config.publishPath + "/" + fileName;
            ret.textureFile = fileName;
            
            await (new Promise(resolve => {
                let writeStream = fs.createWriteStream(filePath);
                writeStream.on("close", _ => resolve());
                png.pack().pipe(writeStream);
            }));

            return ret;
        } catch(error) {
            console.error(error);
            throw error;
        }
    }

    async generaMatrizRectangular(args) {
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
            let maxWidth = args.maxWidth || 150;
            let maxHeight = args.maxHeight || 150;
            let dx = 0.5, dy = 0.5;
            let width, height;
            if ((b.lng1 - b.lng0) / dx > maxWidth) {
                width = maxWidth; 
                height = (b.lat1 - b.lat0) / dy;
            }
            if ((b.lat1 - b.lat0) / dy > maxHeight) {
                height = maxHeight;
                if (width === undefined) width = (b.lng1 - b.lng0) / dx;
            }
            let banda = varMetadata.banda;
            let path = this.getPath(time) + "/" + time.format("DD_HH00") + ".grb2";
            let data = await gdal.getRectangularMatrix(b.lng0, b.lat0, b.lng1, b.lat1, path, banda, width, height, config.publishPath);            
            if (!data.dx && data.cellsize) data.dx = data.cellsize;
            if (!data.dy && data.cellsize) data.dy = data.cellsize;
            data.unit = variables.units[args.codigoVariable];
            data.lng0 = b.lng0; data.lng1 = b.lng1;
            data.lat0 = b.lat0; data.lat1 = b.lat1;
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
            if (width == maxWidth || height == maxHeight) data.advertencias = ["Se han interpolado los resultados para ajustarse a una resolución de " + width + "[lng] x " + height + "[lat]. Para obtener los datos originales, consulte por un área más pequeña."];
            return data;
        } catch(error) {
            console.error(error);
            throw error;
        }
    }
}

module.exports = ProveedorCapasWW3;