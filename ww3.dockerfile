# docker run --mount type=bind,source=/Volumes/JSamsung/geoportal/gfs4/data,target=/home/data --mount type=bind,source=/Volumes/JSamsung/geoportal/gfs4/publish,target=/home/publish otrojota/geoportal:gfs4
FROM otrojota/geoportal:gdal-nodejs-1.01
WORKDIR /opt/geoportal/geop-ww3
COPY . .
RUN npm install 
EXPOSE 8187
CMD node index.js