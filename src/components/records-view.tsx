import { useState, type ReactNode } from 'react'
import { CalendarDays, ClipboardList, FileText, HeartPulse, Pill, Scale } from 'lucide-react'
import type { DashboardSummary, ExamStatus } from '@/services/healthApi'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

type RecordsViewProps = {
  summary: DashboardSummary
  updatingExamRow: number | null
  onExamStatusChange: (row: number, status: ExamStatus) => void
}

type Category = 'exams' | 'consultations' | 'medications' | 'weights' | 'symptoms'

const categories = [
  { key: 'exams' as const, label: 'Exames', icon: ClipboardList },
  { key: 'consultations' as const, label: 'Consultas', icon: CalendarDays },
  { key: 'medications' as const, label: 'Medicamentos', icon: Pill },
  { key: 'weights' as const, label: 'Peso', icon: Scale },
  { key: 'symptoms' as const, label: 'Sintomas', icon: HeartPulse },
]

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-sm font-extrabold text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 break-words font-semibold leading-relaxed text-foreground">{children || 'Não informado'}</dd>
    </div>
  )
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-muted/45 px-5 py-10 text-center">
      <FileText className="mx-auto h-9 w-9 text-primary" aria-hidden="true" />
      <p className="mt-3 text-lg font-extrabold text-foreground">Nenhum registro de {label}</p>
      <p className="mt-1 font-medium text-muted-foreground">Quando uma informação for salva, ela aparecerá aqui.</p>
    </div>
  )
}

export function RecordsView({ summary, updatingExamRow, onExamStatusChange }: RecordsViewProps) {
  const [category, setCategory] = useState<Category>('exams')
  const counts: Record<Category, number> = {
    exams: summary.records.exams.length,
    consultations: summary.records.consultations.length,
    medications: summary.records.medications.length,
    weights: summary.records.weights.length,
    symptoms: summary.records.symptoms.length,
  }

  return (
    <section aria-labelledby="records-title">
      <div className="max-w-3xl">
        <div className="flex items-center gap-2 text-primary">
          <FileText className="h-6 w-6" aria-hidden="true" />
          <span className="text-sm font-extrabold uppercase tracking-wider">Histórico completo</span>
        </div>
        <h2 id="records-title" className="mt-2 text-3xl font-black tracking-tight text-foreground">Seus registros de saúde</h2>
        <p className="mt-2 text-base font-medium text-muted-foreground">
          Escolha uma categoria para consultar os detalhes sem excesso de informação na tela.
        </p>
      </div>

      <div className="history-filter mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5" role="group" aria-label="Categorias do histórico">
        {categories.map(({ key, label, icon: Icon }) => {
          const active = category === key
          return (
            <button
              key={key}
              type="button"
              aria-pressed={active}
              onClick={() => setCategory(key)}
              className={cn(
                'flex min-h-16 items-center justify-center gap-2 rounded-xl border-2 px-3 py-3 font-extrabold transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20',
                active
                  ? 'border-primary bg-primary text-white shadow-sm'
                  : 'border-border bg-card text-muted-foreground hover:border-primary/35 hover:text-primary',
              )}
            >
              <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
              <span>{label}</span>
              <span className={cn('rounded-full px-2 py-0.5 text-xs', active ? 'bg-white/20 text-white' : 'bg-muted text-foreground')}>{counts[key]}</span>
            </button>
          )
        })}
      </div>

      <div className="mt-5">
        {category === 'exams' && (
          summary.records.exams.length > 0 ? (
            <div className="large-font-details grid gap-4 lg:grid-cols-2">
              {summary.records.exams.map((exam) => (
                <Card key={exam.row}>
                  <CardHeader className="flex flex-row items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <CardTitle className="break-words">{exam.examName}</CardTitle>
                      <CardDescription>{exam.date || 'Data não informada'}</CardDescription>
                    </div>
                    <Badge variant={exam.status === 'Pendente' ? 'warning' : exam.status === 'Avaliado' ? 'success' : 'default'}>
                      {exam.status}
                    </Badge>
                  </CardHeader>
                  <CardContent>
                    <dl className="grid gap-3 sm:grid-cols-2">
                      <Detail label="Resultado">{exam.resultSummary || 'Ainda não informado'}</Detail>
                      <Detail label="Observações">{exam.notes || 'Nenhuma observação'}</Detail>
                    </dl>
                    <label className="mt-5 block font-extrabold text-foreground" htmlFor={`exam-status-${exam.row}`}>
                      Mudar situação do exame
                      <select
                        id={`exam-status-${exam.row}`}
                        value={exam.status}
                        disabled={updatingExamRow === exam.row}
                        onChange={(event) => onExamStatusChange(exam.row, event.target.value as ExamStatus)}
                        className="mt-2 min-h-12 w-full rounded-xl border-2 border-input bg-white px-4 py-3 text-base font-extrabold text-foreground outline-none focus:border-primary focus:ring-4 focus:ring-primary/15 disabled:opacity-60"
                      >
                        <option value="Pendente">Pendente</option>
                        <option value="Realizado">Realizado</option>
                        <option value="Avaliado">Avaliado</option>
                      </select>
                    </label>
                    {updatingExamRow === exam.row && <p className="mt-2 font-bold text-primary" role="status">Salvando alteração...</p>}
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : <EmptyState label="exames" />
        )}

        {category === 'consultations' && (
          summary.records.consultations.length > 0 ? (
            <div className="large-font-details grid gap-4 lg:grid-cols-2">
              {summary.records.consultations.map((item) => (
                <Card key={item.row}>
                  <CardHeader>
                    <CardTitle>{item.doctor}</CardTitle>
                    <CardDescription>{item.date} · {item.specialty}</CardDescription>
                  </CardHeader>
                  <CardContent><dl className="grid gap-3 sm:grid-cols-2"><Detail label="Local">{item.location}</Detail><Detail label="Observações">{item.notes || 'Nenhuma'}</Detail></dl></CardContent>
                </Card>
              ))}
            </div>
          ) : <EmptyState label="consultas" />
        )}

        {category === 'medications' && (
          summary.records.medications.length > 0 ? (
            <div className="large-font-details grid gap-4 lg:grid-cols-2">
              {summary.records.medications.map((item) => (
                <Card key={item.row}>
                  <CardHeader><CardTitle>{item.name}</CardTitle><CardDescription>{item.dosage} · {item.schedule}</CardDescription></CardHeader>
                  <CardContent><dl className="grid gap-3 sm:grid-cols-2"><Detail label="Período">{item.startDate}{item.endDate ? ` até ${item.endDate}` : ' em diante'}</Detail><Detail label="Observações">{item.notes || 'Nenhuma'}</Detail></dl></CardContent>
                </Card>
              ))}
            </div>
          ) : <EmptyState label="medicamentos" />
        )}

        {category === 'weights' && (
          summary.records.weights.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {summary.records.weights.map((item, index) => (
                <Card key={item.row} className={index === 0 ? 'border-primary/30 bg-primary/[0.035]' : ''}>
                  <CardContent className="pt-5 sm:pt-6">
                    <div className="flex items-start justify-between gap-3">
                      <div><p className="text-2xl font-black text-foreground">{item.weight}</p><p className="mt-1 font-bold text-muted-foreground">{item.date}</p></div>
                      {index === 0 && <Badge>Mais recente</Badge>}
                    </div>
                    <p className="mt-4 border-t border-border pt-3 font-semibold text-muted-foreground">{item.notes || 'Sem observações'}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : <EmptyState label="peso" />
        )}

        {category === 'symptoms' && (
          summary.records.symptoms.length > 0 ? (
            <div className="large-font-details grid gap-4 lg:grid-cols-2">
              {summary.records.symptoms.map((item) => (
                <Card key={item.row}>
                  <CardHeader className="flex flex-row items-start justify-between gap-3"><div><CardTitle>{item.description}</CardTitle><CardDescription>{item.date}</CardDescription></div><Badge variant={item.intensity === 'Forte' ? 'warning' : 'neutral'}>{item.intensity}</Badge></CardHeader>
                  <CardContent><Detail label="Observações">{item.notes || 'Nenhuma'}</Detail></CardContent>
                </Card>
              ))}
            </div>
          ) : <EmptyState label="sintomas" />
        )}
      </div>
    </section>
  )
}
