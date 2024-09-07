import QuizRoom from "./quiz-room"

export const SocketEvents = {
  C2S: {
    START_QUIZ: 'start-quiz',
    CHANGE_FIELD: 'change-field',
    CHANGE_INPUT: 'change-input',
    SUBMIT_ANSWER: 'submit-answer',
    PAUSE_QUIZ: 'pause-quiz',
    UNPAUSE_QUIZ: 'unpause-quiz',
    UNLIMITED_TIME_ENABLED: 'unlimited-time-enabled',
    END_QUIZ: 'end-quiz',
  },
  S2C: {
    WRONG_QUIZ_URL: 'wrong-quiz-url',
    ROOM_JOINED: 'room-joined',
    PLAYER_JOINED: 'player-joined',
    QUIZ_STARTED: 'quiz-started',
    FIELD_CHANGED: 'field-changed',
    INPUT_CHANGED: 'input-changed',
    ANSWER_SUBMITTED: 'answer-submitted',
    QUIZ_PAUSED: 'quiz-paused',
    QUIZ_UNPAUSED: 'quiz-unpaused',
    ON_UNLIMITED_TIME_ENABLED: 'on-unlimited-time-enabled',
    QUIZ_ENDED: 'quiz-ended',
    PLAYER_LEFT: 'player-left',
  }
}

export interface WrongQuizUrlS2C {
  quizUrl: string
}

export interface JoinRoomC2S {
  roomId: string
  quizUrl: string
}

export interface RoomJoinedS2C {
  room: QuizRoom
}

export interface PlayerJoinedS2C {
  id: string
  username: string
}

export interface ChangeFieldC2S {
  fieldId: string
}

export interface FieldChangedS2C {
  id: string
  fieldId: string
}

export interface ChangeInputC2S {
  value: string
}

export interface InputChangedS2C {
  id: string
  value: string
}

export interface SubmitAnswerC2S {
  fieldId: string | undefined
  answer: string
}

export interface AnswerSubmittedS2C {
  id: string
  fieldId: string | undefined
  answer: string
}

export interface PlayerLeftS2C {
  id: string
}