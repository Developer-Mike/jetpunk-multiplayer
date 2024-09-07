// ==UserScript==
// @name         Jetpunk Multiplayer
// @namespace    com.mike
// @version      1.0
// @description  Play Jetpunk quizzes together with your friends
// @author       Developer-Mike
// @match        https://www.jetpunk.com/*
// @icon         https://www.jetpunk.com/apple-touch-icon-152x152.png
// @updateURL    SERVER_URL/client/index.user.js
// @downloadURL  SERVER_URL/client/index.user.js
// @require      SERVER_URL/socket.io/socket.io.js
// @resource css SERVER_URL/client/styles.css
// @grant        GM_getResourceText
// @grant        GM_addStyle
// @run-at       document-end
// ==/UserScript==

declare var io: (...params: any) => any
declare var GM_getResourceText: (id: string) => string
declare var GM_addStyle: (css: string) => void

function getId() {
  let id = document.cookie.replace(/(?:(?:^|.*;\s*)multiplayer-id\s*\=\s*([^;]*).*$)|^.*$/, "$1")

  if (id.length <= 0) {
    id = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
    document.cookie = `multiplayer-id=${id}`
  }

  return id
}

function getUsername() {
  let username = document.cookie.replace(/(?:(?:^|.*;\s*)multiplayer-username\s*\=\s*([^;]*).*$)|^.*$/, "$1")

  if (username.length <= 0) {
    while (username.length <= 0) username = prompt('Enter your username') || ''
    document.cookie = `multiplayer-username=${username}`
  }

  return username
}

function getPlayerIndex(room: any, id: string) {
  return Object.keys(room.players).indexOf(id)
}

function getField(fieldId: string) {
  return document.querySelector(`*[data-answer="${fieldId}"]`)
}

function getActiveFieldId() {
  return document.querySelector('.highlighted[data-answer]')?.getAttribute('data-answer') || null
}

function setupServerMsgListeners(socket: any, room: any) {
  socket.on('player-joined', (data: { id: string, username: string }) => {
    room.players[data.id] = { id: data.id, username: data.username }
  })

  socket.on('quiz-started', () => {
    room.inGame = true

    const startButton = document.querySelector('#start-button') as HTMLButtonElement
    startButton?.click()
  })

  socket.on('field-changed', (data: { id: string, fieldId: string }) => {
    room.players[data.id].currentField = data.fieldId

    const oldFieldId = room.players[data.id].currentField
    if (oldFieldId !== undefined) {
      const oldField = getField(oldFieldId)
      if (oldField !== null) {
        oldField.classList.remove('other-player-editing')

        if (!oldField.classList.contains('correct')) {
          oldField.textContent = ''
          oldField.classList?.remove(`player-${getPlayerIndex(room, data.id)}`)
        }
      }
    }

    const newField = getField(data.fieldId)
    if (newField !== null) {
      newField.classList.add(`player-${getPlayerIndex(room, data.id)}`)
      newField.classList.add('other-player-editing')
    }
  })

  socket.on('input-changed', (data: { id: string, value: string }) => {
    room.players[data.id].currentAnswer = data.value

    const field = getField(room.players[data.id].currentField)
    if (field !== null) field.textContent = data.value
  })

  socket.on('answer-submitted', (data: { id: string, fieldId: string | undefined, answer: string }) => {
    room.answers.push({ fieldId: data.fieldId, value: data.answer, playerId: data.id })

    const input = document.querySelector('#txt-answer-box') as HTMLInputElement
    if (input === null) return
    const oldValue = input.value

    if (data.fieldId !== undefined) {
      const field = getField(data.fieldId) as HTMLElement
      field?.click()
    }

    input.value = data.answer
    input.dispatchEvent(new Event('input'))

    if (data.fieldId !== undefined) {
      const oldField = getField(room.players[data.id].currentField) as HTMLElement
      oldField?.click()
    }

    input.value = oldValue
    input.dispatchEvent(new Event('input'))
  })

  socket.on('quiz-paused', () => {
    const pauseButton = document.querySelector('.pause-quiz') as HTMLButtonElement
    pauseButton?.click()
  })

  socket.on('quiz-unpaused', () => {
    const unpauseButton = document.querySelector('.unpause-quiz') as HTMLButtonElement
    unpauseButton?.click()
  })

  socket.on('on-unlimited-time-enabled', () => {
    const unlimitedTimeButton = document.querySelector('.stop-timer') as HTMLButtonElement
    unlimitedTimeButton?.click()
  })

  socket.on('quiz-ended', () => {
    room.inGame = false

    const timer = document.querySelector('.timer') as HTMLElement
    if (timer.textContent?.match(/00:0[0123]/)) return // Quiz will end by itself

    const endButton = document.querySelector('.give-up') as HTMLButtonElement
    endButton?.click()
  })

  socket.on('player-left', (data: { id: string }) => {
    room.players[data.id].connected = false
  })
}

function setupUserEventListeners(socket: any) {
  let currentField: string | null = getActiveFieldId()
  let currentAnswer: string = (document.querySelector('#txt-answer-box') as HTMLInputElement).value

  const startButton = document.querySelector('#start-button') as HTMLButtonElement
  startButton?.addEventListener('click', e => {
    if (!e.isTrusted) return // Ignore programmatic clicks

    socket.emit('start-quiz')
  })

  if (currentField) {
    const fieldElements = document.querySelectorAll('*[data-answer]')
    fieldElements.forEach(field => {
      field.addEventListener('click', e => {
        if (!e.isTrusted) return // Ignore programmatic clicks
  
        const fieldId = field.getAttribute('data-answer')
  
        currentField = fieldId
        socket.emit('change-field', { fieldId })
      })
    })
  }

  const input = document.querySelector('#txt-answer-box') as HTMLInputElement
  input.addEventListener('input', e => {
    if (!e.isTrusted) return // Ignore programmatic input

    currentAnswer = input.value
    socket.emit('change-input', { value: input.value })
  })

  const numGuessedDiv = document.querySelector('#num-guessed') as HTMLElement
  new MutationObserver(() => {
    socket.emit('submit-answer', { fieldId: currentField, answer: currentAnswer })

    // Reset current field and answer
    currentField = getActiveFieldId()
    socket.emit('change-field', { fieldId: currentField })

    currentAnswer = ''
    socket.emit('change-input', { value: currentAnswer })
  }).observe(numGuessedDiv, { childList: true })

  const pauseButton = document.querySelector('.pause-quiz') as HTMLElement
  pauseButton?.addEventListener('click', e => {
    if (!e.isTrusted) return // Ignore programmatic clicks

    socket.emit('pause-quiz')
  })

  const unpauseButton = document.querySelector('.unpause-quiz') as HTMLButtonElement
  unpauseButton?.addEventListener('click', e => {
    if (!e.isTrusted) return // Ignore programmatic clicks

    socket.emit('unpause-quiz')
  })

  const unlimitedTimeButton = document.querySelector('.stop-timer') as HTMLElement
  unlimitedTimeButton?.addEventListener('click', e => {
    if (!e.isTrusted) return // Ignore programmatic clicks

    socket.emit('unlimited-time-enabled')
  })

  const endButton = document.querySelector('.give-up') as HTMLElement
  endButton?.addEventListener('click', e => {
    if (!e.isTrusted) return // Ignore programmatic clicks

    socket.emit('end-quiz')
  })

  const timer = document.querySelector('.timer') as HTMLElement
  new MutationObserver(() => {
    if (timer.textContent === "00:00") socket.emit('end-quiz')
  }).observe(timer, { childList: true })
}

function multiplayer(onSuccess?: () => void) {
  const roomId = prompt('Enter room ID')
  if (roomId === null) return

  let room = {
    inGame: false,
    players: {} as any,
    answers: [] as any,
  } as any
  
  const socket = io("SERVER_URL", { query: { id: getId(), username: getUsername(), quizUrl: window.location.pathname, roomId } })

  // Listeners
  socket.on('connect', () => {
    socket.on('wrong-quiz-url', (data: { quizUrl: string }) => {
      window.location.pathname = data.quizUrl
    })
    
    socket.on('room-joined', (data: { room: any }) => {
      room = data.room
      console.log('Room joined', room)
      onSuccess?.()
    })

    setupServerMsgListeners(socket, room)
    setupUserEventListeners(socket)
  })
}

function injectQuizPage() {
  const startButtonContainer = document.querySelector('#start-button-holder')
  const startButton = document.querySelector('#start-button')

  const multiplayerButton = document.createElement('button')
  multiplayerButton.id = 'start-button'
  multiplayerButton.classList.add('green')
  multiplayerButton.onclick = () => multiplayer(() => {
    multiplayerButton.remove()
    startButton?.querySelector('i')?.classList?.replace('bi-play-fill', 'bi-cloud-fill')
  })

  const buttonSpan = document.createElement('span')
  buttonSpan.textContent = 'Multiplayer'
  multiplayerButton.appendChild(buttonSpan)

  const buttonIcon = document.createElement('i')
  buttonIcon.classList.add('bi', 'bi-cloud-fill')
  multiplayerButton.appendChild(buttonIcon)

  startButtonContainer?.appendChild(multiplayerButton)
}

(function() {
    'use strict'

    const css = GM_getResourceText('css')
    GM_addStyle(css)

    // Page is /quizzes/id or /user-quizzes/num/id
    if (window.location.pathname.match(/\/quizzes\/[a-z0-9-]+$/) || window.location.pathname.match(/\/user-quizzes\/\d+\/[a-z0-9-]+$/)) injectQuizPage()
})()