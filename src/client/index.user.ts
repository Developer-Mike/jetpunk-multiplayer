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
  let id = localStorage.getItem('multiplayer-id') ?? ''

  if (id.length <= 0) {
    id = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
    localStorage.setItem('multiplayer-id', id)
  }

  return id
}

function getUsername() {
  let username = localStorage.getItem('multiplayer-username') ?? ''

  if (username.length <= 0) {
    while (username.length <= 0) username = prompt('Enter your username') ?? ''
    localStorage.setItem('multiplayer-username', username)
  }

  return username
}

function getPlayerIndex(room: any, id: string) {
  return Object.keys(room.players).indexOf(id)
}

function getField(fieldId: string) {
  return document.querySelector(`td > div[data-answer="${fieldId}"]:not(.photo)`)
}

function getActiveFieldId() {
  return document.querySelector('.highlighted[data-answer]')?.getAttribute('data-answer') || null
}

function showActiveRoom(roomId: string, room: any) {
  const roomDivContainer = document.querySelector('.quiz-container') as HTMLElement
  if (!roomDivContainer) return

  const roomDiv = document.createElement('div')
  roomDiv.id = 'room-container'
  roomDivContainer.prepend(roomDiv)

  const roomHeader = document.createElement('h3')
  roomHeader.textContent = `Room: ${roomId}`
  roomDiv.appendChild(roomHeader)

  const roomPlayers = document.createElement('div')
  roomPlayers.id = 'room-players'
  roomDiv.appendChild(roomPlayers)

  const updatePlayers = () => {
    roomPlayers.innerHTML = ''

    for (const [id, player] of Object.entries(room.players) as [string, any][]) {
      if (!player.connected) continue

      const playerDiv = document.createElement('div')
      playerDiv.classList.add(`player-${getPlayerIndex(room, id)}`)
      playerDiv.textContent = player.username
      roomPlayers.appendChild(playerDiv)
    }
  }

  updatePlayers()
  room.players = new Proxy(room.players, {
    set: (target, prop, value) => {
      target[prop] = value
      updatePlayers()
      return true
    }
  })

  const leaveButton = document.createElement('button')
  leaveButton.classList.add('red')
  leaveButton.textContent = 'Leave room'
  leaveButton.onclick = () => {
    if (!confirm('Are you sure you want to leave the room?')) return
    window.location.reload()
  }
  roomDiv.appendChild(leaveButton)
}

function setupServerMsgListeners(socket: any, room: any) {
  socket.on('player-joined', (data: { id: string, username: string }) => {
    room.players[data.id] = {
      connected: true,
      username: data.username, 
      currentAnswer: '', 
      currentField: undefined
    }
  })

  socket.on('quiz-started', () => {
    const startButton = document.querySelector('#start-button') as HTMLButtonElement
    startButton?.click()

    room.players[getId()].currentField = getActiveFieldId()
    if (room.players[getId()].currentField) socket.emit('change-field', { fieldId: room.players[getId()].currentField })
  })

  socket.on('field-changed', (data: { id: string, fieldId: string }) => {
    const oldFieldId = room.players[data.id].currentField
    room.players[data.id].currentField = data.fieldId

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
    if (!input) return

    const oldFieldId = getActiveFieldId()
    const oldValue = input.value

    if (data.fieldId) {
      const field = getField(data.fieldId) as HTMLElement
      field?.click()

      // Add tinted background to field to indicate who answered
      field.classList.add(`player-${getPlayerIndex(room, data.id)}`)
      field.classList.add('other-player-answered')
    }

    input.value = data.answer
    input.dispatchEvent(new Event('input'))

    // Restore position
    if (data.fieldId && oldFieldId) {
      // Player was on the same field
      if (oldFieldId === data.fieldId) {
        room.players[getId()].currentField = getActiveFieldId()
        socket.emit('change-field', { fieldId: room.players[getId()].currentField })
      } else {
        const oldField = getField(oldFieldId) as HTMLElement
        oldField?.click()
      }
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
    room.players[data.id] = {
      ...room.players[data.id],
      connected: false
    }
  })
}

function setupUserEventListeners(socket: any, room: any) {
  let currentAnswer: string = (document.querySelector('#txt-answer-box') as HTMLInputElement).value
  let lastKey: string = '' // Because correct answer is submitted on keyup
  room.players[getId()].currentField = getActiveFieldId()

  const startButton = document.querySelector('#start-button') as HTMLButtonElement
  startButton?.addEventListener('click', e => {
    if (!e.isTrusted) return // Ignore programmatic clicks

    socket.emit('start-quiz')
  })

  if (room.players[getId()].currentField) {
    const fieldElements = document.querySelectorAll('td > div[data-answer]:not(.photo)')
    fieldElements.forEach(field => {
      field.addEventListener('click', e => {
        if (!e.isTrusted) return // Ignore programmatic clicks
  
        const fieldId = field.getAttribute('data-answer')
  
        room.players[getId()].currentField = fieldId
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
  input.addEventListener('keydown', e => lastKey = e.key)
  input.addEventListener('paste', e => {
    if (!e.isTrusted) return // Ignore programmatic input

    lastKey = ''
    currentAnswer = e.clipboardData?.getData('text/plain') ?? currentAnswer
    socket.emit('change-input', { value: currentAnswer })
  })

  const numGuessedDiv = document.querySelector('#num-guessed') as HTMLElement
  new MutationObserver(() => {
    if (currentAnswer === '') return // Caused by programmatic input

    socket.emit('submit-answer', { fieldId: room.players[getId()].currentField, answer: currentAnswer + lastKey })
    room.answers.push({ fieldId: room.players[getId()].currentField, value: currentAnswer + lastKey, playerId: getId() })

    // Reset current field and answer
    room.players[getId()].currentField = getActiveFieldId()
    socket.emit('change-field', { fieldId: room.players[getId()].currentField })

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
  const roomId = localStorage.getItem('auto-join-room') ?? prompt('Enter room ID')
  if (roomId === null) return

  let room = {
    players: {} as any,
    answers: [] as any,
  } as any
  
  const socket = io("SERVER_URL", { query: { id: getId(), username: getUsername(), quizUrl: window.location.pathname, roomId } })

  // Listeners
  socket.on('connect', () => {
    socket.on('wrong-quiz-url', (data: { quizUrl: string }) => {
      localStorage.setItem('auto-join-room', roomId)
      window.location.pathname = data.quizUrl
    })
    
    socket.on('room-joined', (data: { room: any }) => {
      // Remove auto-join room
      localStorage.removeItem('auto-join-room')

      // Update room without loosing proxy
      for (const [id, player] of Object.entries(data.room.players) as [string, any][]) {
        room.players[id] = player
      }

      showActiveRoom(roomId, room)
      setupServerMsgListeners(socket, room)
      setupUserEventListeners(socket, room)
      
      onSuccess?.()
    })
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

  return multiplayerButton
}

(function() {
    'use strict'

    const css = GM_getResourceText('css')
    GM_addStyle(css)

    // Page is /quizzes/id or /user-quizzes/num/id
    if (window.location.pathname.match(/\/quizzes\/[a-z0-9-]+$/) || window.location.pathname.match(/\/user-quizzes\/\d+\/[a-z0-9-]+$/)) {
      const multiplayerButton = injectQuizPage()
      if (localStorage.getItem('auto-join-room') !== null) multiplayerButton.click() // Auto-join room
    }
})()