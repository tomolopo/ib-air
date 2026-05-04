export function generateRequestId() {
  return `req_${Math.random().toString(36).substring(2, 10)}`
}