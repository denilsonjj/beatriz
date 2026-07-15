import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from 'react'
import {
  DashboardSummary,
  ExamStatus,
  Resource,
  deleteHealthRecord,
  editHealthRecord,
  loadPrescriptionImage,
  loadDashboardSummary,
  PrescriptionImage,
  PrescriptionUpload,
  saveHealthRecord,
  savePrescription,
  updateExamStatus,
} from './services/healthApi'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

type FormKey = 'consultation' | 'exam' | 'medication' | 'weight' | 'symptom' | 'bloodPressure' | 'prescription'

type FormConfig = {
  key: FormKey
  title: string
  resource: Resource
  description: string
}

type Notice = {
  type: 'success' | 'error'
  text: string
} | null

type EditTarget = { resource: Resource; row: number } | null
type DeleteTarget = { resource: Resource; row: number; label: string } | null

type TimelineItem = {
  id: string
  date: string
  title: string
  detail: string
  icon: string
  tone: string
}

const emptySummary: DashboardSummary = {
  nextConsultation: 'Nenhuma agendada',
  upcomingConsultations: [],
  activeMedications: 0,
  activeMedicationsList: [],
  lastWeight: 'Sem registro',
  lastBloodPressure: 'Sem registro',
  pendingExams: 0,
  pendingExamsList: [],
  records: {
    consultations: [],
    exams: [],
    medications: [],
    weights: [],
    symptoms: [],
    bloodPressures: [],
    prescriptions: [],
  },
}

const formConfigs: FormConfig[] = [
  {
    key: 'consultation',
    title: '🩺 Registrar consulta',
    resource: 'consultations',
    description: 'Guarde o que preparar antes e o que aconteceu depois da consulta.',
  },
  {
    key: 'exam',
    title: '🔬 Registrar exame',
    resource: 'exams',
    description: 'Organize os exames e acompanhe o status de cada um.',
  },
  {
    key: 'medication',
    title: '💊 Registrar medicamento',
    resource: 'medications',
    description: 'Mantenha os medicamentos e horários sempre atualizados.',
  },
  {
    key: 'weight',
    title: '⚖️ Registrar peso',
    resource: 'weights',
    description: 'Acompanhe o peso ao longo do tempo.',
  },
  {
    key: 'symptom',
    title: '🤒 Registrar sintoma',
    resource: 'symptoms',
    description: 'Anote sintomas importantes para conversar com o médico.',
  },
  {
    key: 'bloodPressure',
    title: '❤️ Registrar pressão arterial',
    resource: 'bloodPressures',
    description: 'Registre a pressão máxima, a mínima e o pulso, se desejar.',
  },
  {
    key: 'prescription',
    title: '🧾 Arquivar receita médica',
    resource: 'prescriptions',
    description: 'Tire uma foto da receita ou escolha uma imagem da galeria para guardar.',
  },
]

const prescriptionMaxFileBytes = 4 * 1024 * 1024
const acceptedPrescriptionMimeTypes = ['image/jpeg', 'image/png', 'image/webp']

function todayIso() {
  const now = new Date()
  const timezoneOffset = now.getTimezoneOffset() * 60_000
  return new Date(now.getTime() - timezoneOffset).toISOString().slice(0, 10)
}

function isoToBrazilian(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value
}

function brazilianToIso(value: string) {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim())
  if (!match) return null
  const [, day, month, year] = match
  const date = new Date(Number(year), Number(month) - 1, Number(day))
  if (date.getFullYear() !== Number(year) || date.getMonth() !== Number(month) - 1 || date.getDate() !== Number(day)) return null
  return `${year}-${month}-${day}`
}

function formatDateWhileTyping(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 8)
  if (digits.length <= 2) return digits
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`
}

function parseBrazilianDate(value: string) {
  const isoDate = brazilianToIso(value)
  if (!isoDate) return null
  const [year, month, day] = isoDate.split('-').map(Number)
  return new Date(year, month - 1, day)
}

function sortByClosestDate<T extends { date: string }>(records: T[]) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  return [...records].sort((first, second) => {
    const firstDate = parseBrazilianDate(first.date)
    const secondDate = parseBrazilianDate(second.date)
    if (!firstDate) return secondDate ? 1 : 0
    if (!secondDate) return -1

    const firstDistance = Math.abs(firstDate.getTime() - today.getTime())
    const secondDistance = Math.abs(secondDate.getTime() - today.getTime())
    if (firstDistance !== secondDistance) return firstDistance - secondDistance
    return firstDate.getTime() - secondDate.getTime()
  })
}

function sortConsultationsByDate<T extends { date: string }>(records: T[]) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  return [...records].sort((first, second) => {
    const firstDate = parseBrazilianDate(first.date)
    const secondDate = parseBrazilianDate(second.date)
    if (!firstDate) return secondDate ? 1 : 0
    if (!secondDate) return -1

    const firstIsFuture = firstDate.getTime() >= today.getTime()
    const secondIsFuture = secondDate.getTime() >= today.getTime()
    if (firstIsFuture !== secondIsFuture) return firstIsFuture ? -1 : 1
    return firstIsFuture
      ? firstDate.getTime() - secondDate.getTime()
      : secondDate.getTime() - firstDate.getTime()
  })
}

function sortMedicationsAlphabetically<T extends { name: string }>(records: T[]) {
  return [...records].sort((first, second) =>
    first.name.localeCompare(second.name, 'pt-BR', { sensitivity: 'base' }),
  )
}

function sortMedicationSummariesAlphabetically(items: string[]) {
  return [...items].sort((first, second) =>
    first.localeCompare(second, 'pt-BR', { sensitivity: 'base' }),
  )
}

function buildHealthTimeline(summary: DashboardSummary): TimelineItem[] {
  const items: TimelineItem[] = [
    ...summary.records.consultations.map((item) => ({
      id: `consultation-${item.row}`,
      date: item.date,
      title: `${item.doctor || 'Consulta'}${item.specialty ? ` · ${item.specialty}` : ''}`,
      detail: [item.time ? `Horário ${item.time}` : '', item.diagnosis || item.doctorSummary || item.notes].filter(Boolean).join(' — ') || 'Consulta registrada',
      icon: '🩺',
      tone: 'border-teal-200 bg-teal-50/70 text-teal-950',
    })),
    ...summary.records.exams.map((item) => ({
      id: `exam-${item.row}`,
      date: item.date,
      title: item.examName,
      detail: [item.status, item.resultSummary].filter(Boolean).join(' — ') || 'Exame registrado',
      icon: '🔬',
      tone: 'border-sky-200 bg-sky-50/70 text-sky-950',
    })),
    ...summary.records.medications.map((item) => ({
      id: `medication-${item.row}`,
      date: item.startDate,
      title: item.name,
      detail: [item.dosage, item.schedule].filter(Boolean).join(' · ') || 'Medicamento registrado',
      icon: '💊',
      tone: 'border-violet-200 bg-violet-50/70 text-violet-950',
    })),
    ...summary.records.weights.map((item) => ({
      id: `weight-${item.row}`,
      date: item.date,
      title: `Peso: ${item.weight}`,
      detail: item.notes || 'Registro de peso',
      icon: '⚖️',
      tone: 'border-amber-200 bg-amber-50/70 text-amber-950',
    })),
    ...summary.records.symptoms.map((item) => ({
      id: `symptom-${item.row}`,
      date: item.date,
      title: item.description,
      detail: `Sintoma ${item.intensity.toLowerCase()}${item.notes ? ` — ${item.notes}` : ''}`,
      icon: '🤒',
      tone: 'border-orange-200 bg-orange-50/70 text-orange-950',
    })),
    ...summary.records.bloodPressures.map((item) => ({
      id: `pressure-${item.row}`,
      date: item.date,
      title: `Pressão: ${item.systolic}/${item.diastolic} mmHg`,
      detail: item.pulse ? `Pulso ${item.pulse} bpm${item.notes ? ` — ${item.notes}` : ''}` : item.notes || 'Pressão arterial registrada',
      icon: '❤️',
      tone: 'border-rose-200 bg-rose-50/70 text-rose-950',
    })),
    ...summary.records.prescriptions.map((item) => ({
      id: `prescription-${item.row}`,
      date: item.date,
      title: item.title,
      detail: item.notes || 'Receita médica arquivada',
      icon: '🧾',
      tone: 'border-indigo-200 bg-indigo-50/70 text-indigo-950',
    })),
  ]

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  return items.sort((first, second) => {
    const firstDate = parseBrazilianDate(first.date)
    const secondDate = parseBrazilianDate(second.date)
    if (!firstDate) return secondDate ? 1 : 0
    if (!secondDate) return -1

    const firstIsUpcomingConsultation = first.id.startsWith('consultation-') && firstDate.getTime() >= today.getTime()
    const secondIsUpcomingConsultation = second.id.startsWith('consultation-') && secondDate.getTime() >= today.getTime()

    if (firstIsUpcomingConsultation !== secondIsUpcomingConsultation) {
      return firstIsUpcomingConsultation ? -1 : 1
    }

    if (firstIsUpcomingConsultation && secondIsUpcomingConsultation) {
      return firstDate.getTime() - secondDate.getTime()
    }

    return secondDate.getTime() - firstDate.getTime()
  })
}

function normalizeDatesForApi(data: Record<string, string>) {
  const normalized = { ...data }
  for (const field of ['date', 'startDate', 'endDate', 'nextReturn']) {
    if (normalized[field]) normalized[field] = brazilianToIso(normalized[field]) ?? normalized[field]
  }
  return normalized
}

function getCurrentTime() {
  return new Date().toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function getInitialFormData(form: FormKey): Record<string, string> {
  const today = isoToBrazilian(todayIso())

  switch (form) {
    case 'consultation':
      return {
        date: today, time: '', doctor: '', specialty: '', location: '', notes: '',
        questions: '', relatedSymptoms: '', relatedExams: '', pendingItems: '', doctorSummary: '',
        diagnosis: '', requestedExams: '', treatmentChanges: '', nextReturn: '', returnTime: '',
      }
    case 'exam':
      return { date: today, examName: '', resultSummary: '', status: 'Pendente', notes: '' }
    case 'medication':
      return { name: '', dosage: '', schedule: '', startDate: today, endDate: '', notes: '' }
    case 'weight':
      return { date: today, weight: '', notes: '' }
    case 'symptom':
      return { date: today, description: '', intensity: 'Leve', notes: '' }
    case 'bloodPressure':
      return { date: today, systolic: '', diastolic: '', pulse: '', notes: '' }
    case 'prescription':
      return { date: today, title: '', notes: '', fileName: '', mimeType: '', fileId: '' }
  }
}

function getClientValidationError(form: FormKey, data: Record<string, string>) {
  const requiredFields: Record<FormKey, Array<[string, string]>> = {
    consultation: [
      ['date', 'Informe a data da consulta.'],
      ['time', 'Informe o horário da consulta.'],
      ['doctor', 'Informe o nome do médico.'],
      ['specialty', 'Informe a especialidade.'],
    ],
    exam: [
      ['date', 'Informe a data do exame.'],
      ['examName', 'Informe o nome do exame.'],
      ['status', 'Selecione o status do exame.'],
    ],
    medication: [
      ['name', 'Informe o nome do medicamento.'],
      ['dosage', 'Informe a dosagem.'],
      ['schedule', 'Informe o horário.'],
      ['startDate', 'Informe a data de início.'],
    ],
    weight: [
      ['date', 'Informe a data do peso.'],
      ['weight', 'Informe o peso em kg.'],
    ],
    symptom: [
      ['date', 'Informe a data do sintoma.'],
      ['description', 'Descreva o sintoma.'],
      ['intensity', 'Selecione a intensidade.'],
    ],
    bloodPressure: [
      ['date', 'Informe a data da aferição.'],
      ['systolic', 'Informe a pressão máxima.'],
      ['diastolic', 'Informe a pressão mínima.'],
    ],
    prescription: [
      ['date', 'Informe a data da receita.'],
      ['title', 'Dê um nome para identificar a receita.'],
    ],
  }

  for (const [field, message] of requiredFields[form]) {
    if (!data[field]?.trim()) {
      return message
    }
  }

  if (form === 'weight') {
    const weight = Number(data.weight.replace(',', '.'))

    if (!Number.isFinite(weight) || weight <= 0) {
      return 'Informe um peso válido maior que zero.'
    }
  }

  if (form === 'bloodPressure') {
    const systolic = Number(data.systolic)
    const diastolic = Number(data.diastolic)
    const pulse = data.pulse ? Number(data.pulse) : null
    if (!Number.isFinite(systolic) || systolic < 50 || systolic > 300) return 'Informe a pressão máxima em mmHg, entre 50 e 300.'
    if (!Number.isFinite(diastolic) || diastolic < 30 || diastolic > 200) return 'Informe a pressão mínima em mmHg, entre 30 e 200.'
    if (systolic <= diastolic) return 'A pressão máxima deve ser maior que a pressão mínima.'
    if (pulse !== null && (!Number.isFinite(pulse) || pulse < 20 || pulse > 250)) return 'Informe o pulso entre 20 e 250 batimentos por minuto.'
  }

  if (form === 'medication' && data.endDate && data.endDate < data.startDate) {
    const startDate = brazilianToIso(data.startDate)
    const endDate = brazilianToIso(data.endDate)
    if (startDate && endDate && endDate < startDate) return 'A data de término não pode ser anterior à data de início.'
  }

  for (const field of ['date', 'startDate', 'endDate', 'nextReturn']) {
    if (data[field] && !brazilianToIso(data[field])) return 'Informe a data no formato DD/MM/AAAA.'
  }

  return null
}

export default function App() {
  const [summary, setSummary] = useState<DashboardSummary>(emptySummary)
  const [isDashboardLoading, setIsDashboardLoading] = useState(true)
  const [activeForm, setActiveForm] = useState<FormKey | null>(null)
  const [formData, setFormData] = useState<Record<string, string>>({})
  const [editTarget, setEditTarget] = useState<EditTarget>(null)
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [updatingExamRow, setUpdatingExamRow] = useState<number | null>(null)
  const [notice, setNotice] = useState<Notice>(null)
  const [currentTime, setCurrentTime] = useState(getCurrentTime())
  const [prescriptionFile, setPrescriptionFile] = useState<PrescriptionUpload | null>(null)
  const [prescriptionPreview, setPrescriptionPreview] = useState<string | null>(null)
  const [viewingPrescription, setViewingPrescription] = useState<{ title: string; image: PrescriptionImage } | null>(null)
  const [isPrescriptionImageLoading, setIsPrescriptionImageLoading] = useState<number | null>(null)

  // Controle de carregamento com splash sincronizado
  const [minTimeElapsed, setMinTimeElapsed] = useState(false)
  const [showSplash, setShowSplash] = useState(true)

  // Acessibilidade - Letra Grande
  const [isLargeFont, setIsLargeFont] = useState(() => {
    return localStorage.getItem('health_tracker_large_font') === 'true'
  })

  useEffect(() => {
    const clockTimer = setInterval(() => {
      setCurrentTime(getCurrentTime())
    }, 1000)

    const splashTimer = setTimeout(() => {
      setMinTimeElapsed(true)
    }, 1000) // tempo mínimo de splash: 1 segundo para evitar piscadas

    return () => {
      clearInterval(clockTimer)
      clearTimeout(splashTimer)
    }
  }, [])

  // Desliga o Splash apenas quando os dados terminarem de carregar e o tempo mínimo passar
  useEffect(() => {
    if (!isDashboardLoading && minTimeElapsed) {
      setShowSplash(false)
    }
  }, [isDashboardLoading, minTimeElapsed])

  // Persistir configuração de acessibilidade
  useEffect(() => {
    localStorage.setItem('health_tracker_large_font', String(isLargeFont))
  }, [isLargeFont])

  const activeConfig = useMemo(
    () => formConfigs.find((form) => form.key === activeForm) ?? null,
    [activeForm],
  )

  const timelineItems = useMemo(() => buildHealthTimeline(summary), [summary])

  async function refreshDashboard(showSuccess = false) {
    setIsDashboardLoading(true)

    try {
      const data = await loadDashboardSummary()
      setSummary({
        ...emptySummary,
        ...data,
        records: {
          ...emptySummary.records,
          ...(data.records ?? {}),
        },
      })

      if (showSuccess) {
        setNotice({ type: 'success', text: '✅ Painel atualizado com sucesso.' })
      }
    } catch (error) {
      setNotice({
        type: 'error',
        text: error instanceof Error ? error.message : '❌ Não foi possível atualizar o painel.',
      })
    } finally {
      setIsDashboardLoading(false)
    }
  }

  useEffect(() => {
    void refreshDashboard()
  }, [])

  function openForm(form: FormKey) {
    setNotice(null)
    setEditTarget(null)
    setPrescriptionFile(null)
    setPrescriptionPreview(null)
    setActiveForm(form)
    setFormData(getInitialFormData(form))
  }

  function openEditForm(form: FormKey, resource: Resource, row: number, data: Record<string, string>) {
    setNotice(null)
    setEditTarget({ resource, row })
    setPrescriptionFile(null)
    setPrescriptionPreview(null)
    setActiveForm(form)
    setFormData(data)
  }

  function closeForm() {
    if (!isSubmitting) {
      setActiveForm(null)
      setEditTarget(null)
      setPrescriptionFile(null)
      setPrescriptionPreview(null)
    }
  }

  function updateField(field: string, value: string) {
    setFormData((current) => ({ ...current, [field]: value }))
  }

  function handlePrescriptionFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    if (!acceptedPrescriptionMimeTypes.includes(file.type)) {
      setNotice({ type: 'error', text: '⚠️ Use uma foto em JPG, PNG ou WEBP.' })
      event.target.value = ''
      return
    }

    if (file.size > prescriptionMaxFileBytes) {
      setNotice({ type: 'error', text: '⚠️ A foto deve ter no máximo 4 MB. Tente enviar uma imagem menor.' })
      event.target.value = ''
      return
    }

    const reader = new FileReader()
    reader.onerror = () => {
      setNotice({ type: 'error', text: '❌ Não foi possível ler essa foto. Tente novamente.' })
      event.target.value = ''
    }
    reader.onload = () => {
      const imageData = String(reader.result || '')
      const base64 = imageData.split(',')[1]
      if (!base64) {
        setNotice({ type: 'error', text: '❌ Não foi possível preparar essa foto. Tente novamente.' })
        return
      }

      setPrescriptionFile({ fileName: file.name || 'receita.jpg', mimeType: file.type, base64 })
      setPrescriptionPreview(imageData)
      setNotice(null)
    }
    reader.readAsDataURL(file)
  }

  async function openPrescriptionImage(row: number, title: string) {
    setIsPrescriptionImageLoading(row)
    setNotice(null)
    try {
      const image = await loadPrescriptionImage(row)
      setViewingPrescription({ title, image })
    } catch (error) {
      setNotice({ type: 'error', text: error instanceof Error ? `❌ ${error.message}` : '❌ Não foi possível abrir a foto da receita.' })
    } finally {
      setIsPrescriptionImageLoading(null)
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!activeConfig || !activeForm) {
      return
    }

    const validationError = getClientValidationError(activeForm, formData)

    if (validationError) {
      setNotice({ type: 'error', text: `⚠️ ${validationError}` })
      return
    }

    setIsSubmitting(true)
    setNotice(null)

    try {
      const apiData = normalizeDatesForApi(formData)
      if (activeForm === 'prescription' && !editTarget) {
        if (!prescriptionFile) {
          setNotice({ type: 'error', text: '⚠️ Escolha ou tire uma foto da receita antes de salvar.' })
          return
        }
        await savePrescription(apiData, prescriptionFile)
      } else if (editTarget) {
        await editHealthRecord(editTarget.resource, editTarget.row, apiData)
      } else {
        await saveHealthRecord(activeConfig.resource, apiData)
      }
      await refreshDashboard()
      setActiveForm(null)
      setEditTarget(null)
      setPrescriptionFile(null)
      setPrescriptionPreview(null)
      setNotice({ type: 'success', text: editTarget ? '✅ Registro atualizado com sucesso!' : '🎉 Informação salva com sucesso no Google Sheets!' })
    } catch (error) {
      setNotice({
        type: 'error',
        text: error instanceof Error ? `❌ ${error.message}` : '❌ Não foi possível salvar a informação.',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setIsDeleting(true)
    setNotice(null)
    try {
      await deleteHealthRecord(deleteTarget.resource, deleteTarget.row)
      await refreshDashboard()
      setDeleteTarget(null)
      setNotice({ type: 'success', text: '✅ Registro excluído definitivamente.' })
    } catch (error) {
      setNotice({ type: 'error', text: error instanceof Error ? `❌ ${error.message}` : '❌ Não foi possível excluir o registro.' })
    } finally {
      setIsDeleting(false)
    }
  }

  async function handleExamStatusChange(row: number, status: ExamStatus) {
    setUpdatingExamRow(row)
    setNotice(null)

    try {
      await updateExamStatus(row, status)
      await refreshDashboard()
      setNotice({ type: 'success', text: `✅ Status do exame alterado para “${status}”.` })
    } catch (error) {
      setNotice({
        type: 'error',
        text: error instanceof Error ? `❌ ${error.message}` : '❌ Não foi possível alterar o status do exame.',
      })
    } finally {
      setUpdatingExamRow(null)
    }
  }

  const inputClassName =
    'mt-2 min-h-12 rounded-lg border-slate-200 bg-white px-4 py-3 text-lg text-slate-900 shadow-sm placeholder:text-slate-400 focus-visible:border-teal-600 focus-visible:ring-2 focus-visible:ring-teal-100 disabled:bg-slate-50'

  function recordActions(form: FormKey, resource: Resource, row: number, label: string, data: Record<string, string>) {
    return (
      <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-200 pt-4">
        <Button type="button" variant="outline" onClick={() => openEditForm(form, resource, row, data)} className="border-teal-200 bg-white text-teal-800 hover:bg-teal-50">
          ✏️ Editar
        </Button>
        <Button type="button" variant="outline" onClick={() => setDeleteTarget({ resource, row, label })} className="border-rose-200 bg-white text-rose-700 hover:bg-rose-50">
          🗑️ Excluir
        </Button>
      </div>
    )
  }

  function renderFormFields() {
    if (!activeForm) {
      return null
    }

    const field = (label: string, name: string, type = 'text', required = false) => {
      const isDateField = type === 'date'
      return (
        <div className="block text-base font-bold text-slate-800">
          <Label htmlFor={name} className="text-base font-bold">{label}{required ? ' *' : ''}</Label>
          <Input
            id={name}
            name={name}
            type={isDateField ? 'text' : type}
            inputMode={isDateField ? 'numeric' : undefined}
            placeholder={isDateField ? 'DD/MM/AAAA' : undefined}
            value={formData[name] ?? ''}
            onChange={(event) => updateField(name, isDateField ? formatDateWhileTyping(event.target.value) : event.target.value)}
            required={required}
            className={inputClassName}
          />
          {isDateField && (
            <div className="mt-2 flex flex-wrap gap-2">
              <Button
                type="button"
                onClick={() => updateField(name, isoToBrazilian(todayIso()))}
                variant="outline"
                size="sm"
                className="bg-teal-50 text-teal-800 hover:bg-teal-100"
              >
                📅 Usar data de Hoje
              </Button>
              <Button
                type="button"
                onClick={() => {
                  const yesterday = new Date()
                  yesterday.setDate(yesterday.getDate() - 1)
                  const timezoneOffset = yesterday.getTimezoneOffset() * 60_000
                  const yesterdayIso = new Date(yesterday.getTime() - timezoneOffset).toISOString().slice(0, 10)
                  updateField(name, isoToBrazilian(yesterdayIso))
                }}
                variant="outline"
                size="sm"
                className="bg-teal-50 text-teal-800 hover:bg-teal-100"
              >
                ⏪ Usar data de Ontem
              </Button>
            </div>
          )}
        </div>
      )
    }

    const fieldWithChips = (label: string, name: string, chips: string[], required = false) => (
      <div className="block text-base font-bold text-slate-800">
        <Label htmlFor={name} className="text-base font-bold">{label}{required ? ' *' : ''}</Label>
        <Input
          id={name}
          name={name}
          type="text"
          value={formData[name] ?? ''}
          onChange={(event) => updateField(name, event.target.value)}
          required={required}
          className={inputClassName}
        />
        <div className="mt-2 flex flex-wrap gap-2">
          {chips.map((chip) => (
            <Button
              key={chip}
              type="button"
              onClick={() => updateField(name, chip)}
              variant="secondary"
              size="sm"
              className="bg-slate-100 text-slate-700 hover:border-teal-300 hover:bg-teal-50 hover:text-teal-900"
            >
              {chip}
            </Button>
          ))}
        </div>
      </div>
    )

    const textarea = (label: string, name: string, required = false) => (
      <div className="block text-base font-bold text-slate-800">
        <Label htmlFor={name} className="text-base font-bold">{label}{required ? ' *' : ''}</Label>
        <Textarea
          id={name}
          name={name}
          value={formData[name] ?? ''}
          onChange={(event) => updateField(name, event.target.value)}
          required={required}
          rows={4}
          className={inputClassName}
        />
      </div>
    )

    const textareaWithChips = (label: string, name: string, chips: string[], required = false) => (
      <div className="block text-base font-bold text-slate-800">
        <Label htmlFor={name} className="text-base font-bold">{label}{required ? ' *' : ''}</Label>
        <Textarea
          id={name}
          name={name}
          value={formData[name] ?? ''}
          onChange={(event) => updateField(name, event.target.value)}
          required={required}
          rows={4}
          className={inputClassName}
        />
        <div className="mt-2 flex flex-wrap gap-2">
          {chips.map((chip) => (
            <Button
              key={chip}
              type="button"
              onClick={() => {
                const currentText = formData[name] ?? ''
                const newText = currentText.trim() ? `${currentText}, ${chip}` : chip
                updateField(name, newText)
              }}
              variant="secondary"
              size="sm"
              className="bg-slate-100 text-slate-700 hover:border-teal-300 hover:bg-teal-50 hover:text-teal-900"
            >
              ➕ {chip}
            </Button>
          ))}
        </div>
      </div>
    )

    const formSection = (title: string, description: string) => (
      <div className="rounded-xl border border-teal-100 bg-teal-50/70 px-4 py-3">
        <p className="text-lg font-extrabold text-teal-950">{title}</p>
        <p className="mt-1 text-sm font-semibold leading-relaxed text-teal-800">{description}</p>
      </div>
    )

    const select = (label: string, name: string, options: string[]) => (
      <div className="block text-base font-bold text-slate-800">
        <Label htmlFor={name} className="text-base font-bold">{label} *</Label>
        <Select value={formData[name] ?? ''} onValueChange={(value) => updateField(name, value)}>
          <SelectTrigger id={name} className={inputClassName}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {options.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
    )

    if (activeForm === 'consultation') {
      return (
        <>
          {formSection('1. Dados da consulta', 'Preencha estes dados para localizar a consulta depois.')}
          {field('Data', 'date', 'date', true)}
          {field('Horário', 'time', 'time', true)}
          {field('Médico', 'doctor', 'text', true)}
          {fieldWithChips('Especialidade', 'specialty', ['Clínico Geral', 'Geriatra', 'Cardiologista', 'Oftalmologista', 'Ortopedista', 'Dentista'], true)}
          {field('Local', 'location')}
          {textarea('Observações gerais', 'notes')}

          {formSection('2. Antes da consulta', 'Anote o que deseja lembrar ou conversar com o médico. Tudo é opcional.')}
          {textarea('Perguntas para a consulta', 'questions')}
          {textareaWithChips('Sintomas relacionados', 'relatedSymptoms', summary.records.symptoms.map((item) => item.description).filter(Boolean).slice(0, 6))}
          {textareaWithChips('Exames relacionados', 'relatedExams', summary.records.exams.map((item) => item.examName).filter(Boolean).slice(0, 6))}
          {textarea('Pendências para resolver', 'pendingItems')}

          {formSection('3. Depois da consulta', 'Quando voltar da consulta, edite este registro e complete somente o que fizer sentido.')}
          {textarea('O que o médico informou', 'doctorSummary')}
          {textarea('Diagnóstico ou hipótese', 'diagnosis')}
          {textarea('Exames solicitados', 'requestedExams')}
          {textarea('Medicamentos ou mudanças de tratamento', 'treatmentChanges')}
          {field('Próximo retorno', 'nextReturn', 'date')}
          {field('Horário do próximo retorno', 'returnTime', 'time')}
        </>
      )
    }

    if (activeForm === 'exam') {
      return (
        <>
          {field('Data', 'date', 'date', true)}
          {field('Nome do exame', 'examName', 'text', true)}
          {textarea('Resultado resumido', 'resultSummary')}
          {select('Status', 'status', ['Pendente', 'Realizado', 'Avaliado'])}
          {textarea('Observações', 'notes')}
        </>
      )
    }

    if (activeForm === 'medication') {
      return (
        <>
          {field('Nome do medicamento', 'name', 'text', true)}
          {field('Dosagem', 'dosage', 'text', true)}
          {fieldWithChips('Horário', 'schedule', ['De manhã', 'No almoço', 'De noite', 'Antes de dormir', 'De 8 em 8 horas'], true)}
          {field('Data de início', 'startDate', 'date', true)}
          {field('Data de término', 'endDate', 'date')}
          {textarea('Observações', 'notes')}
        </>
      )
    }

    if (activeForm === 'weight') {
      return (
        <>
          {field('Data', 'date', 'date', true)}
          <label className="block text-base font-bold text-slate-800" htmlFor="weight">
            Peso em kg *
            <Input
              id="weight"
              name="weight"
              inputMode="decimal"
              type="text"
              value={formData.weight ?? ''}
              onChange={(event) => updateField('weight', event.target.value)}
              placeholder="Ex.: 72,5"
              required
              className={inputClassName}
            />
            <div className="mt-2 flex flex-wrap gap-2">
              <Button
                type="button"
                onClick={() => {
                  if (summary.lastWeight && summary.lastWeight !== 'Sem registro') {
                    const numericPart = summary.lastWeight.split(' ')[0]
                    updateField('weight', numericPart)
                  }
                }}
                variant="secondary"
                size="sm"
                className="bg-slate-100 text-slate-700 hover:border-teal-300 hover:bg-teal-50 hover:text-teal-900"
                disabled={!summary.lastWeight || summary.lastWeight === 'Sem registro'}
              >
                ⚖️ Repetir peso anterior ({summary.lastWeight})
              </Button>
            </div>
          </label>
          {textarea('Observações', 'notes')}
        </>
      )
    }

    if (activeForm === 'symptom') return (
      <>
        {field('Data', 'date', 'date', true)}
        {textareaWithChips('Descrição do sintoma', 'description', ['Dor de cabeça', 'Tontura', 'Enjoo', 'Dor nas costas', 'Pressão alta', 'Cansaço'], true)}
        {select('Intensidade', 'intensity', ['Leve', 'Moderada', 'Forte'])}
        {textarea('Observações', 'notes')}
      </>
    )

    if (activeForm === 'prescription') return (
      <>
        {formSection('Receita médica', 'Dê um nome simples para encontrar a receita depois e guarde uma foto legível.')}
        {field('Data da receita', 'date', 'date', true)}
        {field('Identificação da receita', 'title', 'text', true)}
        {textarea('Observações', 'notes')}
        {editTarget ? (
          <Card className="border-indigo-100 bg-indigo-50/70 p-4 shadow-none">
            <p className="font-extrabold text-indigo-950">📷 Foto já arquivada</p>
            <p className="mt-1 text-sm font-semibold leading-relaxed text-indigo-900">Aqui você pode ajustar o nome, a data ou as observações. Para trocar a foto, exclua esta receita e arquive a nova imagem.</p>
          </Card>
        ) : (
          <div className="block text-base font-bold text-slate-800">
            <Label htmlFor="prescription-file" className="text-base font-bold">Foto da receita *</Label>
            <Input
              id="prescription-file"
              name="prescription-file"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              capture="environment"
              onChange={handlePrescriptionFileChange}
              required={!prescriptionFile}
              className={`${inputClassName} cursor-pointer file:mr-4 file:rounded-md file:border-0 file:bg-teal-50 file:px-3 file:py-2 file:font-bold file:text-teal-900 hover:file:bg-teal-100`}
            />
            <p className="mt-2 text-sm font-semibold leading-relaxed text-slate-500">Você pode tirar uma foto agora ou escolher uma da galeria. Use JPG, PNG ou WEBP de até 4 MB.</p>
            {prescriptionPreview && (
              <img src={prescriptionPreview} alt="Prévia da receita selecionada" className="mt-4 max-h-72 w-full rounded-lg border border-indigo-100 bg-white object-contain" />
            )}
          </div>
        )}
      </>
    )

    return (
      <>
        {field('Data da aferição', 'date', 'date', true)}
        <Card className="border-teal-100 bg-teal-50/70 p-4 shadow-none">
          <p className="font-extrabold text-teal-950">Como preencher</p>
          <p className="mt-1 text-sm font-semibold leading-relaxed text-teal-900">Digite os números mostrados no aparelho. Exemplo: para 120 por 80, informe 120 na máxima e 80 na mínima.</p>
        </Card>
        {field('Pressão máxima (mmHg)', 'systolic', 'number', true)}
        {field('Pressão mínima (mmHg)', 'diastolic', 'number', true)}
        {field('Pulso (batimentos por minuto)', 'pulse', 'number')}
        {textarea('Observações', 'notes')}
      </>
    )
  }

  return (
    <main className={`min-h-screen bg-slate-50 px-4 py-6 sm:px-6 sm:py-10 transition-all duration-200 ${isLargeFont ? 'font-large' : ''}`}>
      {showSplash && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 px-4 py-6 text-center text-white">
          <Card className="max-w-md rounded-xl border-teal-300/20 bg-teal-900/95 px-8 py-10 text-white shadow-xl">
            <p className="text-sm uppercase tracking-[0.2em] text-teal-200">Olá, Beatriz</p>
            <h1 className="mt-4 text-4xl font-bold tracking-tight text-white">Carregando seus dados...</h1>
            <p className="mt-4 text-base leading-7 text-teal-100">
              Aguarde só um instante enquanto o aplicativo prepara as informações para você.
            </p>
          </Card>
        </div>
      )}
      <div className="mx-auto max-w-5xl">

        {/* Barra de Acessibilidade */}
        <Card className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-xl border-teal-100 bg-teal-50/80 p-4 shadow-sm">
          <span className="text-base font-bold text-teal-900">Configuração de leitura:</span>
          <Button
            type="button"
            onClick={() => setIsLargeFont((current) => !current)}
            aria-pressed={isLargeFont}
            variant="outline"
            className="rounded-2xl border-teal-600 bg-white text-teal-950 shadow-md hover:bg-teal-100"
          >
            {isLargeFont ? '🔍 Usar Letra Normal' : '🔍 Usar Letra Grande (Recomendado)'}
          </Button>
        </Card>

        <header className="mb-8 rounded-xl bg-teal-800 px-6 py-7 text-white shadow-lg shadow-teal-950/10 sm:px-9">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-base font-medium text-teal-100">Olá, Beatriz</p>
              <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Minha Saúde</h1>
            </div>
            <div className="rounded-lg border border-white/10 bg-teal-700/70 px-4 py-3 text-right text-lg font-semibold text-teal-50 sm:px-5">
              <p className="text-sm uppercase tracking-[0.2em] text-teal-200">Horário atual</p>
              <p className="mt-1 text-2xl">{currentTime}</p>
            </div>
          </div>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-teal-50">
          Registre consultas, exames, medicamentos, peso, pressão e sintomas de forma simples.
          </p>
        </header>

        <Card className="mb-6 rounded-xl border-teal-100 bg-teal-50/80 px-6 py-5 text-base text-teal-900 shadow-sm">
          <p className="font-extrabold text-lg text-teal-950">💡 Como usar</p>
          <ol className="mt-3 space-y-2 pl-5 text-base font-bold leading-7">
            <li>1. Use <span className="font-extrabold text-teal-700">Visão geral</span> para acompanhar a saúde.</li>
            <li>2. Use <span className="font-extrabold text-teal-700">Adicionar</span> para registrar uma informação nova.</li>
            <li>3. Use <span className="font-extrabold text-teal-700">Meus registros</span> para editar ou excluir informações.</li>
            <li>4. Use <span className="font-extrabold text-teal-700">Evolução</span> para ver a história da saúde por data.</li>
          </ol>
        </Card>

        {notice && (
          <div
            role="status"
            className={`mb-6 rounded-lg border px-5 py-4 text-base font-bold shadow-sm ${
              notice.type === 'success'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-950'
                : 'border-rose-200 bg-rose-50 text-rose-950'
            }`}
          >
            {notice.text}
          </div>
        )}

        <Tabs defaultValue="overview">
          <TabsList aria-label="Áreas do aplicativo" className="app-tabs-list sticky top-2 z-20 mb-7 rounded-xl bg-slate-100/95 shadow-sm backdrop-blur">
            <TabsTrigger value="overview">📊 Visão geral</TabsTrigger>
            <TabsTrigger value="add">➕ Adicionar</TabsTrigger>
            <TabsTrigger value="records">🗂️ Meus registros</TabsTrigger>
            <TabsTrigger value="evolution">🗓️ Evolução</TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
        <section aria-labelledby="dashboard-title">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 id="dashboard-title" className="text-2xl font-extrabold text-slate-900">
              📊 Resumo da Minha Saúde
            </h2>
            <Button
              type="button"
              onClick={() => void refreshDashboard(true)}
              disabled={isDashboardLoading}
              variant="outline"
              className="border-teal-700 bg-white text-teal-800 shadow-sm hover:bg-teal-50"
            >
              {isDashboardLoading ? '🔄 Atualizando...' : '🔄 Atualizar painel'}
            </Button>
          </div>

          <div className="large-font-summary grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <Card className="rounded-xl border-slate-200/70 bg-white p-5 shadow-sm">
              <p className="text-base font-bold text-slate-600 flex items-center gap-1.5">📅 Próxima consulta</p>
              <p className="mt-3 text-xl font-extrabold leading-snug text-teal-900">
                {isDashboardLoading ? 'Carregando...' : summary.nextConsultation}
              </p>
            </Card>
            <Card className="rounded-xl border-slate-200/70 bg-white p-5 shadow-sm">
              <p className="text-base font-bold text-slate-600 flex items-center gap-1.5">💊 Remédios ativos</p>
              <p className="mt-3 text-3xl font-extrabold text-teal-900">
                {isDashboardLoading ? '—' : summary.activeMedications}
              </p>
            </Card>
            <Card className="rounded-xl border-slate-200/70 bg-white p-5 shadow-sm">
              <p className="text-base font-bold text-slate-600 flex items-center gap-1.5">⚖️ Último peso</p>
              <p className="mt-3 text-3xl font-extrabold text-teal-900">
                {isDashboardLoading ? '—' : summary.lastWeight}
              </p>
            </Card>
            <Card className="rounded-xl border-slate-200/70 bg-white p-5 shadow-sm">
              <p className="text-base font-bold text-slate-600 flex items-center gap-1.5">📄 Exames pendentes</p>
              <p className="mt-3 text-3xl font-extrabold text-teal-900">
                {isDashboardLoading ? '—' : summary.pendingExams}
              </p>
            </Card>
            <Card className="rounded-xl border-rose-100 bg-rose-50/50 p-5 shadow-sm">
              <p className="text-base font-bold text-slate-600 flex items-center gap-1.5">❤️ Última pressão</p>
              <p className="mt-3 text-2xl font-extrabold text-rose-800">
                {isDashboardLoading ? '—' : summary.lastBloodPressure}
              </p>
            </Card>
          </div>

          <div className="large-font-details mt-6 grid gap-4 lg:grid-cols-2">
            <Card className="rounded-xl border-slate-200/70 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-base font-extrabold text-slate-700 flex items-center gap-1.5">📋 Exames pendentes</p>
                  <p className="mt-2 text-sm text-slate-500">Veja quais exames ainda estão aguardando resultado.</p>
                </div>
                <Badge>
                  {isDashboardLoading ? '...' : summary.pendingExams}
                </Badge>
              </div>
              {!isDashboardLoading && summary.pendingExams > 0 ? (
                summary.pendingExamsList.length > 0 ? (
                  <ul className="mt-5 space-y-3 text-slate-700">
                    {summary.pendingExamsList.map((item, index) => (
                      <li key={index} className="rounded-lg border border-slate-200 bg-slate-50/70 px-4 py-3 font-semibold">
                        {item}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-5 text-sm font-medium text-slate-500">
                    A lista de exames pendentes está sendo atualizada.
                  </p>
                )
              ) : !isDashboardLoading ? (
                <p className="mt-5 text-sm font-medium text-slate-500">Nenhum exame pendente no momento.</p>
              ) : null}
            </Card>

            <Card className="rounded-xl border-slate-200/70 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-base font-extrabold text-slate-700 flex items-center gap-1.5">💊 Remédios em uso hoje</p>
                  <p className="mt-2 text-sm text-slate-500">Veja os remédios que estão ativos na data de hoje.</p>
                </div>
                <Badge>
                  {isDashboardLoading ? '...' : summary.activeMedications}
                </Badge>
              </div>
              {!isDashboardLoading && summary.activeMedicationsList.length > 0 ? (
                <ul className="mt-5 space-y-3 text-slate-700">
                  {sortMedicationSummariesAlphabetically(summary.activeMedicationsList).map((item, index) => (
                    <li key={index} className="rounded-lg border border-slate-200 bg-slate-50/70 px-4 py-3 font-semibold">
                      {item}
                    </li>
                  ))}
                </ul>
              ) : !isDashboardLoading ? (
                <p className="mt-5 text-sm font-medium text-slate-500">Nenhum medicamento ativo no momento.</p>
              ) : null}
            </Card>
          </div>

          <Card className="mt-6 rounded-xl border-slate-200/70 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-base font-extrabold text-slate-700 flex items-center gap-1.5">📅 Próximas consultas (Agenda)</p>
                <p className="mt-2 text-sm text-slate-500">Todas as consultas futuras, organizadas da mais próxima para a mais distante.</p>
              </div>
            </div>
            {!isDashboardLoading && summary.upcomingConsultations.length > 0 ? (
              <ul className="mt-5 space-y-3 text-slate-700">
                {summary.upcomingConsultations.map((item, index) => (
                  <li key={index} className="rounded-lg border border-slate-200 bg-slate-50/70 px-4 py-3 font-semibold">
                    {item}
                  </li>
                ))}
              </ul>
            ) : !isDashboardLoading ? (
              <p className="mt-5 text-sm font-medium text-slate-500">Nenhuma consulta agendada para os próximos dias.</p>
            ) : null}
          </Card>

        </section>
          </TabsContent>

          <TabsContent value="evolution">
            <section aria-labelledby="timeline-title">
              <h2 id="timeline-title" className="text-2xl font-extrabold text-slate-900">🗓️ Evolução da saúde</h2>
              <p className="mt-2 text-base font-semibold leading-relaxed text-slate-600">
                As consultas de hoje e as futuras aparecem primeiro, da mais próxima para a mais distante. Depois, veja os demais registros do mais recente para o mais antigo.
              </p>
              {timelineItems.length > 0 ? (
                <ol className="mt-6 space-y-4 border-l-4 border-teal-100 pl-5 sm:pl-7">
                  {timelineItems.map((item) => (
                    <li key={item.id} className="relative">
                      <span className="absolute -left-[2.35rem] top-5 flex h-9 w-9 items-center justify-center rounded-full border-4 border-slate-50 bg-white text-lg sm:-left-[3.05rem]" aria-hidden="true">{item.icon}</span>
                      <Card className={`rounded-xl border p-5 shadow-sm ${item.tone}`}>
                        <p className="text-sm font-extrabold uppercase tracking-wide opacity-80">{item.date || 'Data não informada'}</p>
                        <h3 className="mt-1 text-lg font-extrabold">{item.title}</h3>
                        <p className="mt-2 break-words font-semibold leading-relaxed">{item.detail}</p>
                      </Card>
                    </li>
                  ))}
                </ol>
              ) : !isDashboardLoading ? (
                <Card className="mt-6 rounded-xl border-slate-200 bg-white p-5 shadow-sm">
                  <p className="font-semibold text-slate-600">Ainda não há registros para mostrar na evolução.</p>
                </Card>
              ) : null}
            </section>
          </TabsContent>

          <TabsContent value="records">
          <section className="mt-8" aria-labelledby="records-title">
            <h2 id="records-title" className="text-2xl font-extrabold text-slate-900">
              🗂️ Meus registros detalhados
            </h2>
            <p className="mt-2 text-base font-semibold text-slate-600">
              Aqui ficam todas as informações que já foram salvas na planilha.
            </p>

            <div className="mt-5 space-y-5">
              <Card className="rounded-xl border-slate-200/70 bg-white p-5 shadow-sm">
                <h3 className="text-xl font-extrabold text-teal-950">🔬 Exames</h3>
                <p className="mt-1 text-sm font-semibold text-slate-500">
                  Para atualizar, escolha um novo status no próprio exame.
                </p>
                {summary.records.exams.length > 0 ? (
                  <div className="large-font-details mt-4 grid gap-4 lg:grid-cols-2">
                    {sortByClosestDate(summary.records.exams).map((exam) => (
                      <div key={exam.row} className="rounded-lg border border-slate-200 bg-slate-50/70 p-4">
                        <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="break-words text-lg font-extrabold text-slate-900">{exam.examName}</p>
                            <p className="mt-1 font-semibold text-slate-600">Data: {exam.date || 'Não informada'}</p>
                          </div>
                          <Badge className="shrink-0">
                            {exam.status}
                          </Badge>
                        </div>
                        <dl className="mt-3 space-y-2 text-base text-slate-700">
                          <div><dt className="font-extrabold">Resultado</dt><dd>{exam.resultSummary || 'Ainda não informado'}</dd></div>
                          <div><dt className="font-extrabold">Observações</dt><dd>{exam.notes || 'Nenhuma observação'}</dd></div>
                        </dl>
                        <div className="mt-4 block font-extrabold text-slate-800">
                          <Label htmlFor={`exam-status-${exam.row}`} className="text-base font-extrabold">Alterar status</Label>
                          <Select
                            value={exam.status}
                            disabled={updatingExamRow === exam.row}
                            onValueChange={(value) => void handleExamStatusChange(exam.row, value as ExamStatus)}
                          >
                            <SelectTrigger
                              id={`exam-status-${exam.row}`}
                              className="mt-2 min-h-12 w-full rounded-lg border-teal-300 bg-white px-4 py-3 text-base font-extrabold text-teal-950 shadow-sm focus:ring-2 focus:ring-teal-100"
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Pendente">Pendente</SelectItem>
                              <SelectItem value="Realizado">Realizado</SelectItem>
                              <SelectItem value="Avaliado">Avaliado</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        {updatingExamRow === exam.row && (
                          <p className="mt-2 font-bold text-teal-800" role="status">Salvando novo status...</p>
                        )}
                        {recordActions('exam', 'exams', exam.row, exam.examName, {
                          date: exam.date, examName: exam.examName, resultSummary: exam.resultSummary,
                          status: exam.status, notes: exam.notes,
                        })}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-4 font-semibold text-slate-500">Nenhum exame registrado ainda.</p>
                )}
              </Card>

              <Card className="rounded-xl border-indigo-100 bg-white p-5 shadow-sm">
                <h3 className="text-xl font-extrabold text-indigo-950">🧾 Receitas médicas</h3>
                <p className="mt-1 text-sm font-semibold text-slate-500">As fotos ficam arquivadas com a data, um nome simples e as observações que você quiser.</p>
                {summary.records.prescriptions.length > 0 ? (
                  <ul className="mt-4 space-y-3">
                    {sortByClosestDate(summary.records.prescriptions).map((item) => (
                      <li key={item.row} className="rounded-lg border border-indigo-100 bg-indigo-50/40 p-4 text-slate-700">
                        <p className="text-lg font-extrabold text-slate-900">{item.title}</p>
                        <p className="font-bold">{item.date || 'Data não informada'}</p>
                        <p className="mt-2 break-words"><span className="font-extrabold">Observações:</span> {item.notes || 'Nenhuma observação'}</p>
                        <Button
                          type="button"
                          variant="outline"
                          disabled={isPrescriptionImageLoading === item.row}
                          onClick={() => void openPrescriptionImage(item.row, item.title)}
                          className="mt-4 border-indigo-200 bg-white text-indigo-800 hover:bg-indigo-50"
                        >
                          {isPrescriptionImageLoading === item.row ? 'Abrindo foto...' : '📷 Ver foto da receita'}
                        </Button>
                        {recordActions('prescription', 'prescriptions', item.row, item.title, {
                          date: item.date, title: item.title, notes: item.notes,
                          fileName: item.fileName, mimeType: item.mimeType, fileId: item.fileId,
                        })}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-4 font-semibold text-slate-500">Nenhuma receita arquivada ainda.</p>
                )}
              </Card>

              <div className="large-font-details grid gap-5 lg:grid-cols-2">
                <Card className="rounded-xl border-slate-200/70 bg-white p-5 shadow-sm">
                  <h3 className="text-xl font-extrabold text-teal-950">🩺 Consultas</h3>
                  {summary.records.consultations.length > 0 ? (
                    <ul className="mt-4 space-y-3">
                      {sortConsultationsByDate(summary.records.consultations).map((item) => (
                        <li key={item.row} className="rounded-lg border border-slate-200 bg-slate-50/70 p-4 text-slate-700">
                          <p className="text-lg font-extrabold text-slate-900">{item.doctor}</p>
                          <p className="font-bold">{item.date}{item.time ? ` às ${item.time}` : ''} · {item.specialty}</p>
                          <p className="mt-2"><span className="font-extrabold">Local:</span> {item.location || 'Não informado'}</p>
                          <p><span className="font-extrabold">Observações:</span> {item.notes || 'Nenhuma'}</p>
                          {(item.questions || item.relatedSymptoms || item.relatedExams || item.pendingItems || item.doctorSummary || item.diagnosis || item.requestedExams || item.treatmentChanges || item.nextReturn || item.returnTime) && (
                            <details className="mt-4 rounded-lg border border-teal-100 bg-white/80 p-4">
                              <summary className="cursor-pointer text-base font-extrabold text-teal-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300">📋 Ver acompanhamento desta consulta</summary>
                              <dl className="mt-4 space-y-3 border-t border-teal-100 pt-4 text-base leading-relaxed">
                                {(item.questions || item.relatedSymptoms || item.relatedExams || item.pendingItems) && (
                                  <div className="space-y-3">
                                    <p className="font-extrabold text-teal-950">Antes da consulta</p>
                                    {item.questions && <div><dt className="font-extrabold">Perguntas</dt><dd className="break-words">{item.questions}</dd></div>}
                                    {item.relatedSymptoms && <div><dt className="font-extrabold">Sintomas relacionados</dt><dd className="break-words">{item.relatedSymptoms}</dd></div>}
                                    {item.relatedExams && <div><dt className="font-extrabold">Exames relacionados</dt><dd className="break-words">{item.relatedExams}</dd></div>}
                                    {item.pendingItems && <div><dt className="font-extrabold">Pendências</dt><dd className="break-words">{item.pendingItems}</dd></div>}
                                  </div>
                                )}
                                {(item.doctorSummary || item.diagnosis || item.requestedExams || item.treatmentChanges || item.nextReturn || item.returnTime) && (
                                  <div className="space-y-3 border-t border-teal-100 pt-4">
                                    <p className="font-extrabold text-teal-950">Depois da consulta</p>
                                    {item.doctorSummary && <div><dt className="font-extrabold">O que o médico informou</dt><dd className="break-words">{item.doctorSummary}</dd></div>}
                                    {item.diagnosis && <div><dt className="font-extrabold">Diagnóstico ou hipótese</dt><dd className="break-words">{item.diagnosis}</dd></div>}
                                    {item.requestedExams && <div><dt className="font-extrabold">Exames solicitados</dt><dd className="break-words">{item.requestedExams}</dd></div>}
                                    {item.treatmentChanges && <div><dt className="font-extrabold">Mudanças de tratamento</dt><dd className="break-words">{item.treatmentChanges}</dd></div>}
                                    {(item.nextReturn || item.returnTime) && <div><dt className="font-extrabold">Próximo retorno</dt><dd>{item.nextReturn || 'Data não informada'}{item.returnTime ? ` às ${item.returnTime}` : ''}</dd></div>}
                                  </div>
                                )}
                              </dl>
                            </details>
                          )}
                          {recordActions('consultation', 'consultations', item.row, item.doctor, {
                            date: item.date, time: item.time ?? '', doctor: item.doctor, specialty: item.specialty,
                            location: item.location, notes: item.notes, questions: item.questions,
                            relatedSymptoms: item.relatedSymptoms, relatedExams: item.relatedExams,
                            pendingItems: item.pendingItems, doctorSummary: item.doctorSummary,
                            diagnosis: item.diagnosis, requestedExams: item.requestedExams,
                            treatmentChanges: item.treatmentChanges, nextReturn: item.nextReturn, returnTime: item.returnTime,
                          })}
                        </li>
                      ))}
                    </ul>
                  ) : <p className="mt-4 font-semibold text-slate-500">Nenhuma consulta registrada ainda.</p>}
                </Card>

                <Card className="rounded-xl border-slate-200/70 bg-white p-5 shadow-sm">
                  <h3 className="text-xl font-extrabold text-teal-950">💊 Medicamentos</h3>
                  {summary.records.medications.length > 0 ? (
                    <ul className="mt-4 space-y-3">
                      {sortMedicationsAlphabetically(summary.records.medications).map((item) => (
                        <li key={item.row} className="rounded-lg border border-slate-200 bg-slate-50/70 p-4 text-slate-700">
                          <p className="text-lg font-extrabold text-slate-900">{item.name}</p>
                          <p className="font-bold">{item.dosage} · {item.schedule}</p>
                          <p className="mt-2"><span className="font-extrabold">Período:</span> {item.startDate}{item.endDate ? ` até ${item.endDate}` : ' em diante'}</p>
                          <p><span className="font-extrabold">Observações:</span> {item.notes || 'Nenhuma'}</p>
                          {recordActions('medication', 'medications', item.row, item.name, {
                            name: item.name, dosage: item.dosage, schedule: item.schedule,
                            startDate: item.startDate, endDate: item.endDate, notes: item.notes,
                          })}
                        </li>
                      ))}
                    </ul>
                  ) : <p className="mt-4 font-semibold text-slate-500">Nenhum medicamento registrado ainda.</p>}
                </Card>

                <Card className="rounded-xl border-slate-200/70 bg-white p-5 shadow-sm">
                  <h3 className="text-xl font-extrabold text-teal-950">⚖️ Histórico de peso</h3>
                  {summary.records.weights.length > 0 ? (
                    <ul className="mt-4 space-y-3">
                      {sortByClosestDate(summary.records.weights).map((item) => (
                        <li key={item.row} className="rounded-lg border border-slate-200 bg-slate-50/70 p-4 text-slate-700">
                          <p className="text-lg font-extrabold text-slate-900">{item.weight}</p>
                          <p className="font-bold">{item.date}</p>
                          <p className="mt-2"><span className="font-extrabold">Observações:</span> {item.notes || 'Nenhuma'}</p>
                          {recordActions('weight', 'weights', item.row, item.weight, {
                            date: item.date, weight: item.weight.replace(' kg', ''), notes: item.notes,
                          })}
                        </li>
                      ))}
                    </ul>
                  ) : <p className="mt-4 font-semibold text-slate-500">Nenhum peso registrado ainda.</p>}
                </Card>

                <Card className="rounded-xl border-slate-200/70 bg-white p-5 shadow-sm">
                  <h3 className="text-xl font-extrabold text-teal-950">🤒 Sintomas</h3>
                  {summary.records.symptoms.length > 0 ? (
                    <ul className="mt-4 space-y-3">
                      {sortByClosestDate(summary.records.symptoms).map((item) => (
                        <li key={item.row} className="rounded-lg border border-slate-200 bg-slate-50/70 p-4 text-slate-700">
                          <p className="text-lg font-extrabold text-slate-900">{item.description}</p>
                          <p className="font-bold">{item.date} · Intensidade {item.intensity}</p>
                          <p className="mt-2"><span className="font-extrabold">Observações:</span> {item.notes || 'Nenhuma'}</p>
                          {recordActions('symptom', 'symptoms', item.row, item.description, {
                            date: item.date, description: item.description, intensity: item.intensity, notes: item.notes,
                          })}
                        </li>
                      ))}
                    </ul>
                  ) : <p className="mt-4 font-semibold text-slate-500">Nenhum sintoma registrado ainda.</p>}
                </Card>

                <Card className="rounded-xl border-rose-100 bg-white p-5 shadow-sm">
                  <h3 className="text-xl font-extrabold text-rose-900">❤️ Pressão arterial</h3>
                  {summary.records.bloodPressures.length > 0 ? (
                    <ul className="mt-4 space-y-3">
                      {sortByClosestDate(summary.records.bloodPressures).map((item) => (
                        <li key={item.row} className="rounded-lg border border-rose-100 bg-rose-50/40 p-4 text-slate-700">
                          <p className="text-2xl font-extrabold text-rose-900">{item.systolic}/{item.diastolic} mmHg</p>
                          <p className="font-bold">{item.date}{item.pulse ? ` · Pulso ${item.pulse} bpm` : ''}</p>
                          <p className="mt-2"><span className="font-extrabold">Observações:</span> {item.notes || 'Nenhuma'}</p>
                          {recordActions('bloodPressure', 'bloodPressures', item.row, `${item.systolic}/${item.diastolic} mmHg`, {
                            date: item.date, systolic: item.systolic, diastolic: item.diastolic,
                            pulse: item.pulse, notes: item.notes,
                          })}
                        </li>
                      ))}
                    </ul>
                  ) : <p className="mt-4 font-semibold text-slate-500">Nenhuma pressão registrada ainda.</p>}
                </Card>
              </div>
            </div>
          </section>
          </TabsContent>

          <TabsContent value="add">
        <section aria-labelledby="actions-title">
          <h2 id="actions-title" className="text-2xl font-extrabold text-slate-900">
            📝 Registrar uma informação nova
          </h2>
          <p className="mt-2 text-lg font-semibold text-slate-600">Escolha o botão abaixo correspondente ao que quer adicionar:</p>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {formConfigs.map((form) => (
              <Button
                key={form.key}
                type="button"
                onClick={() => openForm(form.key)}
                variant="secondary"
                className="h-auto min-h-[8.5rem] flex-col items-start justify-center rounded-xl border border-slate-200 bg-white px-6 py-6 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-teal-300 hover:bg-teal-50/70 hover:shadow-md focus:ring-teal-200"
              >
                <span className="block text-xl font-extrabold text-slate-900">{form.title}</span>
                <span className="mt-2 block text-base font-bold leading-relaxed text-slate-600">{form.description}</span>
              </Button>
            ))}
          </div>
        </section>
          </TabsContent>
        </Tabs>
      </div>

      <Dialog
        open={Boolean(activeConfig)}
        onOpenChange={(open) => {
          if (!open) {
            closeForm()
          }
        }}
      >
        {activeConfig && (
          <DialogContent
            className="rounded-xl border border-slate-200 bg-white shadow-xl"
            onEscapeKeyDown={(event) => event.preventDefault()}
            onPointerDownOutside={(event) => event.preventDefault()}
          >
            <DialogHeader className="border-b border-slate-100 pb-4">
              <DialogTitle id="form-title" className="text-2xl font-extrabold text-teal-950">
                {editTarget ? activeConfig.title.replace('Registrar', 'Editar') : activeConfig.title}
              </DialogTitle>
              <DialogDescription className="text-base font-semibold leading-relaxed text-slate-600">
                {activeConfig.description}
              </DialogDescription>
            </DialogHeader>

            <form className="mt-7 space-y-6" onSubmit={handleSubmit}>
              {renderFormFields()}

              <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  onClick={closeForm}
                  disabled={isSubmitting}
                  variant="secondary"
                  className="rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="rounded-lg bg-teal-700 text-white shadow-sm hover:bg-teal-800 focus:ring-teal-200"
                >
                  {isSubmitting ? '⏳ Salvando...' : editTarget ? '💾 Salvar alterações' : '💾 Salvar informação'}
                </Button>
              </div>
            </form>
          </DialogContent>
        )}
      </Dialog>

      <Dialog open={Boolean(viewingPrescription)} onOpenChange={(open) => !open && setViewingPrescription(null)}>
        {viewingPrescription && (
          <DialogContent className="max-w-3xl rounded-xl border border-indigo-100 bg-white shadow-xl">
            <DialogHeader className="border-b border-slate-100 pb-4">
              <DialogTitle className="text-2xl font-extrabold text-indigo-950">🧾 {viewingPrescription.title}</DialogTitle>
              <DialogDescription className="text-base font-semibold leading-relaxed text-slate-600">Foto arquivada da receita médica.</DialogDescription>
            </DialogHeader>
            <img src={viewingPrescription.image.imageData} alt={`Receita médica: ${viewingPrescription.title}`} className="mt-5 max-h-[70vh] w-full rounded-lg border border-indigo-100 bg-slate-50 object-contain" />
            <p className="mt-3 break-words text-sm font-semibold text-slate-500">Arquivo: {viewingPrescription.image.fileName}</p>
          </DialogContent>
        )}
      </Dialog>

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && !isDeleting && setDeleteTarget(null)}>
        {deleteTarget && (
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="text-2xl font-extrabold text-slate-900">Excluir este registro?</AlertDialogTitle>
              <AlertDialogDescription className="text-base leading-relaxed text-slate-600">
                Você está prestes a excluir <strong>“{deleteTarget.label}”</strong>. Essa informação será removida definitivamente da planilha{deleteTarget.resource === 'prescriptions' ? ' e a foto será removida do Drive' : ''} e não poderá ser recuperada.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel asChild><Button type="button" variant="outline" disabled={isDeleting}>Cancelar</Button></AlertDialogCancel>
              <AlertDialogAction asChild><Button type="button" disabled={isDeleting} onClick={() => void handleDelete()} className="bg-rose-600 text-white hover:bg-rose-700">{isDeleting ? 'Excluindo...' : 'Sim, excluir'}</Button></AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        )}
      </AlertDialog>
    </main>
  )
}
