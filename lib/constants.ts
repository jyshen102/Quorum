export const TIME_SLOTS_BY_TYPE = {
  meal: [
    'Breakfast (8–11am)',
    'Brunch (10am–1pm)',
    'Lunch (11am–3pm)',
    'Dinner (5–9pm)',
    'Late Night (9pm+)',
  ],
  hangout: [
    'Morning (9am–12pm)',
    'Afternoon (12–5pm)',
    'Evening (5–9pm)',
    'Night (9pm+)',
    'Any time works',
  ],
  trip: [
    'Full weekend (Fri–Sun)',
    'Sat & Sun only',
    'Full week',
    'Flexible / any days',
  ],
} as const

export const SUBTYPES_BY_TYPE = {
  meal: ['Brunch', 'Lunch', 'Dinner', 'Coffee', 'Birthday dinner', 'Team lunch', 'Other'],
  hangout: ['Game night', 'Movie night', 'Outdoor activity', 'Sports', 'Party', 'Other'],
  trip: ['Weekend getaway', 'Road trip', 'Beach trip', 'Camping', 'International travel', 'Other'],
} as const

export const TYPE_LABELS = {
  meal: 'Meal',
  hangout: 'Hangout',
  trip: 'Trip',
} as const

export const TYPE_COLORS = {
  meal: {
    badge: 'bg-amber-100 text-amber-800',
    dot: 'bg-amber-500',
  },
  hangout: {
    badge: 'bg-green-100 text-green-800',
    dot: 'bg-green-500',
  },
  trip: {
    badge: 'bg-blue-100 text-blue-800',
    dot: 'bg-blue-500',
  },
} as const
