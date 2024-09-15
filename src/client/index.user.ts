// ==UserScript==
// @name         Jetpunk Multiplayer
// @namespace    com.mike
// @version      VERSION_NUMBER
// @description  Play Jetpunk quizzes together with your friends
// @author       Developer-Mike
// @icon         https://www.jetpunk.com/apple-touch-icon-152x152.png
// @match        https://www.jetpunk.com/*
// @match        SERVER_URL/join-room/*
// @updateURL    SERVER_URL/client/index.user.js
// @downloadURL  SERVER_URL/client/index.user.js
// @require      SERVER_URL/socket.io/socket.io.js
// @resource css SERVER_URL/client/styles.css
// @grant        unsafeWindow
// @grant        GM_getResourceText
// @grant        GM_addStyle
// @run-at       document-end
// ==/UserScript==

declare var io: (...params: any) => any
declare var unsafeWindow: any
declare var GM_getResourceText: (id: string) => string
declare var GM_addStyle: (css: string) => void

//#region Types
interface ClientPlayer {
  connected: boolean
  username: string
  currentAnswer: string
  currentField: string | null
}

interface ClientAnswer {
  fieldId: string | null
  value: string
  playerId: string
}

class ClientQuizRoom {
  constructor(
    public id: string,
    public players: { [id: string]: ClientPlayer },
    public answers: ClientAnswer[]
  ) {}
  
  getPlayerStyleClass(id: string) {
    return `player-${Object.keys(this.players).indexOf(id)}`
  }
}
//#endregion

//#region Generators
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
//#endregion

//#region Constants
const ROOM_ID_KEY = 'room-id'
const IS_NO_DELIBERATE_REDIRECT = 'no-deliberate-redirect'
const MULTIPLAYER_BUTTON_CLASS = 'multiplayer-button'
const OTHER_PLAYER_INPUT_CLASS = 'other-player-input'

//#region Helper Functions
function getAllFields() { return document.querySelectorAll('tr [data-answer]:not(img):not(.photo):not(.photo-img)') }
function getFieldById(fieldId?: string | null): HTMLElement | null { return fieldId ? document.querySelector(`tr [data-answer="${fieldId}"]:not(img):not(.photo):not(.photo-img)`) : null }

function getSelectedFieldId() {
  return document.querySelector('.highlighted[data-answer]')?.getAttribute('data-answer') || null
}

function updatePlayerInput(room: ClientQuizRoom, playerId: string) {
  let playerInput = document.querySelector(`.${OTHER_PLAYER_INPUT_CLASS}.${room.getPlayerStyleClass(playerId)}`) as HTMLInputElement | null
  if (room.players[playerId].connected === false) return playerInput?.remove()

  if (!playerInput) {
    playerInput = document.createElement('input')
    playerInput.type = 'text'
    playerInput.classList.add(OTHER_PLAYER_INPUT_CLASS, room.getPlayerStyleClass(playerId))
    playerInput.readOnly = true

    const container = document.querySelector('#answer-box-holder') as HTMLElement | null
    container?.appendChild(playerInput)
  }

  playerInput.value = room.players[playerId].currentAnswer
}
//#endregion

function createRoomDiv(room: ClientQuizRoom) {
  const roomDivContainer = document.querySelector('.quiz-container') as HTMLElement
  if (!roomDivContainer) return

  const roomDiv = document.createElement('div')
  roomDiv.id = 'room-container'
  roomDivContainer.prepend(roomDiv)

  const shareButton = document.createElement('i')
  shareButton.id = 'share-button'
  shareButton.classList.add('bi', 'bi-share-fill')
  // copy room ID to clipboard
  shareButton.onclick = () => {
    navigator.clipboard.writeText(`SERVER_URL/join-room/${room.id}`)
    shareButton.classList.replace('bi-share-fill', 'bi-check2')
    setTimeout(() => shareButton.classList.replace('bi-check2', 'bi-share-fill'), 500)
  }
  roomDiv.appendChild(shareButton)

  const roomHeader = document.createElement('h3')
  roomHeader.textContent = `Room: ${room.id}`
  roomDiv.appendChild(roomHeader)

  const roomPlayers = document.createElement('div')
  roomPlayers.id = 'room-players'
  roomDiv.appendChild(roomPlayers)

  const updatePlayers = () => {
    roomPlayers.innerHTML = ''

    for (const [id, player] of Object.entries(room.players) as [string, any][]) {
      if (!player.connected) continue

      const playerDiv = document.createElement('div')
      playerDiv.classList.add(room.getPlayerStyleClass(id))
      playerDiv.textContent = player.username
      roomPlayers.appendChild(playerDiv)
    }
  }

  updatePlayers()
  room.players = new Proxy(room.players, {
    set: (target, prop, value) => {
      target[prop as string] = value
      updatePlayers()
      return true
    }
  })

  const leaveButton = document.createElement('button')
  leaveButton.classList.add('red')
  leaveButton.textContent = 'Leave room'
  leaveButton.onclick = () => {
    if (!confirm('Are you sure you want to leave the room?')) return

    localStorage.removeItem(ROOM_ID_KEY)
    window.location.reload()
  }
  roomDiv.appendChild(leaveButton)
}

function setupCommunicationListeners(socket: any, room: ClientQuizRoom) {
  const input = document.querySelector('#txt-answer-box') as HTMLInputElement
  let inputCausedProgrammatically = false

  const quizHasFields = getSelectedFieldId() !== null
  let lastFieldId: string | null = null

  socket.on('player-joined', (data: { id: string, username: string }) => {
    room.players[data.id] = {
      connected: true,
      username: data.username, 
      currentAnswer: '', 
      currentField: null
    }
  })

  //#region Quiz Change
  const retakeQuizButton = document.querySelector('#retake-quiz') as HTMLElement
  retakeQuizButton?.addEventListener('click', _e => window.location.reload())
  socket.on('quiz-changed', (data: { quizUrl: string }) => {
    console.log(`Quiz change received: ${data.quizUrl}`)

    localStorage.setItem(IS_NO_DELIBERATE_REDIRECT, true.toString())
    window.location.pathname = data.quizUrl // Redirect to new quiz
  })
  //#endregion

  //#region Quiz Start
  const startButton = document.querySelector('#start-button') as HTMLButtonElement
  startButton?.addEventListener('click', e => {
    if (!e.isTrusted) return // Ignore programmatic clicks
    socket.emit('start-quiz')
  })
  socket.on('quiz-started', () => {
    startButton?.click()

    // Update current local state and share with other players
    if (quizHasFields) {
      lastFieldId = getSelectedFieldId()
      room.players[getId()].currentField = getSelectedFieldId()
      socket.emit('change-field', { fieldId: room.players[getId()].currentField })
    }

    room.players[getId()].currentAnswer = input.value
    socket.emit('change-input', { value: room.players[getId()].currentAnswer })
  })
  //#endregion

  //#region Field Change
  if (quizHasFields) {
    // Add an event listener to all fields when they are highlighted
    getAllFields().forEach(field => {
      new MutationObserver(() => {
        if (!field.classList.contains('highlighted')) return

        const fieldId = getSelectedFieldId()
        if (room.players[getId()].currentField === fieldId) return // Field already selected (Shouldn't happen but just in case)

        // Log field change
        console.log(`Field changed to: ${fieldId}`)

        // Keep track of the last field
        lastFieldId = room.players[getId()].currentField

        // Update current field
        room.players[getId()].currentField = fieldId
        socket.emit('change-field', { fieldId })
      }).observe(field, { attributes: true, attributeFilter: ['class'] })
    })

    socket.on('field-changed', (data: { id: string, fieldId: string }) => {
      console.log(`Field change received: ${data.fieldId}`)

      // Remove other-player-editing indicator from old field
      const oldField = getFieldById(room.players[data.id].currentField)
      if (!oldField?.classList?.contains('correct')) oldField?.classList?.remove(room.getPlayerStyleClass(data.id)) // Only remove if not answered (Bc could interfere with other-player-answered order)
      oldField?.classList?.remove('other-player-editing')

      room.players[data.id].currentField = data.fieldId
      
      const newField = getFieldById(data.fieldId)
      newField?.classList.add(room.getPlayerStyleClass(data.id))
      newField?.classList.add('other-player-editing')
    })
  }
  //#endregion

  //#region Input Change
  const updateInput = (e: KeyboardEvent | ClipboardEvent) => {
    const futureInputValue = predictInputValue(e)
    room.players[getId()].currentAnswer = futureInputValue.length > 0 ? futureInputValue : room.players[getId()].currentAnswer

    console.log(`Input changed to: ${futureInputValue}`)
    socket.emit('change-input', { value: futureInputValue })
  }
  input.addEventListener('keydown', updateInput)
  input.addEventListener('paste', updateInput)

  socket.on('input-changed', (data: { id: string, value: string }) => {
    console.log(`Input change received: ${data.value}`)

    room.players[data.id].currentAnswer = data.value
    updatePlayerInput(room, data.id)
  })
  //#endregion

  //#region Answer Submission
  const numGuessedDiv = document.querySelector('#num-guessed') as HTMLElement
  new MutationObserver(() => {
    if (inputCausedProgrammatically) {
      inputCausedProgrammatically = false
      return // Caused by programmatic input
    }

    const newAnswer = { fieldId: lastFieldId, value: room.players[getId()].currentAnswer, playerId: getId() }
    console.log(`Answer submitted: ${newAnswer.value}`)

    // Update local state
    room.players[getId()].currentAnswer = ''
    room.answers.push(newAnswer)

    // Share answer and input change with other players
    socket.emit('submit-answer', { fieldId: newAnswer.fieldId, answer: newAnswer.value })
    socket.emit('change-input', { value: room.players[getId()].currentAnswer })
  }).observe(numGuessedDiv, { childList: true })

  socket.on('answer-submitted', (data: { id: string, fieldId: string | undefined, answer: string }) => {
    console.log(`Answer received: ${data.answer}`)

    // Update local state
    room.answers.push({ fieldId: data.fieldId ?? null, value: data.answer, playerId: data.id })

    // Save current input state
    const ownFieldId = getSelectedFieldId()
    const ownInputValue = input.value

    // Disable local listeners
    inputCausedProgrammatically = true

    if (data.fieldId) {
      const field = getFieldById(data.fieldId) as HTMLElement
      field?.click()

      // Add tinted background to field to indicate who answered
      field.classList.add(room.getPlayerStyleClass(data.id))
      field.classList.add('other-player-answered')
    }

    input.value = data.answer
    input.dispatchEvent(new Event('input'))

    // Restore old field and input value
    if (ownFieldId && ownFieldId !== data.fieldId) getFieldById(ownFieldId)?.click()
    input.value = ownInputValue
    input.dispatchEvent(new Event('input'))
  })
  //#endregion

  //#region Quiz Pause
  const pauseButton = document.querySelector('.pause-quiz') as HTMLElement
  pauseButton?.addEventListener('click', e => { if (e.isTrusted) socket.emit('pause-quiz') })
  socket.on('quiz-paused', () => pauseButton?.click())
  //#endregion

  //#region Quiz Unpause
  const unpauseButton = document.querySelector('.unpause-quiz') as HTMLButtonElement
  unpauseButton?.addEventListener('click', e => { if (e.isTrusted) socket.emit('unpause-quiz') })
  socket.on('quiz-unpaused', () => unpauseButton?.click())
  //#endregion

  //#region Unlimited Time
  const unlimitedTimeButton = document.querySelector('.stop-timer') as HTMLElement
  unlimitedTimeButton?.addEventListener('click', e => { if (e.isTrusted) socket.emit('unlimited-time-enabled') })
  socket.on('on-unlimited-time-enabled', () => unlimitedTimeButton?.click())
  //#endregion

  //#region Quiz End
  const endButton = document.querySelector('.give-up') as HTMLButtonElement
  endButton?.addEventListener('click', e => { if (e.isTrusted) socket.emit('end-quiz') })

  const timer = document.querySelector('.timer') as HTMLElement
  new MutationObserver(() => {
    if (timer.textContent === "00:00") socket.emit('end-quiz')
  }).observe(timer, { childList: true })

  socket.on('quiz-ended', () => {
    if (timer.textContent?.match(/00:0[0123]/)) return // Quiz will end by itself
    endButton?.click()
  })
  //#endregion

  socket.on('player-left', (data: { id: string }) => {
    room.players[data.id] = {
      ...room.players[data.id],
      connected: false
    }

    // Remove corresponding player input
    updatePlayerInput(room, data.id)
  })
}


function joinRoom(roomId: string | null, onlyJoin = false) {
  if (!roomId) return

  const changeQuizUrl = localStorage.getItem(IS_NO_DELIBERATE_REDIRECT) !== true.toString()
  // Set all redirects to deliberate
  localStorage.setItem(IS_NO_DELIBERATE_REDIRECT, false.toString())

  const socket = io("SERVER_URL", { query: { 
    id: getId(), 
    username: getUsername(), 
    quizUrl: window.location.pathname,
    changeQuizUrl: changeQuizUrl,
    roomId: roomId
  } })

  // Listeners
  socket.on('connect', () => {
    console.log('Connected to server')

    const room = new ClientQuizRoom(roomId, {}, [])
    localStorage.setItem(ROOM_ID_KEY, roomId)

    socket.on('wrong-quiz-url', (data: { quizUrl: string }) => {
      localStorage.setItem(IS_NO_DELIBERATE_REDIRECT, true.toString())
      window.location.pathname = data.quizUrl
    })
    
    socket.on('room-joined', (data: { newRoom: boolean, room: any }) => {
      // Don't allow room creation if it's not allowed
      if (onlyJoin && data.newRoom) return socket.disconnect()

      // Update room without loosing proxy
      for (const [id, player] of Object.entries(data.room.players) as [string, any][]) {
        room.players[id] = player
      }

      createRoomDiv(room)
      setupCommunicationListeners(socket, room)
      
      // Update UI
      document.querySelector(`.${MULTIPLAYER_BUTTON_CLASS}`)?.remove()
      document.querySelector('#start-button')?.querySelector('i')?.classList?.replace('bi-play-fill', 'bi-cloud-fill')
    })
  })
}

function injectQuizPage() {
  const startButtonContainer = document.querySelector('#start-button-holder')

  const multiplayerButton = document.createElement('button')
  multiplayerButton.id = 'start-button'
  multiplayerButton.classList.add(MULTIPLAYER_BUTTON_CLASS)
  multiplayerButton.classList.add('green')
  multiplayerButton.onclick = () => {
    localStorage.setItem(IS_NO_DELIBERATE_REDIRECT, true.toString())
    joinRoom(prompt('Enter room ID'))
  }

  const buttonSpan = document.createElement('span')
  buttonSpan.textContent = 'Multiplayer'
  multiplayerButton.appendChild(buttonSpan)

  const buttonIcon = document.createElement('i')
  buttonIcon.classList.add('bi', 'bi-cloud-fill')
  multiplayerButton.appendChild(buttonIcon)

  startButtonContainer?.appendChild(multiplayerButton)
}

function injectHomePage() {
  const dailyQuizzesContainer = document.querySelector('.date') as HTMLElement

  if (localStorage.getItem(ROOM_ID_KEY)) {
    const leaveButton = document.createElement('button')
    leaveButton.id = 'leave-room-button'
    leaveButton.classList.add('red')
    leaveButton.textContent = 'Leave room'
    leaveButton.onclick = () => {
      localStorage.removeItem(ROOM_ID_KEY)
      window.location.reload()
    }
    dailyQuizzesContainer?.prepend(leaveButton)
  } else {
    const multiplayerButton = document.createElement('button')
    multiplayerButton.id = 'join-room-button'
    multiplayerButton.classList.add('green')
    multiplayerButton.onclick = () => {
      const roomId = prompt('Enter room ID')
      if (!roomId) return

      localStorage.setItem(ROOM_ID_KEY, roomId)
      localStorage.setItem(IS_NO_DELIBERATE_REDIRECT, true.toString())
      joinRoom(roomId, true)
    }

    const buttonSpan = document.createElement('span')
    buttonSpan.textContent = 'Join room'
    multiplayerButton.appendChild(buttonSpan)

    const buttonIcon = document.createElement('i')
    buttonIcon.classList.add('bi', 'bi-cloud-fill')
    multiplayerButton.appendChild(buttonIcon)

    dailyQuizzesContainer?.prepend(multiplayerButton)
  }
}

(function() {
    'use strict'

    // If on SERVER_URL/join-room/*
    if (window.location.hostname === 'SERVER_URL'.split('//').pop()?.split(':').shift()?.split('/').pop()) {
      unsafeWindow.jetpunkMultiplayerVersion = 'VERSION_NUMBER'
      return
    }

    const css = GM_getResourceText('css')
    GM_addStyle(css)

    // Page is /quizzes/id or /user-quizzes/num/id
    if (window.location.pathname.match(/\/quizzes\/[a-z0-9-\/]+$/) || window.location.pathname.match(/\/user-quizzes\/\d+\/[a-z0-9-\/]+$/)) {
      injectQuizPage()

      const roomId = localStorage.getItem(ROOM_ID_KEY)
      if (roomId) joinRoom(roomId)
    } else if (window.location.pathname.match(/\/([a-z]{2})?$/)) {
      injectHomePage()
    } else if (window.location.pathname.match(/\/join-room\/[^\/]+$/)) {
      const roomId = window.location.pathname.split('/').pop()
      if (!roomId) return

      localStorage.setItem(ROOM_ID_KEY, roomId)
      localStorage.setItem(IS_NO_DELIBERATE_REDIRECT, true.toString())
      joinRoom(roomId, true)
    }
})()

// Predict input value inspired by wojtekmaj/predict-input-value (MIT License, Modified)
const excludeList = ['Alt', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'Enter', 'Escape', 'Shift', 'Tab', 'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12']
function predictInputValue(event: KeyboardEvent | ClipboardEvent) {
  const target = event.target as HTMLElement

  // Only support input and textarea elements
  if (!(target instanceof HTMLInputElement) && !(target instanceof HTMLTextAreaElement))
    return ''

  const currentValue = target.value
  if (target.selectionStart === null || target.selectionEnd === null) return currentValue

  if (event instanceof ClipboardEvent) {
    if (event.type !== 'paste') return currentValue

    let nextValue = currentValue.split('')
    const clipboardData = event.clipboardData
    return nextValue.slice(0, target.selectionStart).concat(clipboardData?.getData('text/plain')?.split('') || [], nextValue.slice(target.selectionEnd)).join('')
  }

  if (excludeList.includes(event.key)) return currentValue
  if (event.type !== 'keydown' && event.type !== 'keypress') return currentValue

  const nextValueArr = currentValue.split('')

  if (event.key === 'Backspace') {
    if (target.selectionStart === target.selectionEnd) nextValueArr.splice(target.selectionStart - 1, 1)
    else nextValueArr.splice(target.selectionStart, target.selectionEnd - target.selectionStart)
  } else if (event.key === 'Delete') {
    if (target.selectionStart === target.selectionEnd) nextValueArr.splice(target.selectionStart, 1)
    else nextValueArr.splice(target.selectionStart, target.selectionEnd - target.selectionStart)
  } else if ((event.ctrlKey || event.metaKey) && event.key === 'c') 
    return currentValue
  else if ((event.ctrlKey || event.metaKey) && event.key === 'x') 
    nextValueArr.splice(target.selectionStart, target.selectionEnd - target.selectionStart)
  else if (!event.ctrlKey && !event.metaKey && target.maxLength < 0 || nextValueArr.length < target.maxLength)
    nextValueArr.splice(target.selectionStart, target.selectionEnd - target.selectionStart, event.key)

  return nextValueArr.join('')
}