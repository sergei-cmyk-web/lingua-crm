import axios from 'axios'
import crypto from 'crypto'

const BASE_URL = 'https://dataapi.uiscom.ru/v2.0'

class UisClient {
  private getAuthToken() {
    const key = process.env.UIS_API_KEY
    const secret = process.env.UIS_API_SECRET
    if (!key || !secret) return null

    const timestamp = Math.floor(Date.now() / 1000)
    const signature = crypto.createHmac('sha256', secret).update(`${key}${timestamp}`).digest('hex')
    return `${key}:${timestamp}:${signature}`
  }

  async initiateCall(phone: string) {
    const token = this.getAuthToken()
    if (!token) {
      console.warn('UIS credentials not configured, skipping call initiation')
      return null
    }

    const response = await axios.post(
      `${BASE_URL}/make-call`,
      {
        virtual_phone_number: process.env.UIS_VIRTUAL_NUMBER,
        phone_number: phone,
      },
      { headers: { Authorization: `Bearer ${token}` } }
    )
    return response.data
  }

  async getCallRecord(callId: string) {
    const token = this.getAuthToken()
    if (!token) return null

    const response = await axios.get(`${BASE_URL}/call/${callId}/record`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    return response.data
  }
}

export const uisClient = new UisClient()
