export type Resource = 'consultations' | 'exams' | 'medications' | 'weights' | 'symptoms'

export type DashboardSummary = {
  nextConsultation: string
  upcomingConsultations: string[]
  activeMedications: number
  activeMedicationsList: string[]
  lastWeight: string
  pendingExams: number
  pendingExamsList: string[]
}

type ApiResponse<T> = {
  success: boolean
  message?: string
  error?: string
  data?: T
}

type RequestPayload = {
  action: 'summary' | 'ping' | 'create'
  resource?: Resource
  data?: Record<string, string>
}

const apiUrl = import.meta.env.VITE_GOOGLE_APPS_SCRIPT_URL?.trim()
const apiToken = import.meta.env.VITE_API_TOKEN?.trim()
const spreadsheetId = import.meta.env.VITE_GOOGLE_SHEET_ID?.trim()

function getConfigurationError() {
  if (!apiUrl || !apiToken || !spreadsheetId) {
    return 'A integração ainda não foi configurada. Revise o arquivo .env.local.'
  }

  return null
}

async function request<T>(payload: RequestPayload): Promise<T> {
  const configurationError = getConfigurationError()

  if (configurationError) {
    throw new Error(configurationError)
  }

  let response: Response

  try {
    response = await fetch(apiUrl!, {
      method: 'POST',
      headers: {
        // text/plain keeps this request simple and avoids an OPTIONS preflight.
        'Content-Type': 'text/plain;charset=utf-8',
      },
      body: JSON.stringify({
        token: apiToken,
        spreadsheetId,
        ...payload,
      }),
    })
  } catch {
    throw new Error(
      'Não foi possível acessar a API. Confira a URL /exec, a publicação do Apps Script e a conexão com a internet.',
    )
  }

  let responseBody: ApiResponse<T>

  try {
    const text = await response.text()
    responseBody = JSON.parse(text) as ApiResponse<T>
  } catch {
    throw new Error('A API retornou uma resposta inválida. Confirme a implantação do Apps Script.')
  }

  if (!response.ok || !responseBody.success) {
    throw new Error(responseBody.error || responseBody.message || 'Não foi possível concluir a operação.')
  }

  if (responseBody.data === undefined) {
    throw new Error('A API não retornou os dados esperados.')
  }

  return responseBody.data
}

export async function loadDashboardSummary() {
  return request<DashboardSummary>({ action: 'summary' })
}

export async function saveHealthRecord(resource: Resource, data: Record<string, string>) {
  return request<{ sheet: string; row: number }>({
    action: 'create',
    resource,
    data,
  })
}

export async function pingHealthApi() {
  return request<{ message: string; timestamp: string }>({ action: 'ping' })
}
