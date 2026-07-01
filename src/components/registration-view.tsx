import type { LucideIcon } from 'lucide-react'
import { CalendarPlus, ClipboardPlus, FilePlus2, HeartPulse, Pill, Scale } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'

export type FormKey = 'consultation' | 'exam' | 'medication' | 'weight' | 'symptom'

type RegistrationViewProps = {
  onOpenForm: (form: FormKey) => void
}

type Action = {
  key: FormKey
  title: string
  description: string
  icon: LucideIcon
  tone: string
}

const actions: Action[] = [
  { key: 'consultation', title: 'Nova consulta', description: 'Data, médico, especialidade e local.', icon: CalendarPlus, tone: 'bg-sky-50 text-sky-700' },
  { key: 'exam', title: 'Novo exame', description: 'Nome, resultado e situação do exame.', icon: FilePlus2, tone: 'bg-amber-50 text-amber-700' },
  { key: 'medication', title: 'Novo medicamento', description: 'Dose, horário e período de uso.', icon: Pill, tone: 'bg-violet-50 text-violet-700' },
  { key: 'weight', title: 'Registrar peso', description: 'Inclua o peso e acompanhe a evolução.', icon: Scale, tone: 'bg-emerald-50 text-emerald-700' },
  { key: 'symptom', title: 'Registrar sintoma', description: 'Descreva o sintoma e sua intensidade.', icon: HeartPulse, tone: 'bg-rose-50 text-rose-700' },
]

export function RegistrationView({ onOpenForm }: RegistrationViewProps) {
  return (
    <section aria-labelledby="registration-title">
      <div className="max-w-3xl">
        <div className="flex items-center gap-2 text-primary">
          <ClipboardPlus className="h-6 w-6" aria-hidden="true" />
          <span className="text-sm font-extrabold uppercase tracking-wider">Adicionar informação</span>
        </div>
        <h2 id="registration-title" className="mt-2 text-3xl font-black tracking-tight text-foreground">
          O que você deseja registrar?
        </h2>
        <p className="mt-2 text-base font-medium text-muted-foreground">
          Escolha uma opção. O formulário abrirá com apenas os campos necessários.
        </p>
      </div>

      <Card className="mt-5 border-primary/20 bg-primary/[0.035]">
        <CardContent className="pt-5 sm:pt-6">
          <ol className="grid gap-3 text-base font-semibold text-foreground md:grid-cols-3">
            {['Escolha uma opção abaixo', 'Preencha os campos marcados com *', 'Toque em Salvar informação'].map((step, index) => (
              <li key={step} className="flex items-center gap-3 rounded-xl bg-white px-4 py-3 shadow-sm">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-black text-white">{index + 1}</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {actions.map(({ key, title, description, icon: Icon, tone }) => (
          <button
            key={key}
            type="button"
            onClick={() => onOpenForm(key)}
            className="group min-h-44 rounded-2xl border-2 border-border bg-card p-5 text-left shadow-card transition hover:-translate-y-0.5 hover:border-primary/45 hover:shadow-soft focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20"
          >
            <span className={`flex h-12 w-12 items-center justify-center rounded-2xl ${tone}`}>
              <Icon className="h-6 w-6" aria-hidden="true" />
            </span>
            <span className="mt-5 block text-xl font-black text-foreground">{title}</span>
            <span className="mt-2 block text-base font-semibold leading-relaxed text-muted-foreground">{description}</span>
            <span className="mt-4 inline-flex items-center font-extrabold text-primary group-hover:underline">Abrir formulário</span>
          </button>
        ))}
      </div>
    </section>
  )
}
