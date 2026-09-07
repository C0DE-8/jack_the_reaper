import axios from 'axios'
import { apiBaseUrl } from './baseUrl.js'

const visitorApi = axios.create({
  baseURL: apiBaseUrl,
  timeout: 15000,
})

let initialVisitRequest

// God’s Eye API routes. `apiBaseUrl` is `/api` locally and becomes
// `https://api.truxhubline.space/api` when the deployed environment provides
// the bare API origin.
export async function fetchVisitors(params = {}) {
  const { data } = await visitorApi.get('/visitors', { params })
  return data
}

export async function fetchVisitorAnalytics(params = {}) {
  const { data } = await visitorApi.get('/visitors/analytics/overview', { params })
  return data
}

export async function fetchVisitor(id) {
  const { data } = await visitorApi.get(`/visitors/${id}`)
  return data
}

export async function trackVisitor(payload) {
  const { data } = await visitorApi.post('/visitors/track', payload)
  return data
}

// React Strict Mode mounts components twice in development. Reusing this request
// keeps one page load from being counted twice while it is being tested.
export function trackVisitorOnce(payload) {
  if (!initialVisitRequest) {
    initialVisitRequest = trackVisitor(payload).catch((error) => {
      initialVisitRequest = undefined
      throw error
    })
    initialVisitRequest.then(
      () => window.setTimeout(() => { initialVisitRequest = undefined }, 500),
      () => window.setTimeout(() => { initialVisitRequest = undefined }, 500),
    )
  }
  return initialVisitRequest
}

export async function trackVisitorEvent(payload) {
  const { data } = await visitorApi.post('/visitors/events', payload)
  return data
}

export function visitorDetails() {
  const agent = navigator.userAgent || ''
  const browser = /Edg\//.test(agent)
    ? 'Edge'
    : /Chrome\//.test(agent)
      ? 'Chrome'
      : /Firefox\//.test(agent)
        ? 'Firefox'
        : /Safari\//.test(agent) && !/Chrome\//.test(agent)
          ? 'Safari'
          : 'Unknown'
  const os = /Windows/.test(agent)
    ? 'Windows'
    : /Android/.test(agent)
      ? 'Android'
      : /iPhone|iPad|iPod/.test(agent)
        ? 'iOS'
        : /Mac OS X/.test(agent)
          ? 'macOS'
          : /Linux/.test(agent)
            ? 'Linux'
            : 'Unknown'

  return {
    current_page: `${window.location.pathname}${window.location.search}`,
    referrer: document.referrer,
    browser,
    os,
    device_type: window.matchMedia('(max-width: 767px)').matches ? 'mobile' : 'desktop',
    screen_resolution: `${window.screen.width}x${window.screen.height}`,
    language: navigator.language || '',
    ...Object.fromEntries(new URLSearchParams(window.location.search).entries()),
  }
}
