export type EventType = 'meal' | 'hangout' | 'trip'
export type EventStatus = 'open' | 'closed'

export interface Event {
  id: string
  title: string
  type: EventType
  subtype: string | null // primary subtype (first of `subtypes`); kept for back-compat
  subtypes: string[]
  location: string | null
  description: string | null
  date_range_start: string
  date_range_end: string
  time_slots: string[]
  status: EventStatus
  final_date: string | null
  slug: string
  created_at: string
}

export interface CustomQuestion {
  id: string
  event_id: string
  question_text: string
  display_order: number
}

export interface Respondent {
  id: string
  event_id: string
  name: string
  submitted_at: string
}

export interface Response {
  id: string
  respondent_id: string
  date_key: string
  time_slots: string[]
}

export interface CustomAnswer {
  id: string
  respondent_id: string
  question_id: string
  answer_text: string
}

export interface Database {
  public: {
    Tables: {
      events: {
        Row: Event
        Insert: Omit<Event, 'id' | 'created_at'>
        Update: Partial<Omit<Event, 'id' | 'created_at'>>
      }
      custom_questions: {
        Row: CustomQuestion
        Insert: Omit<CustomQuestion, 'id'>
        Update: Partial<Omit<CustomQuestion, 'id'>>
      }
      respondents: {
        Row: Respondent
        Insert: Omit<Respondent, 'id' | 'submitted_at'>
        Update: Partial<Omit<Respondent, 'id' | 'submitted_at'>>
      }
      responses: {
        Row: Response
        Insert: Omit<Response, 'id'>
        Update: Partial<Omit<Response, 'id'>>
      }
      custom_answers: {
        Row: CustomAnswer
        Insert: Omit<CustomAnswer, 'id'>
        Update: Partial<Omit<CustomAnswer, 'id'>>
      }
    }
  }
}
