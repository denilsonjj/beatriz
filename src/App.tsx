import { FormEvent, useEffect, useMemo, useState } from 'react'
import {
  DashboardSummary,
  Resource,
  loadDashboardSummary,
  saveHealthRecord,
} from './services/healthApi'

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
}

const formConfigs: FormConfig[] = [
  {
    key: 'consultation',
    title: 'Registrar consulta',
    resource: 'consultations',
    description: 'Guarde a data e os detalhes da próxima ou última consulta.',
  },
  {
    key: 'exam',
    title: 'Registrar exame',
    resource: 'exams',
    description: 'Organize os exames e acompanhe o status de cada um.',
  },
  {
    key: 'medication',
    title: 'Registrar medicamento',
    resource: 'medications',
    description: 'Mantenha os medicamentos e horários sempre atualizados.',
  },
  {
    key: 'weight',
    title: 'Registrar peso',
    resource: 'weights',
    description: 'Acompanhe o peso ao longo do tempo.',
  },
  {
    key: 'symptom',
    title: 'Registrar sintoma',
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
  const [notice, setNotice] = useState<Notice>(null)
  const [currentTime, setCurrentTime] = useState(getCurrentTime())
  const [showSplash, setShowSplash] = useState(true)

  useEffect(() => {
    const clockTimer = setInterval(() => {
      setCurrentTime(getCurrentTime())
    }, 1000)

    const splashTimer = setTimeout(() => {
      setShowSplash(false)
    }, 1700)

    return () => {
      clearInterval(clockTimer)
      clearTimeout(splashTimer)
    }
  }, [])

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
        setNotice({ type: 'success', text: 'Painel atualizado com sucesso.' })
      }
    } catch (error) {
      setNotice({
        type: 'error',
        text: error instanceof Error ? error.message : 'Não foi possível atualizar o painel.',
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
      setNotice({ type: 'error', text: validationError })
      return
    }

    setIsSubmitting(true)
    setNotice(null)

    try {
      await saveHealthRecord(activeConfig.resource, formData)
      await refreshDashboard()
      setActiveForm(null)
      setNotice({ type: 'success', text: 'Informação salva com sucesso.' })
    } catch (error) {
      setNotice({
        type: 'error',
        text: error instanceof Error ? error.message : 'Não foi possível salvar a informação.',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const inputClassName =
    'mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-lg text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-teal-700 focus:ring-4 focus:ring-teal-100 disabled:bg-slate-100'

  function renderFormFields() {
    if (!activeForm) {
      return null
    }

    const field = (label: string, name: string, type = 'text', required = false) => (
      <label className="block text-base font-semibold text-slate-800" htmlFor={name}>
        {label}{required ? ' *' : ''}
        <input
          id={name}
          name={name}
          type={type}
          value={formData[name] ?? ''}
          onChange={(event) => updateField(name, event.target.value)}
          required={required}
          className={inputClassName}
        />
      </label>
    )

    const textarea = (label: string, name: string, required = false) => (
      <label className="block text-base font-semibold text-slate-800" htmlFor={name}>
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

    const select = (label: string, name: string, options: string[]) => (
      <label className="block text-base font-semibold text-slate-800" htmlFor={name}>
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
          {field('Especialidade', 'specialty', 'text', true)}
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
          {field('Horário', 'schedule', 'text', true)}
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
          <label className="block text-base font-semibold text-slate-800" htmlFor="weight">
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
          </label>
          {textarea('Observações', 'notes')}
        </>
      )
    }

    return (
      <>
        {field('Data', 'date', 'date', true)}
        {textarea('Descrição do sintoma', 'description', true)}
        {select('Intensidade', 'intensity', ['Leve', 'Moderada', 'Forte'])}
        {textarea('Observações', 'notes')}
      </>
    )
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 sm:px-6 sm:py-10">
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

        <div className="mb-6 rounded-3xl bg-teal-50 px-6 py-5 text-base text-teal-900 shadow-soft">
          <p className="font-semibold">Como usar</p>
          <ol className="mt-3 space-y-2 pl-5 text-base leading-7">
            <li>1. Clique no botão do tipo de informação que quer registrar.</li>
            <li>2. Preencha apenas os campos marcados com <span className="font-semibold">*</span>.</li>
            <li>3. Toque em <span className="font-semibold">Salvar informação</span>.</li>
          </ol>
        </div>

        {notice && (
          <div
            role="status"
            className={`mb-6 rounded-2xl border px-5 py-4 text-base font-semibold ${
              notice.type === 'success'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                : 'border-rose-200 bg-rose-50 text-rose-900'
            }`}
          >
            {notice.text}
          </div>
        )}

        <section aria-labelledby="dashboard-title">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 id="dashboard-title" className="text-2xl font-bold text-slate-900">
              Resumo
            </h2>
            <button
              type="button"
              onClick={() => void refreshDashboard(true)}
              disabled={isDashboardLoading}
              className="rounded-xl border border-teal-700 bg-white px-4 py-3 text-base font-bold text-teal-800 transition hover:bg-teal-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isDashboardLoading ? 'Atualizando...' : 'Atualizar painel'}
            </button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <article className="rounded-2xl bg-white p-5 shadow-soft">
              <p className="text-base font-semibold text-slate-600">Próxima consulta</p>
              <p className="mt-3 text-xl font-bold leading-snug text-slate-900">
                {isDashboardLoading ? 'Carregando...' : summary.nextConsultation}
              </p>
            </article>
            <article className="rounded-2xl bg-white p-5 shadow-soft">
              <p className="text-base font-semibold text-slate-600">Medicamentos ativos</p>
              <p className="mt-3 text-3xl font-bold text-slate-900">
                {isDashboardLoading ? '—' : summary.activeMedications}
              </p>
            </article>
            <article className="rounded-2xl bg-white p-5 shadow-soft">
              <p className="text-base font-semibold text-slate-600">Último peso</p>
              <p className="mt-3 text-3xl font-bold text-slate-900">
                {isDashboardLoading ? '—' : summary.lastWeight}
              </p>
            </article>
            <article className="rounded-2xl bg-white p-5 shadow-soft">
              <p className="text-base font-semibold text-slate-600">Exames pendentes</p>
              <p className="mt-3 text-3xl font-bold text-slate-900">
                {isDashboardLoading ? '—' : summary.pendingExams}
              </p>
            </article>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <article className="rounded-3xl bg-white p-5 shadow-soft">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-base font-semibold text-slate-600">Exames pendentes</p>
                  <p className="mt-2 text-sm text-slate-500">Veja quais exames ainda estão aguardando resultado.</p>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-700">
                  {isDashboardLoading ? '...' : summary.pendingExams}
                </span>
              </div>
              {!isDashboardLoading && summary.pendingExamsList.length > 0 ? (
                <ul className="mt-5 space-y-3 text-slate-700">
                  {summary.pendingExamsList.map((item, index) => (
                    <li key={index} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                      {item}
                    </li>
                  ))}
                </ul>
              ) : !isDashboardLoading ? (
                <p className="mt-5 text-sm text-slate-500">Nenhum exame pendente no momento.</p>
              ) : null}
            </article>

            <article className="rounded-3xl bg-white p-5 shadow-soft">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-base font-semibold text-slate-600">Medicamentos ativos</p>
                  <p className="mt-2 text-sm text-slate-500">Veja os remédios que estão em uso hoje.</p>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-700">
                  {isDashboardLoading ? '...' : summary.activeMedications}
                </span>
              </div>
              {!isDashboardLoading && summary.activeMedicationsList.length > 0 ? (
                <ul className="mt-5 space-y-3 text-slate-700">
                  {summary.activeMedicationsList.map((item, index) => (
                    <li key={index} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                      {item}
                    </li>
                  ))}
                </ul>
              ) : !isDashboardLoading ? (
                <p className="mt-5 text-sm text-slate-500">Nenhum medicamento ativo no momento.</p>
              ) : null}
            </article>
          </div>

          <section className="mt-6 rounded-3xl bg-white p-5 shadow-soft">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-base font-semibold text-slate-600">Próximas consultas</p>
                <p className="mt-2 text-sm text-slate-500">As três consultas futuras mais próximas.</p>
              </div>
            </div>
            {!isDashboardLoading && summary.upcomingConsultations.length > 0 ? (
              <ul className="mt-5 space-y-3 text-slate-700">
                {summary.upcomingConsultations.map((item, index) => (
                  <li key={index} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                    {item}
                  </li>
                ))}
              </ul>
            ) : !isDashboardLoading ? (
              <p className="mt-5 text-sm text-slate-500">Nenhuma consulta agendada para os próximos dias.</p>
            ) : null}
          </section>
        </section>

        <section className="mt-10" aria-labelledby="actions-title">
          <h2 id="actions-title" className="text-2xl font-bold text-slate-900">
            Registrar uma informação
          </h2>
          <p className="mt-2 text-lg text-slate-600">Escolha o tipo de informação que deseja adicionar.</p>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {formConfigs.map((form) => (
              <button
                key={form.key}
                type="button"
                onClick={() => openForm(form.key)}
                className="min-h-[8rem] rounded-2xl border border-slate-200 bg-white px-6 py-6 text-left shadow-soft transition hover:-translate-y-0.5 hover:border-teal-600 hover:bg-teal-50 focus:outline-none focus:ring-4 focus:ring-teal-200"
              >
                <span className="block text-xl font-bold text-slate-900">{form.title}</span>
                <span className="mt-2 block text-base leading-relaxed text-slate-600">{form.description}</span>
              </button>
            ))}
          </div>
        </section>
      </div>

      {activeConfig && (
        <div
          className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/45 px-4 py-6 sm:py-10"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeForm()
            }
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="form-title"
            className="mx-auto w-full max-w-2xl rounded-3xl bg-white p-5 shadow-2xl sm:p-8"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="form-title" className="text-2xl font-bold text-slate-900">
                  {activeConfig.title}
                </h2>
                <p className="mt-2 text-base leading-relaxed text-slate-600">{activeConfig.description}</p>
              </div>
              <button
                type="button"
                onClick={closeForm}
                disabled={isSubmitting}
                aria-label="Fechar formulário"
                className="rounded-xl px-3 py-2 text-lg font-bold text-slate-700 transition hover:bg-slate-100 disabled:opacity-50"
              >
                Fechar
              </button>
            </div>

            <form className="mt-7 space-y-5" onSubmit={handleSubmit}>
              {renderFormFields()}

              <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={closeForm}
                  disabled={isSubmitting}
                  className="rounded-xl border border-slate-300 px-5 py-3 text-base font-bold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="rounded-xl bg-teal-700 px-6 py-3 text-base font-bold text-white transition hover:bg-teal-800 focus:outline-none focus:ring-4 focus:ring-teal-200 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSubmitting ? 'Salvando...' : 'Salvar informação'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </main>
  )
}
