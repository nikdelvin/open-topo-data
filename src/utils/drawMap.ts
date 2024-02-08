import { TypedArray, fromArrayBuffer } from "geotiff";
import fs from 'fs'

function generateColorRange(levels: number, grayScale: boolean) {
    const colors = []
    const maxColor = 255
    const colorCap = maxColor / levels
    for (let lvl = 0; lvl < levels; lvl++) {
        const currentColor = lvl * colorCap
        let r = 0, g = 0, b = 0
        if (currentColor >= 0 && currentColor <= 128) {
            g = currentColor / 128
            r = 1 - g
            b = 0
        } else if (currentColor > 128 && currentColor <= 255) {
            b = (currentColor - 127) / 128
            g = 1 - b
            r = 0
        }
        if (grayScale) {
            colors.push(`rgb(${Math.round(currentColor)},${Math.round(currentColor)},${Math.round(currentColor)})`)
        } else {
            colors.push(`rgb(${Math.round(r*255)},${Math.round(g*255)},${Math.round(b*255)})`)
        }
    }
    return grayScale ? colors : colors.reverse()
}

function transform(a: number, b: number, M: number[], roundToInt = false): [number, number] {
    const round = (v: number) => (roundToInt ? v | 0 : v)
    return [
        round(M[0] + M[1] * a + M[2] * b),
        round(M[3] + M[4] * a + M[5] * b),
    ]
}

export async function prepareMap() {
    const buffer = fs.readFileSync('data/ETOPO.tif')
    const tiff = await fromArrayBuffer(buffer.buffer)
    const image = await tiff.getImage()
    const rasters = await image.readRasters()
    const { width, [0]: raster } = rasters
    const { ModelPixelScale, ModelTiepoint } = image.fileDirectory
    const sx = ModelPixelScale[0]
    const sy = -ModelPixelScale[1]
    const gx = ModelTiepoint[3]
    const gy = ModelTiepoint[4]
    const gpsToPixel = [-gx / sx, 1 / sx, 0, -gy / sy, 0, 1 / sy]
    return { width, raster: raster as TypedArray, gpsToPixel }
}

export function drawMap(body: Record<string, number | boolean>, map: { width: number, raster: TypedArray, gpsToPixel: number[] }) {
    const lat = body.lat as number
    const lng = body.lng as number
    const zoom = body.fullMap ? 1 : body.zoom as number
    const quality = body.quality as number
    const fullMap = body.fullMap as boolean
    const levels = body.levels as number
    const grayScale = body.grayScale as boolean
    const startPoint: { lat?: number, lng?: number, x?: number, y?: number } = {}
    const endPoint: { lat?: number, lng?: number, x?: number, y?: number } = {}
    startPoint.lat = fullMap ? -90 : lat + (106 / Math.pow(10, zoom) / (zoom > 0 ? 2 : 4))
    startPoint.lng = fullMap ? -180 : lng + (377 / Math.pow(10, zoom) / (zoom > 0 ? 2 : 4))
    endPoint.lat = fullMap ? 90 : lat - (106 / Math.pow(10, zoom) / (zoom > 0 ? 2 : 4))
    endPoint.lng = fullMap ? 180 : lng - (377 / Math.pow(10, zoom) / (zoom > 0 ? 2 : 4))
    const coordsMatrix: number[][] = [[], [], []]
    const iIterSize = Math.abs(Math.round(startPoint.lat * Math.pow(10, zoom) - endPoint.lat * Math.pow(10, zoom)))
    const jIterSize = Math.abs(Math.round(startPoint.lng * Math.pow(10, zoom) - endPoint.lng * Math.pow(10, zoom)))
    for (let i = 0; i < iIterSize + 1; i += (fullMap ? 8.5 : 0.5 * (zoom > 0 ? quality : quality / 2))) {
        for (let j = 0; j < jIterSize + 1; j += (fullMap ? 9.5 : 1 * (zoom > 0 ? quality : quality / 2))) {
            const coord: { lat?: number, lng?: number } = {}
            if (startPoint.lat - endPoint.lat > 0) coord.lat = Math.round(startPoint.lat * Math.pow(10, zoom)) - i
            else coord.lat = Math.round(startPoint.lat * Math.pow(10, zoom)) + i
            if (startPoint.lng - endPoint.lng > 0) coord.lng = Math.round(startPoint.lng * Math.pow(10, zoom)) - j
            else coord.lng = Math.round(startPoint.lng * Math.pow(10, zoom)) + j
            coord.lat = coord.lat / Math.pow(10, zoom)
            coord.lng = coord.lng / Math.pow(10, zoom)
            const x = (coord.lng + 180) * (1920 / 360)
            const y = ((-1 * coord.lat) + 90) * (1080 / 180)
            if (coord.lat > 90) coord.lat = -(90 - (coord.lat - 90))
            if (coord.lat < -90) coord.lat = (90 + (coord.lat + 90))
            if (coord.lng > 180) coord.lng = -(180 - (coord.lng - 180))
            if (coord.lng < -180) coord.lng = (180 + (coord.lng + 180))
            const [xRaster, yRaster] = transform(coord.lng, coord.lat, map.gpsToPixel, true)
            const elevation = map.raster[xRaster + yRaster * map.width]
            coordsMatrix[0].push(x)
            coordsMatrix[1].push(y)
            coordsMatrix[2].push(elevation)
        }
    }
    const countX = Array.from(new Set(coordsMatrix[0])).length
    const countY = Array.from(new Set(coordsMatrix[1])).length
    const minX = Math.min(...coordsMatrix[0])
    const diffX = Math.max(...coordsMatrix[0]) - minX
    const minY = Math.min(...coordsMatrix[1])
    const diffY = Math.max(...coordsMatrix[1]) - minY
    // TODO: Add relative height option
    const minHeight = -10921
    const maxHeight = 8849
    const diffHeight = maxHeight - minHeight
    const heightLevelCap = diffHeight / levels
    const colors = generateColorRange(levels + 1, grayScale)
    const heightGroups: Record<string, any[]> = {}
    for (let i = 0; i < coordsMatrix[0].length; i++) {
        const resultCoord = []
        const x = coordsMatrix[0][i]
        const y = coordsMatrix[1][i]
        resultCoord[0] = (x - minX) / diffX * 1920
        resultCoord[1] = (y - minY) / diffY * 1080
        resultCoord[2] = coordsMatrix[2][i]
        for (let lvl = 0; lvl < levels + 1; lvl++) {
            if (resultCoord[2] >= (minHeight + (heightLevelCap * (lvl))) && 
                resultCoord[2] < (minHeight + (heightLevelCap * (lvl+1)))) {
                if (heightGroups[colors[lvl]] == null ) {
                    heightGroups[colors[lvl]] = []
                }
                heightGroups[colors[lvl]].push(resultCoord)
            }
        }
    }
    return { heightGroups, deltaX: 1920 / countX, deltaY: 1080 / countY }
}