export function logInfo(message: string, data?: any) {
  console.log(JSON.stringify({
    level: "INFO",
    message,
    ...data,
    timestamp: new Date().toISOString()
  }))
}

export function logError(message: string, data?: any) {
  console.error(JSON.stringify({
    level: "ERROR",
    message,
    ...data,
    timestamp: new Date().toISOString()
  }))
}

export function logWarn(message: string, data?: any) {
  console.warn(JSON.stringify({
    level: "WARN",
    message,
    ...data,
    timestamp: new Date().toISOString()
  }))
}