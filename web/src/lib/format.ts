// Fast tidssone, slik at server og nettleser viser det samme.
const timeFormat = new Intl.DateTimeFormat('en-GB', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Europe/Oslo',
})

export const formatTime = (value: Date | string) =>
  timeFormat.format(new Date(value))
