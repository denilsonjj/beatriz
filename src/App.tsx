import { FormEvent, useEffect, useMemo, useState } from 'react'
import {
  DashboardSummary,
  ExamStatus,
  Resource,
  loadDashboardSummary,
  saveHealthRecord,
  updateExamStatus,
} from './services/healthApi'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

type FormKey = 'consultation' | 'exam' | 'medication' | 'weight' | 'symptom'

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

const emptySummary: DashboardSummary = {
  nextConsultation: 'Nenhuma agendada',
  upcomingConsultations: [],
  activeMedications: 0,
  activeMedicationsList: [],
  lastWeight: 'Sem registro',
  pendingExams: 0,
  pendingExamsList: [],
  records: {
    consultations: [],
    exams: [],
    medications: [],
    weights: [],
    symptoms: [],
  },
}

const formConfigs: FormConfig[] = [
  {
    key: 'consultation',
    title: '🩺 Registrar consulta',
    resource: 'consultations',
    description: 'Guarde a data e os detalhes da próxima ou última consulta.',
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
]

function todayIso() {
  const now = new Date()
  const timezoneOffset = now.getTimezoneOffset() * 60_000
  return new Date(now.getTime() - timezoneOffset).toISOString().slice(0, 10)
}

function getCurrentTime() {
  return new Date().toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function getInitialFormData(form: FormKey): Record<string, string> {
  const today = todayIso()

  switch (form) {
    case 'consultation':
      return { date: today, doctor: '', specialty: '', location: '', notes: '' }
    case 'exam':
      return { date: today, examName: '', resultSummary: '', status: 'Pendente', notes: '' }
    case 'medication':
      return { name: '', dosage: '', schedule: '', startDate: today, endDate: '', notes: '' }
    case 'weight':
      return { date: today, weight: '', notes: '' }
    case 'symptom':
      return { date: today, description: '', intensity: 'Leve', notes: '' }
  }
}

function getClientValidationError(form: FormKey, data: Record<string, string>) {
  const requiredFields: Record<FormKey, Array<[string, string]>> = {
    consultation: [
      ['date', 'Informe a data da consulta.'],
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

  if (form === 'medication' && data.endDate && data.endDate < data.startDate) {
    return 'A data de término não pode ser anterior à data de início.'
  }

  return null
}

export default function App() {
  const [summary, setSummary] = useState<DashboardSummary>(emptySummary)
  const [isDashboardLoading, setIsDashboardLoading] = useState(true)
  const [activeForm, setActiveForm] = useState<FormKey | null>(null)
  const [formData, setFormData] = useState<Record<string, string>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [updatingExamRow, setUpdatingExamRow] = useState<number | null>(null)
  const [notice, setNotice] = useState<Notice>(null)
  const [currentTime, setCurrentTime] = useState(getCurrentTime())

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

  async function refreshDashboard(showSuccess = false) {
    setIsDashboardLoading(true)

    try {
      const data = await loadDashboardSummary()
      setSummary({
        ...emptySummary,
        ...data,
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
    setActiveForm(form)
    setFormData(getInitialFormData(form))
  }

  function closeForm() {
    if (!isSubmitting) {
      setActiveForm(null)
    }
  }

  function updateField(field: string, value: string) {
    setFormData((current) => ({ ...current, [field]: value }))
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
      await saveHealthRecord(activeConfig.resource, formData)
      await refreshDashboard()
      setActiveForm(null)
      setNotice({ type: 'success', text: '🎉 Informação salva com sucesso no Google Sheets!' })
    } catch (error) {
      setNotice({
        type: 'error',
        text: error instanceof Error ? `❌ ${error.message}` : '❌ Não foi possível salvar a informação.',
      })
    } finally {
      setIsSubmitting(false)
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
    'mt-2 w-full rounded-xl border-2 border-slate-300 bg-white px-4 py-3 text-lg text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-teal-700 focus:ring-4 focus:ring-teal-100 disabled:bg-slate-100'

  function renderFormFields() {
    if (!activeForm) {
      return null
    }

    const field = (label: string, name: string, type = 'text', required = false) => {
      const isDateField = type === 'date'
      return (
        <div className="block text-base font-bold text-slate-800">
          <label htmlFor={name}>{label}{required ? ' *' : ''}</label>
          <input
            id={name}
            name={name}
            type={type}
            value={formData[name] ?? ''}
            onChange={(event) => updateField(name, event.target.value)}
            required={required}
            className={inputClassName}
          />
          {isDateField && (
            <div className="mt-2 flex flex-wrap gap-2">
              <Button
                type="button"
                onClick={() => updateField(name, todayIso())}
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
                  updateField(name, yesterdayIso)
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
        <label htmlFor={name}>{label}{required ? ' *' : ''}</label>
        <input
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
      <label className="block text-base font-bold text-slate-800" htmlFor={name}>
        {label}{required ? ' *' : ''}
        <textarea
          id={name}
          name={name}
          value={formData[name] ?? ''}
          onChange={(event) => updateField(name, event.target.value)}
          required={required}
          rows={4}
          className={inputClassName}
        />
      </label>
    )

    const textareaWithChips = (label: string, name: string, chips: string[], required = false) => (
      <div className="block text-base font-bold text-slate-800">
        <label htmlFor={name}>{label}{required ? ' *' : ''}</label>
        <textarea
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

    const select = (label: string, name: string, options: string[]) => (
      <label className="block text-base font-bold text-slate-800" htmlFor={name}>
        {label} *
        <select
          id={name}
          name={name}
          value={formData[name] ?? ''}
          onChange={(event) => updateField(name, event.target.value)}
          required
          className={inputClassName}
        >
          {options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
    )

    if (activeForm === 'consultation') {
      return (
        <>
          {field('Data', 'date', 'date', true)}
          {field('Médico', 'doctor', 'text', true)}
          {fieldWithChips('Especialidade', 'specialty', ['Clínico Geral', 'Geriatra', 'Cardiologista', 'Oftalmologista', 'Ortopedista', 'Dentista'], true)}
          {field('Local', 'location')}
          {textarea('Observações', 'notes')}
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
            <input
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

    return (
      <>
        {field('Data', 'date', 'date', true)}
        {textareaWithChips('Descrição do sintoma', 'description', ['Dor de cabeça', 'Tontura', 'Enjoo', 'Dor nas costas', 'Pressão alta', 'Cansaço'], true)}
        {select('Intensidade', 'intensity', ['Leve', 'Moderada', 'Forte'])}
        {textarea('Observações', 'notes')}
      </>
    )
  }

  return (
    <main className={`min-h-screen bg-slate-50 px-4 py-6 sm:px-6 sm:py-10 transition-all duration-200 ${isLargeFont ? 'font-large' : ''}`}>
      {showSplash && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 px-4 py-6 text-center text-white">
          <div className="max-w-md rounded-[2rem] border border-teal-300/30 bg-teal-900/95 px-8 py-10 shadow-2xl">
            <p className="text-sm uppercase tracking-[0.2em] text-teal-200">Olá, Beatriz</p>
            <h1 className="mt-4 text-4xl font-bold tracking-tight text-white">Carregando seus dados...</h1>
            <p className="mt-4 text-base leading-7 text-teal-100">
              Aguarde só um instante enquanto o aplicativo prepara as informações para você.
            </p>
          </div>
        </div>
      )}
      <div className="mx-auto max-w-5xl">

        {/* Barra de Acessibilidade */}
        <div className="mb-6 flex justify-between items-center gap-4 flex-wrap bg-teal-50 border-2 border-teal-200/60 p-4 rounded-3xl">
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
        </div>

        <header className="mb-8 rounded-3xl bg-teal-800 px-6 py-7 text-white shadow-soft sm:px-9">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-base font-medium text-teal-100">Olá, Beatriz</p>
              <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Minha Saúde</h1>
            </div>
            <div className="rounded-3xl bg-teal-700/90 px-4 py-3 text-right text-lg font-semibold text-teal-100 shadow-inner sm:px-5">
              <p className="text-sm uppercase tracking-[0.2em] text-teal-200">Horário atual</p>
              <p className="mt-1 text-2xl">{currentTime}</p>
            </div>
          </div>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-teal-50">
            Registre consultas, exames, medicamentos, peso e sintomas de forma simples.
          </p>
        </header>

        <div className="mb-6 rounded-3xl bg-teal-50 px-6 py-5 text-base text-teal-900 shadow-soft border-2 border-teal-100">
          <p className="font-extrabold text-lg text-teal-950">💡 Como usar</p>
          <ol className="mt-3 space-y-2 pl-5 text-base font-bold leading-7">
            <li>1. Clique no botão correspondente ao que quer registrar lá embaixo.</li>
            <li>2. Preencha os campos (apenas os marcados com <span className="font-extrabold text-teal-700">*</span> são obrigatórios).</li>
            <li>3. Toque no botão verde <span className="font-extrabold text-teal-700">Salvar informação</span>.</li>
          </ol>
        </div>

        {notice && (
          <div
            role="status"
            className={`mb-6 rounded-2xl border-2 px-5 py-4 text-base font-extrabold ${
              notice.type === 'success'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-950'
                : 'border-rose-200 bg-rose-50 text-rose-950'
            }`}
          >
            {notice.text}
          </div>
        )}

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

          <div className="large-font-summary grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="border-2 border-slate-100 bg-white p-5 shadow-soft">
              <p className="text-base font-bold text-slate-600 flex items-center gap-1.5">📅 Próxima consulta</p>
              <p className="mt-3 text-xl font-extrabold leading-snug text-teal-900">
                {isDashboardLoading ? 'Carregando...' : summary.nextConsultation}
              </p>
            </Card>
            <Card className="border-2 border-slate-100 bg-white p-5 shadow-soft">
              <p className="text-base font-bold text-slate-600 flex items-center gap-1.5">💊 Remédios ativos</p>
              <p className="mt-3 text-3xl font-extrabold text-teal-900">
                {isDashboardLoading ? '—' : summary.activeMedications}
              </p>
            </Card>
            <Card className="border-2 border-slate-100 bg-white p-5 shadow-soft">
              <p className="text-base font-bold text-slate-600 flex items-center gap-1.5">⚖️ Último peso</p>
              <p className="mt-3 text-3xl font-extrabold text-teal-900">
                {isDashboardLoading ? '—' : summary.lastWeight}
              </p>
            </Card>
            <Card className="border-2 border-slate-100 bg-white p-5 shadow-soft">
              <p className="text-base font-bold text-slate-600 flex items-center gap-1.5">📄 Exames pendentes</p>
              <p className="mt-3 text-3xl font-extrabold text-teal-900">
                {isDashboardLoading ? '—' : summary.pendingExams}
              </p>
            </Card>
          </div>

          <div className="large-font-details mt-6 grid gap-4 lg:grid-cols-2">
            <article className="rounded-3xl bg-white p-5 shadow-soft border-2 border-slate-100">
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
                      <li key={index} className="rounded-2xl border-2 border-slate-200 bg-slate-50 px-4 py-3 font-semibold">
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
            </article>

            <article className="rounded-3xl bg-white p-5 shadow-soft border-2 border-slate-100">
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
                  {summary.activeMedicationsList.map((item, index) => (
                    <li key={index} className="rounded-2xl border-2 border-slate-200 bg-slate-50 px-4 py-3 font-semibold">
                      {item}
                    </li>
                  ))}
                </ul>
              ) : !isDashboardLoading ? (
                <p className="mt-5 text-sm font-medium text-slate-500">Nenhum medicamento ativo no momento.</p>
              ) : null}
            </article>
          </div>

          <section className="mt-6 rounded-3xl bg-white p-5 shadow-soft border-2 border-slate-100">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-base font-extrabold text-slate-700 flex items-center gap-1.5">📅 Próximas consultas (Agenda)</p>
                <p className="mt-2 text-sm text-slate-500">As três consultas futuras mais próximas que estão agendadas.</p>
              </div>
            </div>
            {!isDashboardLoading && summary.upcomingConsultations.length > 0 ? (
              <ul className="mt-5 space-y-3 text-slate-700">
                {summary.upcomingConsultations.map((item, index) => (
                  <li key={index} className="rounded-2xl border-2 border-slate-200 bg-slate-50 px-4 py-3 font-semibold">
                    {item}
                  </li>
                ))}
              </ul>
            ) : !isDashboardLoading ? (
              <p className="mt-5 text-sm font-medium text-slate-500">Nenhuma consulta agendada para os próximos dias.</p>
            ) : null}
          </section>

          <section className="mt-8" aria-labelledby="records-title">
            <h2 id="records-title" className="text-2xl font-extrabold text-slate-900">
              🗂️ Meus registros detalhados
            </h2>
            <p className="mt-2 text-base font-semibold text-slate-600">
              Aqui ficam todas as informações que já foram salvas na planilha.
            </p>

            <div className="mt-5 space-y-5">
              <article className="rounded-3xl border-2 border-slate-100 bg-white p-5 shadow-soft">
                <h3 className="text-xl font-extrabold text-teal-950">🔬 Exames</h3>
                <p className="mt-1 text-sm font-semibold text-slate-500">
                  Para atualizar, escolha um novo status no próprio exame.
                </p>
                {summary.records.exams.length > 0 ? (
                  <div className="large-font-details mt-4 grid gap-4 lg:grid-cols-2">
                    {summary.records.exams.map((exam) => (
                      <div key={exam.row} className="rounded-2xl border-2 border-slate-200 bg-slate-50 p-4">
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
                        <label className="mt-4 block font-extrabold text-slate-800" htmlFor={`exam-status-${exam.row}`}>
                          Alterar status
                          <select
                            id={`exam-status-${exam.row}`}
                            value={exam.status}
                            disabled={updatingExamRow === exam.row}
                            onChange={(event) => void handleExamStatusChange(exam.row, event.target.value as ExamStatus)}
                            className="mt-2 w-full rounded-xl border-2 border-teal-600 bg-white px-4 py-3 text-base font-extrabold text-teal-950 outline-none focus:ring-4 focus:ring-teal-100 disabled:opacity-60"
                          >
                            <option value="Pendente">Pendente</option>
                            <option value="Realizado">Realizado</option>
                            <option value="Avaliado">Avaliado</option>
                          </select>
                        </label>
                        {updatingExamRow === exam.row && (
                          <p className="mt-2 font-bold text-teal-800" role="status">Salvando novo status...</p>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-4 font-semibold text-slate-500">Nenhum exame registrado ainda.</p>
                )}
              </article>

              <div className="large-font-details grid gap-5 lg:grid-cols-2">
                <article className="rounded-3xl border-2 border-slate-100 bg-white p-5 shadow-soft">
                  <h3 className="text-xl font-extrabold text-teal-950">🩺 Consultas</h3>
                  {summary.records.consultations.length > 0 ? (
                    <ul className="mt-4 space-y-3">
                      {summary.records.consultations.map((item) => (
                        <li key={item.row} className="rounded-2xl border-2 border-slate-200 bg-slate-50 p-4 text-slate-700">
                          <p className="text-lg font-extrabold text-slate-900">{item.doctor}</p>
                          <p className="font-bold">{item.date} · {item.specialty}</p>
                          <p className="mt-2"><span className="font-extrabold">Local:</span> {item.location || 'Não informado'}</p>
                          <p><span className="font-extrabold">Observações:</span> {item.notes || 'Nenhuma'}</p>
                        </li>
                      ))}
                    </ul>
                  ) : <p className="mt-4 font-semibold text-slate-500">Nenhuma consulta registrada ainda.</p>}
                </article>

                <article className="rounded-3xl border-2 border-slate-100 bg-white p-5 shadow-soft">
                  <h3 className="text-xl font-extrabold text-teal-950">💊 Medicamentos</h3>
                  {summary.records.medications.length > 0 ? (
                    <ul className="mt-4 space-y-3">
                      {summary.records.medications.map((item) => (
                        <li key={item.row} className="rounded-2xl border-2 border-slate-200 bg-slate-50 p-4 text-slate-700">
                          <p className="text-lg font-extrabold text-slate-900">{item.name}</p>
                          <p className="font-bold">{item.dosage} · {item.schedule}</p>
                          <p className="mt-2"><span className="font-extrabold">Período:</span> {item.startDate}{item.endDate ? ` até ${item.endDate}` : ' em diante'}</p>
                          <p><span className="font-extrabold">Observações:</span> {item.notes || 'Nenhuma'}</p>
                        </li>
                      ))}
                    </ul>
                  ) : <p className="mt-4 font-semibold text-slate-500">Nenhum medicamento registrado ainda.</p>}
                </article>

                <article className="rounded-3xl border-2 border-slate-100 bg-white p-5 shadow-soft">
                  <h3 className="text-xl font-extrabold text-teal-950">⚖️ Histórico de peso</h3>
                  {summary.records.weights.length > 0 ? (
                    <ul className="mt-4 space-y-3">
                      {summary.records.weights.map((item) => (
                        <li key={item.row} className="rounded-2xl border-2 border-slate-200 bg-slate-50 p-4 text-slate-700">
                          <p className="text-lg font-extrabold text-slate-900">{item.weight}</p>
                          <p className="font-bold">{item.date}</p>
                          <p className="mt-2"><span className="font-extrabold">Observações:</span> {item.notes || 'Nenhuma'}</p>
                        </li>
                      ))}
                    </ul>
                  ) : <p className="mt-4 font-semibold text-slate-500">Nenhum peso registrado ainda.</p>}
                </article>

                <article className="rounded-3xl border-2 border-slate-100 bg-white p-5 shadow-soft">
                  <h3 className="text-xl font-extrabold text-teal-950">🤒 Sintomas</h3>
                  {summary.records.symptoms.length > 0 ? (
                    <ul className="mt-4 space-y-3">
                      {summary.records.symptoms.map((item) => (
                        <li key={item.row} className="rounded-2xl border-2 border-slate-200 bg-slate-50 p-4 text-slate-700">
                          <p className="text-lg font-extrabold text-slate-900">{item.description}</p>
                          <p className="font-bold">{item.date} · Intensidade {item.intensity}</p>
                          <p className="mt-2"><span className="font-extrabold">Observações:</span> {item.notes || 'Nenhuma'}</p>
                        </li>
                      ))}
                    </ul>
                  ) : <p className="mt-4 font-semibold text-slate-500">Nenhum sintoma registrado ainda.</p>}
                </article>
              </div>
            </div>
          </section>
        </section>

        <section className="mt-10" aria-labelledby="actions-title">
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
                className="h-auto min-h-[8.5rem] flex-col items-start justify-center rounded-2xl border-2 border-slate-300 bg-white px-6 py-6 text-left shadow-soft transition hover:-translate-y-0.5 hover:border-teal-600 hover:bg-teal-50 focus:ring-teal-200"
              >
                <span className="block text-xl font-extrabold text-slate-900">{form.title}</span>
                <span className="mt-2 block text-base font-bold leading-relaxed text-slate-600">{form.description}</span>
              </Button>
            ))}
          </div>
        </section>
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
            className="rounded-3xl border-2 border-teal-100 bg-white shadow-2xl"
            onEscapeKeyDown={(event) => event.preventDefault()}
            onPointerDownOutside={(event) => event.preventDefault()}
          >
            <DialogHeader className="border-b border-slate-100 pb-4">
              <DialogTitle id="form-title" className="text-2xl font-extrabold text-teal-950">
                {activeConfig.title}
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
                  className="rounded-2xl border-2 border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="rounded-2xl bg-teal-700 text-white shadow-md hover:bg-teal-800 focus:ring-teal-200"
                >
                  {isSubmitting ? '⏳ Salvando...' : '💾 Salvar informação'}
                </Button>
              </div>
            </form>
          </DialogContent>
        )}
      </Dialog>
    </main>
  )
}
