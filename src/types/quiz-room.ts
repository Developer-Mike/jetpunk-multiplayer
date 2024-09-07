export default interface QuizRoom {
  inGame: boolean
  players: { [id: string]: Player }
  quizUrl: string | null
  answers: Answer[]
}

export interface Player {
  connected: boolean
  username: string
  currentAnswer: string
  currentField: string | undefined
}

export interface Answer {
  fieldId: string | undefined
  value: string
  playerId: string
}