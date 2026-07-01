import {
  CalendarDays,
  ClipboardList,
  HeartPulse,
  Pill,
  RefreshCw,
  Scale,
} from 'lucide-react'
import type { DashboardSummary } from '@/services/healthApi'
import { WeightTrend } from '@/components/weight-trend'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

type DashboardViewProps = {
  summary: DashboardSummary
  isLoading: boolean
  onRefresh: () => void
}

export function DashboardView({ summary, isLoading, onRefresh }: DashboardViewProps) {
  const metrics = [
    {
      label: 'Próxima consulta',
      value: summary.nextConsultation,
      icon: CalendarDays,
      helper: 'Seu próximo compromisso de saúde',
    },
    {
      label: 'Remédios em uso',
      value: String(summary.activeMedications),
      icon: Pill,
      helper: summary.activeMedications === 1 ? 'medicamento ativo hoje' : 'medicamentos ativos hoje',
    },
    {
      label: 'Último peso',
      value: summary.lastWeight,
      icon: Scale,
      helper: 'Registro mais recente',
    },
    {
      label: 'Exames pendentes',
      value: String(summary.pendingExams),
      icon: ClipboardList,
      helper: summary.pendingExams === 1 ? 'exame aguardando avaliação' : 'exames aguardando avaliação',
    },
  ]

  return (
    <section aria-labelledby="dashboard-title">
      <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-primary">
            <HeartPulse className="h-6 w-6" aria-hidden="true" />
            <span className="text-sm font-extrabold uppercase tracking-wider">Visão geral</span>
          </div>
          <h2 id="dashboard-title" className="mt-2 text-3xl font-black tracking-tight text-foreground">
            Como está sua saúde hoje
          </h2>
          <p className="mt-2 max-w-2xl text-base font-medium text-muted-foreground">
            As informações mais importantes reunidas em um só lugar.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={onRefresh} disabled={isLoading}>
          <RefreshCw className={`h-5 w-5 ${isLoading ? 'animate-spin' : ''}`} aria-hidden="true" />
          {isLoading ? 'Atualizando...' : 'Atualizar dados'}
        </Button>
      </div>

      <div className="large-font-summary grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map(({ label, value, icon: Icon, helper }, index) => (
          <Card key={label} className={index === 0 ? 'border-primary/25 bg-primary/[0.035]' : ''}>
            <CardContent className="pt-5 sm:pt-6">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-extrabold text-muted-foreground">{label}</p>
                  <p className={`${index === 0 ? 'text-xl leading-snug' : 'text-3xl'} mt-3 break-words font-black text-foreground`}>
                    {isLoading ? '—' : value}
                  </p>
                  <p className="mt-2 text-sm font-semibold text-muted-foreground">{helper}</p>
                </div>
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <Icon className="h-6 w-6" aria-hidden="true" />
                </span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mt-5">
        <WeightTrend records={summary.records.weights} />
      </div>

      <div className="large-font-details mt-5 grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <ClipboardList className="h-5 w-5 text-amber-600" aria-hidden="true" />
                Exames que precisam de atenção
              </CardTitle>
              <CardDescription>Itens que ainda estão marcados como pendentes.</CardDescription>
            </div>
            <Badge variant={summary.pendingExams > 0 ? 'warning' : 'success'}>{summary.pendingExams}</Badge>
          </CardHeader>
          <CardContent>
            {summary.pendingExamsList.length > 0 ? (
              <ul className="space-y-3">
                {summary.pendingExamsList.slice(0, 4).map((item, index) => (
                  <li key={`${item}-${index}`} className="flex gap-3 rounded-xl bg-amber-50/70 px-4 py-3 font-semibold text-amber-950">
                    <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-amber-500" aria-hidden="true" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="rounded-xl bg-emerald-50 px-4 py-5 text-center font-bold text-emerald-800">
                Nenhum exame pendente no momento.
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Pill className="h-5 w-5 text-primary" aria-hidden="true" />
                Medicamentos em uso hoje
              </CardTitle>
              <CardDescription>Nome, dose e horário dos medicamentos ativos.</CardDescription>
            </div>
            <Badge>{summary.activeMedications}</Badge>
          </CardHeader>
          <CardContent>
            {summary.activeMedicationsList.length > 0 ? (
              <ul className="space-y-3">
                {summary.activeMedicationsList.map((item, index) => (
                  <li key={`${item}-${index}`} className="flex gap-3 rounded-xl bg-primary/5 px-4 py-3 font-semibold text-foreground">
                    <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="rounded-xl bg-muted px-4 py-5 text-center font-bold text-muted-foreground">
                Nenhum medicamento ativo hoje.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-primary" aria-hidden="true" />
            Próximas consultas
          </CardTitle>
          <CardDescription>Sua agenda de saúde em ordem de data.</CardDescription>
        </CardHeader>
        <CardContent>
          {summary.upcomingConsultations.length > 0 ? (
            <ol className="grid gap-3 md:grid-cols-3">
              {summary.upcomingConsultations.map((item, index) => (
                <li key={`${item}-${index}`} className="rounded-xl border border-border bg-muted/45 p-4">
                  <Badge variant="neutral">{index === 0 ? 'Próxima' : `${index + 1}ª consulta`}</Badge>
                  <p className="mt-3 font-extrabold leading-relaxed text-foreground">{item}</p>
                </li>
              ))}
            </ol>
          ) : (
            <div className="rounded-xl bg-muted px-4 py-5 text-center font-bold text-muted-foreground">
              Nenhuma consulta futura cadastrada.
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  )
}
