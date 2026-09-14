import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Bar, CartesianGrid, ComposedChart, Line, Tooltip, XAxis, YAxis } from 'recharts';
import { db, getSettings } from '../db/db';
import {
  estimateMaintenance,
  fmtKcal,
  weeklyIntake,
  type WeekIntake,
} from '../lib/nutrition';
import { fmtKg } from '../lib/calc';
import { formatDateShort, recentWeeks, todayLocalDate } from '../lib/dates';
import { AXIS_PROPS, CHART, ChartFrame, TooltipBox } from './charts';
import { Card, EmptyState, SectionTitle, Stat, cx } from './ui';

const WEEKS = 10;
const SPAN_DAYS = 28;

export function FuelProgress() {
  const today = todayLocalDate();

  const logs = useLiveQuery(() => db.foodLogs.toArray(), [], undefined);
  const metrics = useLiveQuery(() => db.bodyMetrics.toArray(), [], undefined);
  const settings = useLiveQuery(() => getSettings(), [], undefined);

  const weeks = useMemo(
    () => (logs && metrics ? weeklyIntake(logs, metrics, recentWeeks(WEEKS, today)) : []),
    [logs, metrics, today],
  );

  const estimate = useMemo(
    () => (logs && metrics ? estimateMaintenance(logs, metrics, today, SPAN_DAYS) : null),
    [logs, metrics, today],
  );

  if (!logs || !metrics || !settings || !estimate) return null;

  if (logs.length === 0) {
    return (
      <EmptyState
        title="Todavía no registraste comida"
        body="Con tres o cuatro semanas de comidas y pesajes, esto te dice tu mantenimiento real en vez de una fórmula."
      />
    );
  }

  const withData = weeks.filter((w) => w.loggedDays > 0);
  const target = settings.kcalTarget ?? 0;

  return (
    <>
      <SectionTitle>Tu mantenimiento real</SectionTitle>
      <MaintenanceCard estimate={estimate} target={target} />

      <SectionTitle
        action={<span className="text-[11px] text-faint">últimas {WEEKS} semanas</span>}
      >
        Comida y peso
      </SectionTitle>
      <ChartFrame
        title="Promedio diario por semana"
        hint="Barras: kcal por día registrado. Línea: peso promedio de esa semana."
        empty={withData.length < 2}
        height={210}
      >
        <ComposedChart data={weeks} margin={{ top: 4, right: -8, bottom: 0, left: -14 }}>
          <CartesianGrid stroke={CHART.grid} vertical={false} />
          <XAxis
            dataKey="weekStartDate"
            {...AXIS_PROPS}
            tickFormatter={(v: string) => formatDateShort(v)}
            interval="preserveStartEnd"
          />
          <YAxis yAxisId="kcal" {...AXIS_PROPS} width={44} />
          <YAxis
            yAxisId="kg"
            orientation="right"
            {...AXIS_PROPS}
            width={40}
            domain={['dataMin - 1', 'dataMax + 1']}
          />
          <Tooltip
            cursor={{ fill: '#ffffff10' }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const w = payload[0].payload as WeekIntake;
              const rows = [
                {
                  key: 'kcal',
                  color: CHART.fuel,
                  name: 'Por día',
                  value: w.loggedDays > 0 ? `${fmtKcal(w.avgKcal)} kcal` : 'sin registros',
                },
                {
                  key: 'days',
                  name: 'Días cargados',
                  value: `${w.loggedDays} de 7`,
                },
              ];
              if (w.avgWeightKg != null) {
                rows.push({
                  key: 'kg',
                  color: CHART.stride,
                  name: 'Peso',
                  value: `${fmtKg(w.avgWeightKg)} kg`,
                });
              }
              return (
                <TooltipBox label={`Semana del ${formatDateShort(w.weekStartDate)}`} rows={rows} />
              );
            }}
          />
          <Bar yAxisId="kcal" dataKey="avgKcal" fill={CHART.fuel} radius={[4, 4, 0, 0]} />
          <Line
            yAxisId="kg"
            type="monotone"
            dataKey="avgWeightKg"
            stroke={CHART.stride}
            strokeWidth={2}
            dot={{ r: 2.5, fill: CHART.stride }}
            connectNulls
          />
        </ComposedChart>
      </ChartFrame>
    </>
  );
}

function MaintenanceCard({
  estimate,
  target,
}: {
  estimate: ReturnType<typeof estimateMaintenance>;
  target: number;
}) {
  if (estimate.kcal === null) {
    return (
      <Card className="p-4">
        <p className="text-sm font-medium text-muted">Todavía no alcanza para decirlo</p>
        <p className="mt-1 text-[11px] leading-snug text-faint">{estimate.blocker}</p>
        <p className="mt-3 text-[11px] leading-snug text-faint">
          Se calcula al revés: lo que comiste más lo que el peso dice que te faltó. Para que salga
          un número que valga, hacen falta unas tres semanas de comidas registradas y pesajes
          seguidos. Le gana a cualquier fórmula, porque está medido sobre vos.
        </p>
      </Card>
    );
  }

  const losing = estimate.weightChangeKgPerWeek < 0;
  const deficit = estimate.kcal - estimate.avgIntakeKcal;

  return (
    <>
      <Card className="p-4">
        <p className="text-[10px] font-semibold tracking-widest text-faint uppercase">
          Mantenimiento estimado
        </p>
        <p className="tabular mt-1 text-4xl leading-none font-semibold text-fuel">
          {fmtKcal(estimate.kcal)}
          <span className="ml-1 text-sm font-medium text-muted">kcal/día</span>
        </p>
        <p className="mt-2 text-[11px] leading-snug text-faint">
          Comiste {fmtKcal(estimate.avgIntakeKcal)} kcal por día y{' '}
          {losing ? 'bajaste' : 'subiste'}{' '}
          <span className="text-muted">
            {fmtKg(Math.abs(estimate.weightChangeKgPerWeek))} kg por semana
          </span>
          . Eso solo cierra si tu mantenimiento está cerca de este número.
        </p>
      </Card>

      <div className="mt-2 grid grid-cols-3 gap-2">
        <Stat
          label="Déficit"
          value={fmtKcal(Math.abs(deficit))}
          unit="kcal"
          tone={deficit > 0 ? 'fuel' : 'gold'}
        />
        <Stat
          label="Por semana"
          value={`${losing ? '−' : '+'}${fmtKg(Math.abs(estimate.weightChangeKgPerWeek))}`}
          unit="kg"
        />
        <Stat label="Pesajes" value={estimate.weighIns} />
      </div>

      {target > 0 ? (
        <p
          className={cx(
            'mt-2 rounded-xl px-3 py-2.5 text-[11px] leading-snug',
            Math.abs(target - (estimate.kcal - 500)) > 300
              ? 'bg-gold/10 text-gold'
              : 'bg-raised text-faint',
          )}
        >
          {Math.abs(target - (estimate.kcal - 500)) > 300
            ? `Para bajar ~0,5 kg por semana tu objetivo debería rondar las ${fmtKcal(
                estimate.kcal - 500,
              )} kcal, y está en ${fmtKcal(target)}. Movelo si querés que el ritmo coincida.`
            : `Tu objetivo de ${fmtKcal(target)} kcal está donde corresponde para el ritmo que venís sosteniendo.`}
        </p>
      ) : null}

      <p className="mt-2 text-[11px] leading-snug text-faint">
        Sobre {estimate.loggedDays} de {estimate.spanDays} días registrados. El promedio toma solo
        los días con comida cargada: un día en blanco es un día sin registrar, no un día sin comer.
      </p>
    </>
  );
}
