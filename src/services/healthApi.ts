export type Resource = 'consultations' | 'exams' | 'medications' | 'weights' | 'symptoms' | 'bloodPressures' | 'prescriptions'

export type ExamStatus = 'Pendente' | 'Realizado' | 'Avaliado'

export type ConsultationRecord = {
  row: number
  date: string
  time: string
  doctor: string
  specialty: string
  location: string
  notes: string
  questions: string
  relatedSymptoms: string
  relatedExams: string
  pendingItems: string
  doctorSummary: string
  diagnosis: string
  requestedExams: string
  treatmentChanges: string
  nextReturn: string
  returnTime: string
  createdAt: string
}

export type ExamRecord = {
  row: number
  date: string
  examName: string
  resultSummary: string
  status: ExamStatus
  notes: string
  createdAt: string
}

export type MedicationRecord = {
  row: number
  name: string
  dosage: string
  schedule: string
  startDate: string
  endDate: string
  notes: string
  createdAt: string
}

export type WeightRecord = {
  row: number
  date: string
  weight: string
  notes: string
  createdAt: string
}

export type SymptomRecord = {
  row: number
  date: string
  description: string
  intensity: string
  notes: string
  createdAt: string
}

export type BloodPressureRecord = {
  row: number
  date: string
  systolic: string
  diastolic: string
  pulse: string
  notes: string
  createdAt: string
}

export type PrescriptionRecord = {
  row: number
  date: string
  title: string
  notes: string
  fileName: string
  mimeType: string
  fileId: string
  createdAt: string
}

export type HealthRecords = {
  consultations: ConsultationRecord[]
  exams: ExamRecord[]
  medications: MedicationRecord[]
  weights: WeightRecord[]
  symptoms: SymptomRecord[]
  bloodPressures: BloodPressureRecord[]
  prescriptions: PrescriptionRecord[]
}

export type DashboardSummary = {
  nextConsultation: string
  upcomingConsultations: string[]
  activeMedications: number
  activeMedicationsList: string[]
  lastWeight: string
  lastBloodPressure: string
  pendingExams: number
  pendingExamsList: string[]
  records: HealthRecords
}

type ApiResponse<T> = {
  success: boolean
  message?: string
  error?: string
  data?: T
}

type RequestPayload = {
  action: 'summary' | 'ping' | 'create' | 'update' | 'delete' | 'updateExamStatus' | 'createPrescription' | 'getPrescriptionImage'
  resource?: Resource
  data?: Record<string, string>
  row?: number
  status?: ExamStatus
  file?: PrescriptionUpload
}

export type PrescriptionUpload = {
  fileName: string
  mimeType: string
  base64: string
}

export type PrescriptionImage = {
  fileName: string
  mimeType: string
  imageData: string
}

const apiUrl = import.meta.env.VITE_GOOGLE_APPS_SCRIPT_URL?.trim()
const apiToken = import.meta.env.VITE_API_TOKEN?.trim()
const spreadsheetId = import.meta.env.VITE_GOOGLE_SHEET_ID?.trim()

function getConfigurationError() {
  if (!apiUrl || !apiToken || !spreadsheetId) {
    return 'A integração ainda não foi configurada. Revise o arquivo .env.'
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

export async function savePrescription(data: Record<string, string>, file: PrescriptionUpload) {
  return request<{ sheet: string; row: number }>({
    action: 'createPrescription',
    data,
    file,
  })
}

export async function loadPrescriptionImage(row: number) {
  return request<PrescriptionImage>({ action: 'getPrescriptionImage', row })
}

export async function editHealthRecord(resource: Resource, row: number, data: Record<string, string>) {
  return request<{ sheet: string; row: number }>({
    action: 'update',
    resource,
    row,
    data,
  })
}

export async function deleteHealthRecord(resource: Resource, row: number) {
  return request<{ sheet: string; row: number }>({
    action: 'delete',
    resource,
    row,
  })
}

export async function updateExamStatus(row: number, status: ExamStatus) {
  return request<{ row: number; status: ExamStatus }>({
    action: 'updateExamStatus',
    row,
    status,
  })
}

export async function pingHealthApi() {
  return request<{ message: string; timestamp: string }>({ action: 'ping' })
}
