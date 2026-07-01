import { Activity, Minus, TrendingDown, TrendingUp } from 'lucide-react'
import type { WeightRecord } from '@/services/healthApi'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

type WeightTrendProps = {
  records: WeightRecord[]
}

type WeightPoint = {
  row: number
  date: string
  value: number
}

function parseWeight(record: WeightRecord): WeightPoint | null {
  const value = Number(record.weight.replace(/[^d,.-]/g, '').replace(',', '.'))
  return Number.isFinite(value) ? { row: record.row, date: record.date, value } : null
}

function formatVariation(value: number) {
  const signal = value > 0 ? '+' : ''
  return `${signal}${value.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} kg`
}

export function WeightTrend({ records }: WeightTrendProps) {
  const points = records
    .map(parseWeight)
    .filter((point): point is WeightPoint => point !== null)
    .slice(0, 8)
    .reverse()

  const latest = points[points.length - 1]
  const previous = points[points.length - 2]
  const variation = latest && previous ? latest.value - previous.value : 0
  const values = points.map((point) => point.value)
  const rawMin = values.length ? Math.min(...values) : 0
  const rawMax = values.length ? Math.max(...values) : 1
  const range = Math.max(rawMax - rawMin, 1)
  const min = rawMin - range * 0.2
  const max = rawMax + range * 0.2
  const width = 680
  const height = 230
  const paddingX = 34
  const paddingY = 28
  const chartWidth = width - paddingX * 2
  const chartHeight = height - paddingY * 2

  const coordinates = points.map((point, index) => ({
    ...point,
    x: points.length === 1 ? width / 2 : paddingX + (index / (points.length - 1)) * chartWidth,
    y: paddingY + ((max - point.value) / (max - min)) * chartHeight,
  }))
  const polyline = coordinates.map((point) => `${point.x},${point.y}`).join(' ')
  const TrendIcon = variation > 0 ? TrendingUp : variation < 0 ? TrendingDown : Minus

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-6 w-6 shrink-0 text-primary" aria-hidden="true" />
            Evolução do peso
          </CardTitle>
          <CardDescription>Veja de forma simples como o peso mudou nos últimos registros.</CardDescription>
        </div>
        {latest && (
          <div className="shrink-0 rounded-xl bg-primary/10 px-4 py-3 text-left sm:text-right">
            <p className="text-sm font-bold text-muted-foreground">Peso mais recente</p>
            <p className="text-2xl font-black text-primary">{latest.value.toLocaleString('pt-BR')} kg</p>
          </div>
        )}
      </CardHeader>
      <CardContent>
        {points.length >= 2 ? (
          <>
            <div className="rounded-2xl border border-border bg-gradient-to-b from-primary/5 to-transparent p-2 sm:p-4">
              <svg
                viewBox={`0 0 ${width} ${height}`}
                className="h-auto w-full overflow-visible"
                role="img"
                aria-label={`Gráfico com ${points.length} registros de peso, de ${points[0].value.toLocaleString('pt-BR')} kg até ${latest?.value.toLocaleString('pt-BR')} kg.`}
              >
                {[0.25, 0.5, 0.75].map((position) => (
                  <line
                    key={position}
                    x1={paddingX}
                    x2={width - paddingX}
                    y1={paddingY + chartHeight * position}
                    y2={paddingY + chartHeight * position}
                    stroke="hsl(var(--border))"
                    strokeWidth="2"
                    strokeDasharray="6 8"
                  />
                ))}
                <polyline
                  points={polyline}
                  fill="none"
                  stroke="hsl(var(--primary))"
                  strokeWidth="7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                {coordinates.map((point) => (
                  <g key={point.row}>
                    <circle cx={point.x} cy={point.y} r="10" fill="white" stroke="hsl(var(--primary))" strokeWidth="6" />
                  </g>
                ))}
              </svg>
            </div>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <TrendIcon className="h-5 w-5 text-primary" aria-hidden="true" />
                <span className="font-bold text-foreground">Variação desde o registro anterior:</span>
                <Badge variant="neutral">{formatVariation(variation)}</Badge>
              </div>
              <span className="text-sm font-semibold text-muted-foreground">Últimos {points.length} registros</span>
            </div>
            <ol className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-4" aria-label="Valores recentes de peso">
              {points.slice(-4).reverse().map((point, index) => (
                <li key={point.row} className="rounded-xl border border-border bg-muted/60 px-3 py-3">
                  <span className="block text-sm font-semibold text-muted-foreground">{index === 0 ? 'Mais recente' : point.date}</span>
                  <span className="block text-lg font-extrabold text-foreground">{point.value.toLocaleString('pt-BR')} kg</span>
                </li>
              ))}
            </ol>
          </>
        ) : (
          <div className="rounded-2xl border border-dashed border-border bg-muted/50 px-5 py-8 text-center">
            <Activity className="mx-auto h-9 w-9 text-primary" aria-hidden="true" />
            <p className="mt-3 text-lg font-extrabold text-foreground">O gráfico está quase pronto</p>
            <p className="mt-1 font-medium text-muted-foreground">Registre pelo menos dois pesos para acompanhar a evolução.</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
