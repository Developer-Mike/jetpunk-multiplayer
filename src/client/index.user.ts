// ==UserScript==
// @name         Jetpunk Multiplayer
// @namespace    com.mike
// @version      1.0
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

  const shareButton = document.createElement('i')
  shareButton.id = 'share-button'
  shareButton.classList.add('bi', 'bi-share-fill')
  // copy room ID to clipboard
  shareButton.onclick = () => {
    navigator.clipboard.writeText(`SERVER_URL/join-room/${roomId}`)
    shareButton.classList.replace('bi-share-fill', 'bi-check2')
    setTimeout(() => shareButton.classList.replace('bi-check2', 'bi-share-fill'), 500)
  }
  roomDiv.appendChild(shareButton)

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
    console.log(`Field change received: ${data.fieldId}`)
    const oldFieldId = room.players[data.id].currentField
    room.players[data.id].currentField = data.fieldId

    if (oldFieldId) {
      const oldField = getField(oldFieldId)
      if (oldField) {
        oldField.classList.remove('other-player-editing')

        if (!oldField.classList.contains('correct')) {
          oldField.textContent = ''
          oldField.classList?.remove(`player-${getPlayerIndex(room, data.id)}`)
        }
      }
    }

    const newField = getField(data.fieldId)
    if (newField) {
      newField.classList.add(`player-${getPlayerIndex(room, data.id)}`)
      newField.classList.add('other-player-editing')
    }
  })

  socket.on('input-changed', (data: { id: string, value: string }) => {
    console.log(`Input change received: ${data.value}`)
    room.players[data.id].currentAnswer = data.value

    const field = getField(room.players[data.id].currentField)
    if (field !== null) field.textContent = data.value
  })

  socket.on('answer-submitted', (data: { id: string, fieldId: string | undefined, answer: string }) => {
    console.log(`Answer received: ${data.answer}`)
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

    input.dataset.isMultiplayer = 'true'
    input.value = data.answer
    input.dispatchEvent(new Event('input'))
    input.dataset.isMultiplayer = 'false'
    console.log(`Answer entered: ${data.answer}`)

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
  let lastFieldId: string | null = getActiveFieldId()
  room.players[getId()].currentField = getActiveFieldId()

  const startButton = document.querySelector('#start-button') as HTMLButtonElement
  startButton?.addEventListener('click', e => {
    if (!e.isTrusted) return // Ignore programmatic clicks

    socket.emit('start-quiz')
  })

  if (room.players[getId()].currentField) {
    const fieldElements = document.querySelectorAll('td > div[data-answer]:not(.photo)')
    fieldElements.forEach(field => {
      new MutationObserver(() => {
        if (!field.classList.contains('highlighted')) return

        const fieldId = getActiveFieldId()
        if (room.players[getId()].currentField === fieldId) return

        lastFieldId = room.players[getId()].currentField

        room.players[getId()].currentField = fieldId
        console.log(`Field changed to: ${fieldId}`)
        socket.emit('change-field', { fieldId })
      }).observe(field, { attributes: true, attributeFilter: ['class'] })
    })
  }

  const input = document.querySelector('#txt-answer-box') as HTMLInputElement
  input.addEventListener('input', e => {
    if (!e.isTrusted) return // Ignore programmatic input
  })
  const updateInput = (e: KeyboardEvent | ClipboardEvent) => {
    const futureInputValue = predictInputValue(e)
    currentAnswer = futureInputValue.length > 0 ? futureInputValue : currentAnswer

    console.log(`Input changed to: ${futureInputValue}`)
    socket.emit('change-input', { value: futureInputValue })
  }
  input.addEventListener('keydown', e => {
    if (!e.isTrusted) return // Ignore programmatic input
    updateInput(e)
  })
  input.addEventListener('paste', e => {
    if (!e.isTrusted) return // Ignore programmatic input
    updateInput(e)
  })

  const numGuessedDiv = document.querySelector('#num-guessed') as HTMLElement
  new MutationObserver(() => {
    if (input.dataset.isMultiplayer === 'true') return // Caused by programmatic input

    console.log(`Answer submitted: ${currentAnswer}`)
    socket.emit('submit-answer', { fieldId: lastFieldId, answer: currentAnswer })
    room.answers.push({ fieldId: lastFieldId, value: currentAnswer, playerId: getId() })

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

function multiplayer(onlyRedirect: boolean, onSuccess?: () => void) {
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

      // Don't allow room creation if it's not allowed
      if (!onlyRedirect) return socket.disconnect()

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
  multiplayerButton.onclick = () => multiplayer(true, () => {
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

function injectHomePage() {
  const multiplayerButton = document.createElement('button')
  multiplayerButton.classList.add('green')
  multiplayerButton.style.marginTop = '20px'
  multiplayerButton.onclick = () => multiplayer(false)

  const buttonSpan = document.createElement('span')
  buttonSpan.textContent = 'Join room'
  multiplayerButton.appendChild(buttonSpan)

  const buttonIcon = document.createElement('i')
  buttonIcon.classList.add('bi', 'bi-cloud-fill')
  multiplayerButton.appendChild(buttonIcon)

  const dailyQuizzesContainer = document.querySelector('.date') as HTMLElement
  dailyQuizzesContainer?.prepend(multiplayerButton)
}

(function() {
    'use strict'

    // If on SERVER_URL/join-room/*
    if (window.location.hostname === 'SERVER_URL'.split('//').pop()?.split(':').shift()?.split('/').pop()) {
      unsafeWindow.isExtensionInstalled = true
      return
    }

    const css = GM_getResourceText('css')
    GM_addStyle(css)

    // Page is /quizzes/id or /user-quizzes/num/id
    if (window.location.pathname.match(/\/quizzes\/[a-z0-9-]+$/) || window.location.pathname.match(/\/user-quizzes\/\d+\/[a-z0-9-]+$/)) {
      const multiplayerButton = injectQuizPage()
      if (localStorage.getItem('auto-join-room') !== null) multiplayerButton.click() // Auto-join room
    } else if (window.location.pathname.match(/\/([a-z]{2})?$/)) injectHomePage()
    else if (window.location.pathname.match(/\/join-room\/[^\/]+$/)) {
      const roomId = window.location.pathname.split('/').pop()
      if (!roomId) return

      localStorage.setItem('auto-join-room', roomId)
      multiplayer(false)
    }
})()

// Predict input value inspired by wojtekmaj/predict-input-value (MIT License, Modified)
const excludeList = ['Alt', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'Enter', 'Escape', 'Shift', 'Tab']
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