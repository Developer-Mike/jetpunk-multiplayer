import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import fs from 'fs'
import path from 'path'
import QuizRoom, { Player } from './types/quiz-room'
import { SubmitAnswerC2S, AnswerSubmittedS2C, ChangeFieldC2S, FieldChangedS2C, ChangeInputC2S, InputChangedS2C, PlayerJoinedS2C, RoomJoinedS2C, SocketEvents, PlayerLeftS2C, WrongQuizUrlS2C } from './types/socket-types'

import { config as configDotenv } from 'dotenv'
configDotenv()

const app = express()
const server = createServer(app)
const io = new Server(server, { cors: { origin: '*' } })

const quizzes: { [id: string]: QuizRoom } = {}

// Serve public files
app.use(express.static('public'))

// Serve /join-room/<ROOM-ID> page
app.get('/join-room/:roomId', (req: any, res: any) => {
  const roomId = req.params.roomId

  fs.readFile(path.join(__dirname, 'pages/join-room.html'), 'utf8', (err, data) => {
    if (err) return console.log(err)
    res.send(data.replace(/ROOM_ID/g, roomId))
  })
})

// Serve client files
app.get('/client/index.user.js', (_req: any, res: any) => {
  fs.readFile(path.join(__dirname, 'client/index.user.js'), 'utf8', (err, data) => {
    if (err) return console.log(err)

    res.setHeader('Content-Type', 'text/javascript')
    res.send(data.replace(/SERVER_URL/g, process.env.SERVER_URL || 'http://localhost:3000'))
  })
})

app.get('/client/styles.css', (_req: any, res: any) => {
  fs.readFile(path.join(__dirname, 'client/styles.css'), 'utf8', (err, data) => {
    if (err) return console.log(err)

    res.setHeader('Content-Type', 'text/css')
    res.send(data)
  })
})

// Middleware
io.use((socket, next) => {
  const id = socket.handshake.query.id as string
  const username = socket.handshake.query.username as string
  const quizUrl = socket.handshake.query.quizUrl as string
  const roomId = socket.handshake.query.roomId as string

  if (!id || !username || !quizUrl || !roomId) return next(new Error('Missing query parameters'))
  if (quizzes[roomId]?.inGame) return next(new Error('Room is already in a game'))

  next()
})

server.listen(process.env.SERVER_PORT, () => {
  console.log(`listening on *:${process.env.SERVER_PORT}`)
})

// Handle socket events
io.on('connection', socket => {
  const id = socket.handshake.query.id as string
  const username = socket.handshake.query.username as string
  const quizUrl = socket.handshake.query.quizUrl as string
  const roomId = socket.handshake.query.roomId as string

  if (quizzes[roomId] && quizzes[roomId].quizUrl !== quizUrl) {
    socket.emit(SocketEvents.S2C.WRONG_QUIZ_URL, { quizUrl: quizzes[roomId].quizUrl } as WrongQuizUrlS2C)
    return socket.disconnect()
  }
  
  socket.join(roomId)
  if (!quizzes[roomId]) quizzes[roomId] = {
    inGame: false,
    players: {},
    quizUrl: quizUrl,
    answers: []
  } as QuizRoom
  
  if (!quizzes[roomId].players[id])
    quizzes[roomId].players[id] = { username } as Player
  quizzes[roomId].players[id].connected = true

  // Update client
  socket.emit(SocketEvents.S2C.ROOM_JOINED, { room: quizzes[roomId] } as RoomJoinedS2C)

  // Notify all players
  io.to(roomId).emit(SocketEvents.S2C.PLAYER_JOINED, { id, username } as PlayerJoinedS2C)

  console.log(`User ${username} (${id}) connected to room ${roomId}`)

  socket.on(SocketEvents.C2S.START_QUIZ, _msg => {
    if (!roomId) return console.log(`${username} is not in a room`)

    quizzes[roomId].inGame = true

    // Notify other players
    io.to(roomId).emit(SocketEvents.S2C.QUIZ_STARTED)
  })

  socket.on(SocketEvents.C2S.CHANGE_FIELD, (msg: ChangeFieldC2S) => {
    if (!roomId) return console.log(`${username} is not in a room`)

    quizzes[roomId].players[id].currentField = msg.fieldId

    // Notify other players
    socket.to(roomId).emit(SocketEvents.S2C.FIELD_CHANGED, { id, fieldId: msg.fieldId } as FieldChangedS2C)
  })

  socket.on(SocketEvents.C2S.CHANGE_INPUT, (msg: ChangeInputC2S) => {
    if (!roomId) return console.log(`${username} is not in a room`)

    quizzes[roomId].players[id].currentAnswer = msg.value

    // Notify other players
    socket.to(roomId).emit(SocketEvents.S2C.INPUT_CHANGED, { id, value: msg.value } as InputChangedS2C)
  })

  socket.on(SocketEvents.C2S.SUBMIT_ANSWER, (msg: SubmitAnswerC2S) => {
    if (!roomId) return console.log(`${username} is not in a room`)

    quizzes[roomId].answers.push({
      fieldId: msg.fieldId,
      value: msg.answer,
      playerId: id
    })

    // Notify other players
    socket.to(roomId).emit(SocketEvents.S2C.ANSWER_SUBMITTED, { id, fieldId: msg.fieldId, answer: msg.answer } as AnswerSubmittedS2C)
  })

  socket.on(SocketEvents.C2S.PAUSE_QUIZ, _msg => {
    if (!roomId) return console.log(`${username} is not in a room`)

    // Notify other players
    socket.to(roomId).emit(SocketEvents.S2C.QUIZ_PAUSED)
  })

  socket.on(SocketEvents.C2S.UNPAUSE_QUIZ, _msg => {
    if (!roomId) return console.log(`${username} is not in a room`)

    // Notify other players
    socket.to(roomId).emit(SocketEvents.S2C.QUIZ_UNPAUSED)
  })

  socket.on(SocketEvents.C2S.UNLIMITED_TIME_ENABLED, _msg => {
    if (!roomId) return console.log(`${username} is not in a room`)

    // Notify other players
    socket.to(roomId).emit(SocketEvents.S2C.ON_UNLIMITED_TIME_ENABLED)
  })

  socket.on(SocketEvents.C2S.END_QUIZ, _msg => {
    if (!roomId) return console.log(`${username} is not in a room`)

    // Notify other players
    socket.to(roomId).emit(SocketEvents.S2C.QUIZ_ENDED)
  })

  socket.on('disconnect', () => {
    console.log(`User ${username} disconnected`)

    // Update player status
    quizzes[roomId].players[id].connected = false

    // Delete room if no players are connected
    if (Object.values(quizzes[roomId].players).every(player => !player.connected)) delete quizzes[roomId]
    
    // Notify other players
    socket.to(roomId).emit(SocketEvents.S2C.PLAYER_LEFT, { id } as PlayerLeftS2C)
  })
})