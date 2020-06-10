# docker run --mount type=bind,source=/Volumes/JSamsung/geoportal/gfs4/data,target=/home/data --mount type=bind,source=/Volumes/JSamsung/geoportal/gfs4/publish,target=/home/publish otrojota/geoportal:gfs4
#
# docker build -f ww3.dockerfile -t otrojota/geoportal:ww3-0.23 .
# docker push otrojota/geoportal:ww3-0.23
#
FROM otrojota/geoportal:gdal-nodejs-1.01
WORKDIR /opt/geoportal/geop-ww3
COPY . .
RUN npm install 
EXPOSE 8187
CMD node index.js