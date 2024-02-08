"use client"

import { RecoilRoot } from 'recoil'
import io, { Socket } from 'socket.io-client'
import { useEffect, useRef, useState } from "react"
import { Leva, useControls, button, folder } from 'leva'

export default function Map() {
    const canvas = useRef<HTMLCanvasElement>(null)
    const download = useRef<HTMLAnchorElement>(null)
    const socket = useRef<Socket | null>(null)
    const [task, setTask] = useState(true)
    const labels = {
        coords: 'Coordinates',
        lat: 'Latitude',
        lng: 'Longitude',
        preset: 'Point Preset',
        fullMap: 'Render full Earth map',
        render: 'Rendering',
        zoom: 'Zoom (from x0 to x3)',
        quality: 'Quality (from max details to min)',
        coloring: 'Coloring',
        levels: 'Color Levels Count',
        grayScale: 'Set Gray Scale',
        generate: 'Generate map',
        download: 'Export map to image'
    }
    const [fields, set] = useControls(() => ({
        [labels.coords]: folder({
            [labels.lat]: { value: 0, step: 0.001, min: -89, max: 89, pad: 3 },
            [labels.lng]: { value: 0, step: 0.001, min: -179, max: 179, pad: 3 }, 
            [labels.preset]: { options: {
                'None': () => setPreset(0, 0),
                'Everest': () => setPreset(27.988093, 86.924972),
                'Kilimanjaro': () => setPreset(-3.064691, 37.358225),
                'Mariana Trench': () => setPreset(11.346521, 142.197337),
                'Rosa Archipelago': () => setPreset(-77.648325, 164.898946)
            }},
            [labels.fullMap]: false
        }),
        [labels.render]: folder({
            [labels.zoom]: { value: 1, step: 1, min: 0, max: 3, pad: 0 },
            [labels.quality]: { value: 4, step: 1, min: 1, max: 6, pad: 0 }
        }),
        [labels.coloring]: folder({
            [labels.levels]: { value: 100, step: 1, min: 2, max: 100, pad: 0 },
            [labels.grayScale]: false
        }),
        [labels.generate]: button((get) => {
            const context = canvas.current!.getContext('2d')!
            context.fillStyle = '#ffffff'
            context.fillRect(0, 0, canvas.current!.width, canvas.current!.height)
            socket.current!.emit('task', { from: socket.current!.id, type: 'drawMap', id: 'map', body: {
                lat: get(`${labels.coords}.${labels.lat}`),
                lng: get(`${labels.coords}.${labels.lng}`),
                zoom: get(`${labels.render}.${labels.zoom}`),
                quality: get(`${labels.render}.${labels.quality}`),
                levels: get(`${labels.coloring}.${labels.levels}`),
                grayScale: get(`${labels.coloring}.${labels.grayScale}`),
                fullMap: get(`${labels.coords}.${labels.fullMap}`)
            }})
            setTask(true)
        }, { disabled: task }),
        [labels.download]: button(() => {
            const image = canvas.current!.toDataURL("image/png").replace("image/png", "image/octet-stream")
            download.current!.setAttribute('download', `map-${Date.now()}.png`)
            download.current!.setAttribute('href', image)
            download.current!.click()
        }, { disabled: task })
    }), [task])
    function setPreset(lat: number, lng: number) {
        set({ [labels.lat]: lat, [labels.lng]: lng })
    }
    useEffect(() => {
        (fields[labels.preset] as () => void)()
    }, [fields[labels.preset]])
    useEffect(() => {
        const socketIO = io({ path: '/api/ws' })
        socketIO.on('task-result', ({type, id, payload}) => {
            if (type === 'drawMap' && id === 'map') {
                const context = canvas.current!.getContext("2d")!
                for (const [index, group] of Object.entries(payload.heightGroups)) {
                    for (const coord of (group as any[])) {
                        context.fillStyle = index
                        context.fillRect(coord[0], coord[1], payload.deltaX, payload.deltaY)
                    }
                }
                setTask(false)
            }
        })
        socketIO.on('ready', () => {
            socketIO.emit('task', { from: socketIO.id, type: 'drawMap', id: 'map', body: {
                lat: parseFloat((fields[labels.lat] as number).toFixed(3)),
                lng: parseFloat((fields[labels.lng] as number).toFixed(3)),
                zoom: Math.round(fields[labels.zoom] as number),
                quality: Math.round(fields[labels.quality] as number),
                levels: Math.round(fields[labels.levels] as number),
                grayScale: fields[labels.grayScale] as boolean,
                fullMap: fields[labels.fullMap] as boolean
            }})
        })
        socketIO.on('connect', () => {
            socket.current = socketIO
        })
        const context = canvas.current!.getContext("2d")!
        context.fillStyle = '#ffffff'
        context.fillRect(0, 0, canvas.current!.width, canvas.current!.height)
    }, [])

    return (
        <RecoilRoot>
            <Leva oneLineLabels={true} titleBar={{ title: 'Settings', filter: false, drag: false }}/>
            <main className="select-none overflow-hidden">
                <div className="fixed top-0 left-0 flex flex-col w-screen h-screen bg-zinc-50">
                    <canvas ref={canvas} className="w-screen h-screen" width={1920} height={1080}/>
                    <a ref={download} href="/" className="hidden"/>
                </div>
            </main>
        </RecoilRoot>
    )
}