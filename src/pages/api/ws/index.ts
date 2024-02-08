import { Server, ServerOptions } from 'socket.io'
import type { NextApiRequest, NextApiResponse } from 'next'
import cors from "cors"
import fs from 'fs'
import { drawMap, prepareMap } from '@/utils/drawMap'

interface IOSocket {
    server: Partial<ServerOptions> & { io: Server }
}

const corsMiddleware = cors()

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if ((res.socket as never as IOSocket).server.io) {
        res.end()
        return
    }
    const io = new Server((res.socket as never as IOSocket).server, {
        path: "/api/ws",
        addTrailingSlash: false
    })
    io.on('connection', async (socket) => {
        console.log(`Socket ${socket.id} connected.`)
        const map = await prepareMap()
        io.to(socket.id).emit('ready')
        socket.on('task', async ({from, type, id, body}) => {
            if (type === 'drawMap') {
                const payload = drawMap(body, map)
                io.to(from).emit('task-result', {type, id, payload})
            }
        })
        socket.on('disconnect', () => {
            console.log(`Socket ${socket.id} disconnected.`)
        })
    })
    corsMiddleware(req, res, () => {
        (res.socket as never as IOSocket).server.io = io
        res.end()
        return
    })
}