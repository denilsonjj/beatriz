import { type FormEvent, useEffect, useMemo, useState } from 'react'
import { Accessibility, Activity, LayoutDashboard, ListPlus, NotebookTabs } from 'lucide-react'
import { DashboardView } from '@/components/dashboard-view'
import { RecordsView } from '@/components/records-view'
import { RegistrationView, type FormKey } from '@/components/registration-view'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  type DashboardSummary,
  type ExamStatus,
  type Resource,
  loadDashboardSummary,
  saveHealthRecord,
  updateExamStatus,
} from '@/services/healthApi'
import { cn } from '@/lib/utils'

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

type View = 'dashboard' | 'register' | 'history'

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
  { key: 'consultation', title: 'Registrar consulta', resource: 'consultations', description: 'Informe os dados da consulta para manter sua agenda organizada.' },
  { key: 'exam', title: 'Registrar exame', resource: 'exams', description: 'Guarde o nome, o resultado e a situação atual do exame.' },
  { key: 'medication', title: 'Registrar medicamento', resource: 'medications', description: 'Anote a dose, o horário e o período de uso do medicamento.' },
  { key: 'weight', title: 'Registrar peso', resource: 'weights', description: 'Adicione um novo peso para acompanhar sua evolução no gráfico.' },
  { key: 'symptom', title: 'Registrar sintoma', resource: 'symptoms', description: 'Descreva como está se sentindo e a intensidade do sintoma.' },
]

function todayIso() {
  const now = new Date()
  const timezoneOffset = now.getTimezoneOffset() * 60_000
  return new Date(now.getTime() - timezoneOffset).toISOString().slice(0, 10)
}

function getCurrentTime() {
  return new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function getInitialFormData(form: FormKey): Record<string, string> {
  const today = todayIso()
  switch (form) {
    case 'consultation': return { date: today, doctor: '', specialty: '', location: '', notes: '' }
    case 'exam': return { date: today, examName: '', resultSummary: '', status: 'Pendente', notes: '' }
    case 'medication': return { name: '', dosage: '', schedule: '', startDate: today, endDate: '', notes: '' }
    case 'weight': return { date: today, weight: '', notes: '' }
    case 'symptom': return { date: today, description: '', intensity: 'Leve', notes: '' }
  }
}

function getClientValidationError(form: FormKey, data: Record<string, string>) {
  const requiredFields: Record<FormKey, Array<[string, string]>> = {
    consultation: [['date', 'Informe a data da consulta.'], ['doctor', 'Informe o nome do médico.'], ['specialty', 'Informe a especialidade.']],
    exam: [['date', 'Informe a data do exame.'], ['examName', 'Informe o nome do exame.'], ['status', 'Selecione a situação do exame.']],
    medication: [['name', 'Informe o nome do medicamento.'], ['dosage', 'Informe a dosagem.'], ['schedule', 'Informe o horário.'], ['startDate', 'Informe a data de início.']],
    weight: [['date', 'Informe a data do peso.'], ['weight', 'Informe o peso em kg.']],
    symptom: [['date', 'Informe a data do sintoma.'], ['description', 'Descreva o sintoma.'], ['intensity', 'Selecione a intensidade.']],
  }

  for (const [field, message] of requiredFields[form]) {
    if (!data[field]?.trim()) return message
  }

  if (form === 'weight') {
    const weight = Number(data.weight.replace(',', '.'))
    if (!Number.isFinite(weight) || weight <= 0) return 'Informe um peso válido maior que zero.'
  }

  if (form === 'medication' && data.endDate && data.endDate < data.startDate) {
    return 'A data de término não pode ser anterior à data de início.'
  }

  return null
}

export default function App() {
  const [summary, setSummary] = useState<DashboardSummary>(emptySummary)
  const [view, setView] = useState<View>('dashboard')
  const [isDashboardLoading, setIsDashboardLoading] = useState(true)
  const [activeForm, setActiveForm] = useState<FormKey | null>(null)
  const [formData, setFormData] = useState<Record<string, string>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [updatingExamRow, setUpdatingExamRow] = useState<number | null>(null)
  const [notice, setNotice] = useState<Notice>(null)
  const [currentTime, setCurrentTime] = useState(getCurrentTime())
  const [minimumSplashElapsed, setMinimumSplashElapsed] = useState(false)
  const [showSplash, setShowSplash] = useState(true)
  const [isLargeFont, setIsLargeFont] = useState(() => localStorage.getItem('health_tracker_large_font') === 'true')

  const activeConfig = useMemo(() => formConfigs.find((form) => form.key === activeForm) ?? null, [activeForm])

  useEffect(() => {
    const clockTimer = setInterval(() => setCurrentTime(getCurrentTime()), 30_000)
    const splashTimer = setTimeout(() => setMinimumSplashElapsed(true), 700)
    return () => {
      clearInterval(clockTimer)
      clearTimeout(splashTimer)
    }
  }, [])

  useEffect(() => {
    localStorage.setItem('health_tracker_large_font', String(isLargeFont))
  }, [isLargeFont])

  useEffect(() => {
    if (!isDashboardLoading && minimumSplashElapsed) setShowSplash(false)
  }, [isDashboardLoading, minimumSplashElapsed])

  async function refreshDashboard(showSuccess = false) {
    setIsDashboardLoading(true)
    try {
      const data = await loadDashboardSummary()
      setSummary({ ...emptySummary, ...data, records: { ...emptySummary.records, ...data.records } })
      if (showSuccess) setNotice({ type: 'success', text: 'Dados atualizados com sucesso.' })
    } catch (error) {
      setNotice({ type: 'error', text: error instanceof Error ? error.message : 'Não foi possível atualizar os dados.' })
    } finally {
      setIsDashboardLoading(false)
    }
  }

  useEffect(() => { void refreshDashboard() }, [])

  function openForm(form: FormKey) {
    setNotice(null)
    setActiveForm(form)
    setFormData(getInitialFormData(form))
  }

  function closeForm() {
    if (!isSubmitting) setActiveForm(null)
  }

  function updateField(field: string, value: string) {
    setFormData((current) => ({ ...current, [field]: value }))
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!activeConfig || !activeForm) return

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
      setView('dashboard')
      setNotice({ type: 'success', text: 'Informação salva com sucesso no Google Sheets.' })
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (error) {
      setNotice({ type: 'error', text: error instanceof Error ? error.message : 'Não foi possível salvar a informação.' })
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
      setNotice({ type: 'success', text: `Situação do exame alterada para “${status}”.` })
    } catch (error) {
      setNotice({ type: 'error', text: error instanceof Error ? error.message : 'Não foi possível alterar a situação do exame.' })
    } finally {
      setUpdatingExamRow(null)
    }
  }

  const inputClassName = 'mt-2 min-h-12 w-full rounded-xl border-2 border-input bg-white px-4 py-3 text-lg text-foreground outline-none transition placeholder:text-slate-400 focus:border-primary focus:ring-4 focus:ring-primary/15 disabled:bg-muted'

  function renderFormFields() {
    if (!activeForm) return null

    const field = (label: string, name: string, type = 'text', required = false) => (
      <div>
        <label className="text-base font-extrabold text-foreground" htmlFor={name}>{label}{required ? ' *' : ''}</label>
        <input id={name} name={name} type={type} inputMode={name === 'weight' ? 'decimal' : undefined} value={formData[name] ?? ''} onChange={(event) => updateField(name, event.target.value)} required={required} className={inputClassName} />
        {type === 'date' && (
          <div className="mt-2 flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => updateField(name, todayIso())}>Usar data de hoje</Button>
          </div>
        )}
      </div>
    )

    const quickField = (label: string, name: string, choices: string[], required = false) => (
      <div>
        <label className="text-base font-extrabold text-foreground" htmlFor={name}>{label}{required ? ' *' : ''}</label>
        <input id={name} name={name} value={formData[name] ?? ''} onChange={(event) => updateField(name, event.target.value)} required={required} className={inputClassName} />
        <div className="mt-2 flex flex-wrap gap-2" aria-label={`Sugestões para ${label}`}>
          {choices.map((choice) => <Button key={choice} type="button" size="sm" variant="secondary" onClick={() => updateField(name, choice)}>{choice}</Button>)}
        </div>
      </div>
    )

    const textarea = (label: string, name: string, required = false, choices: string[] = []) => (
      <div>
        <label className="text-base font-extrabold text-foreground" htmlFor={name}>{label}{required ? ' *' : ''}</label>
        <textarea id={name} name={name} value={formData[name] ?? ''} onChange={(event) => updateField(name, event.target.value)} required={required} rows={4} className={inputClassName} />
        {choices.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2" aria-label={`Sugestões para ${label}`}>
            {choices.map((choice) => <Button key={choice} type="button" size="sm" variant="secondary" onClick={() => updateField(name, choice)}>{choice}</Button>)}
          </div>
        )}
      </div>
    )

    const select = (label: string, name: string, options: string[]) => (
      <div>
        <label className="text-base font-extrabold text-foreground" htmlFor={name}>{label} *</label>
        <select id={name} name={name} value={formData[name] ?? options[0]} onChange={(event) => updateField(name, event.target.value)} required className={inputClassName}>
          {options.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
      </div>
    )

    if (activeForm === 'consultation') return <>{field('Data', 'date', 'date', true)}{field('Médico', 'doctor', 'text', true)}{quickField('Especialidade', 'specialty', ['Clínico Geral', 'Geriatra', 'Cardiologista', 'Oftalmologista', 'Ortopedista', 'Dentista'], true)}{field('Local', 'location')}{textarea('Observações', 'notes')}</>
    if (activeForm === 'exam') return <>{field('Data', 'date', 'date', true)}{field('Nome do exame', 'examName', 'text', true)}{textarea('Resultado resumido', 'resultSummary')}{select('Situação', 'status', ['Pendente', 'Realizado', 'Avaliado'])}{textarea('Observações', 'notes')}</>
    if (activeForm === 'medication') return <>{field('Nome do medicamento', 'name', 'text', true)}{field('Dosagem', 'dosage', 'text', true)}{quickField('Horário', 'schedule', ['De manhã', 'No almoço', 'De noite', 'Antes de dormir', 'De 8 em 8 horas'], true)}{field('Data de início', 'startDate', 'date', true)}{field('Data de término', 'endDate', 'date')}{textarea('Observações', 'notes')}</>
    if (activeForm === 'weight') return <>{field('Data', 'date', 'date', true)}{field('Peso em kg', 'weight', 'text', true)}{summary.lastWeight !== 'Sem registro' && <Button type="button" variant="secondary" onClick={() => updateField('weight', summary.lastWeight.split(' ')[0])}>Repetir peso anterior ({summary.lastWeight})</Button>}{textarea('Observações', 'notes')}</>
    return <>{field('Data', 'date', 'date', true)}{textarea('Descrição do sintoma', 'description', true, ['Dor de cabeça', 'Tontura', 'Enjoo', 'Dor nas costas', 'Pressão alta', 'Cansaço'])}{select('Intensidade', 'intensity', ['Leve', 'Moderada', 'Forte'])}{textarea('Observações', 'notes')}</>
  }

  return (
    <main className={cn('min-h-screen px-4 py-5 text-foreground sm:px-6 sm:py-7', isLargeFont && 'font-large')}>
      {showSplash && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-primary px-6 text-center text-white">
          <div>
            <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-white/15"><Activity className="h-9 w-9" aria-hidden="true" /></span>
            <p className="mt-5 text-2xl font-black">Preparando sua saúde</p>
            <p className="mt-2 font-semibold text-white/80">Só um instante...</p>
          </div>
        </div>
      )}

      <div className="mx-auto max-w-7xl">
        <header className="rounded-2xl border border-primary/15 bg-white/90 p-5 shadow-card backdrop-blur sm:p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-center gap-4">
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary text-white shadow-sm"><Activity className="h-8 w-8" aria-hidden="true" /></span>
              <div className="min-w-0">
                <p className="text-sm font-extrabold uppercase tracking-wider text-primary">Olá, Beatriz</p>
                <h1 className="mt-1 text-3xl font-black tracking-tight text-foreground sm:text-4xl">Minha Saúde</h1>
                <p className="mt-1 font-semibold text-muted-foreground">Acompanhamento simples e organizado.</p>
              </div>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="rounded-xl bg-muted px-4 py-3">
                <p className="text-sm font-bold text-muted-foreground">Horário atual</p>
                <p className="text-xl font-black text-foreground">{currentTime}</p>
              </div>
              <Button type="button" variant={isLargeFont ? 'default' : 'outline'} aria-pressed={isLargeFont} onClick={() => setIsLargeFont((current) => !current)}>
                <Accessibility className="h-5 w-5" aria-hidden="true" />
                {isLargeFont ? 'Letra grande ativada' : 'Aumentar letras'}
              </Button>
            </div>
          </div>
        </header>

        <Tabs value={view} onValueChange={(value) => { setView(value as View); setNotice(null) }} className="mt-5">
          <TabsList aria-label="Navegação principal">
            <TabsTrigger value="dashboard"><LayoutDashboard className="h-5 w-5 shrink-0" aria-hidden="true" /><span className="large-nav-label">Dashboard</span></TabsTrigger>
            <TabsTrigger value="register"><ListPlus className="h-5 w-5 shrink-0" aria-hidden="true" /><span className="large-nav-label">Registrar</span></TabsTrigger>
            <TabsTrigger value="history"><NotebookTabs className="h-5 w-5 shrink-0" aria-hidden="true" /><span className="large-nav-label">Histórico</span></TabsTrigger>
          </TabsList>

          {notice && (
            <div role={notice.type === 'error' ? 'alert' : 'status'} className={cn('mt-5 rounded-xl border-2 px-5 py-4 font-extrabold', notice.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-rose-200 bg-rose-50 text-rose-900')}>
              {notice.text}
            </div>
          )}

          <TabsContent value="dashboard"><DashboardView summary={summary} isLoading={isDashboardLoading} onRefresh={() => void refreshDashboard(true)} /></TabsContent>
          <TabsContent value="register"><RegistrationView onOpenForm={openForm} /></TabsContent>
          <TabsContent value="history"><RecordsView summary={summary} updatingExamRow={updatingExamRow} onExamStatusChange={(row, status) => void handleExamStatusChange(row, status)} /></TabsContent>
        </Tabs>
      </div>

      <Dialog open={activeConfig !== null} onOpenChange={(open) => { if (!open) closeForm() }}>
        <DialogContent className={cn(isLargeFont && 'font-large')}>
          {activeConfig && (
            <>
              <DialogHeader>
                <DialogTitle>{activeConfig.title}</DialogTitle>
                <DialogDescription>{activeConfig.description}</DialogDescription>
              </DialogHeader>
              {notice?.type === 'error' && (
                <div role="alert" className="mt-5 rounded-xl border-2 border-rose-200 bg-rose-50 px-4 py-3 font-extrabold text-rose-900">
                  {notice.text}
                </div>
              )}
              <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
                {renderFormFields()}
                <div className="flex flex-col-reverse gap-3 border-t border-border pt-5 sm:flex-row sm:justify-end">
                  <Button type="button" variant="secondary" onClick={closeForm} disabled={isSubmitting}>Cancelar</Button>
                  <Button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Salvando...' : 'Salvar informação'}</Button>
                </div>
              </form>
            </>
          )}
        </DialogContent>
      </Dialog>
    </main>
  )
}
