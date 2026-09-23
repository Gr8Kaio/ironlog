import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Bar, CartesianGrid, ComposedChart, Line, Tooltip, XAxis, YAxis } from 'recharts';
import { db, getSettings } from '../db/db';
import { getAssumptionInputs } from '../db/queries';
import {
  assumptionOf,
  estimateMaintenance,
  fmtKcal,
  weeklyIntake,
  type WeekIntake,
} from '../lib/nutrition';
import { fmtKg } from '../lib/calc';
import { formatDateShort, recentWeeks, todayLocalDate } from '../lib/dates';
import { AXIS_PROPS, CHART, ChartFrame, Legend, TooltipBox } from './charts';
import { Card, EmptyState, SectionTitle, Stat, cx } from './ui';

const WEEKS = 10;
const SPAN_DAYS = 28;

export function FuelProgress() {
  const today = todayLocalDate();

  const logs = useLiveQuery(() => db.foodLogs.toArray(), [], undefined);
  const metrics = useLiveQuery(() => db.bodyMetrics.toArray(), [], undefined);
  const settings = useLiveQuery(() => getSettings(), [], undefined);
  const assumptionInputs = useLiveQuery(() => getAssumptionInputs(today), [today], undefined);

  const assumption = useMemo(
    () => (settings ? assumptionOf(settings, settings.kcalTarget ?? 0, assumptionInputs) : null),
    [settings, assumptionInputs],
  );

  const weeks = useMemo(
    () =>
      logs && metrics
        ? weeklyIntake(logs, metrics, recentWeeks(WEEKS, today), today, assumption)
        : [],
    [logs, metrics, today, assumption],
  );

  const estimate = useMemo(
    () =>
      logs && metrics
        ? estimateMaintenance(logs, metrics, today, SPAN_DAYS, assumption)
        : null,
    [logs, metrics, today, assumption],
  );

  if (!logs || !metrics || !settings || !assumptionInputs || !estimate) return null;

  if (logs.length === 0) {
    return (
      <EmptyState
        title="Todavía no registraste comida"
        body="Con tres o cuatro semanas de comidas y pesajes, esto te dice tu mantenimiento real en vez de una fórmula."
      />
    );
  }

  const withData = weeks.filter((w) => w.loggedDays > 0 || w.assumedDays > 0);
  const target = settings.kcalTarget ?? 0;

  // Weeks before anything was recorded are dead space. Ten of them squeezed two
  // real bars into the right-hand fifth of the chart and left the rest blank.
  const firstReal = weeks.findIndex(
    (w) => w.loggedDays > 0 || w.assumedDays > 0 || w.avgWeightKg != null,
  );
  const shown = firstReal < 0 ? weeks : weeks.slice(firstReal);
  const anyAssumed = shown.some((w) => w.assumedDays > 0);

  return (
    <>
      {/* The card leads with the scale when the estimate is blocked, so the
          heading has to cover both readings rather than promise only one. */}
      <SectionTitle>
        {estimate.kcal === null ? 'Peso y mantenimiento' : 'Tu mantenimiento real'}
      </SectionTitle>
      <MaintenanceCard estimate={estimate} target={target} />

      <SectionTitle
        action={
          <span className="text-[11px] text-faint">
            {shown.length === 1 ? 'esta semana' : `últimas ${shown.length} semanas`}
          </span>
        }
      >
        Comida y peso
      </SectionTitle>
      <ChartFrame
        title="Promedio diario por semana"
        empty={withData.length < 2}
        height={210}
        footer={
          <Legend
            items={[
              { key: 'kcal', label: 'kcal por día', color: CHART.fuel },
              ...(anyAssumed
                ? [{ key: 'assumed', label: 'parte asumida', color: CHART.gold }]
                : []),
              { key: 'kg', label: 'peso promedio', color: CHART.stride },
            ]}
          />
        }
      >
        <ComposedChart data={shown} margin={{ top: 6, right: 2, bottom: 0, left: 2 }}>
          <CartesianGrid stroke={CHART.grid} vertical={false} />
          <XAxis
            dataKey="weekStartDate"
            {...AXIS_PROPS}
            tickFormatter={(v: string) => formatDateShort(v)}
            interval="preserveStartEnd"
            // The end labels sit under the first and last bar, so half of each
            // hangs past the plot. Without the padding they are clipped by the
            // axis columns on either side.
            padding={{ left: 6, right: 6 }}
          />
          {/*
            Explicit widths, and no negative margins. The margins used to pull
            both axes under the plot to save a few pixels, which cropped the
            weight labels against the card edge.
          */}
          <YAxis
            yAxisId="kcal"
            {...AXIS_PROPS}
            width={36}
            tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 100) / 10}k` : String(v))}
          />
          <YAxis
            yAxisId="kg"
            orientation="right"
            {...AXIS_PROPS}
            width={34}
            domain={['dataMin - 1', 'dataMax + 1']}
            // One decimal: the scale reads to 100 g, and two decimals was three
            // extra characters of noise pressed against the edge.
            tickFormatter={(v: number) => v.toFixed(1)}
          />
          <Tooltip
            cursor={{ fill: '#ffffff10' }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const w = payload[0].payload as WeekIntake;
              const counted = w.loggedDays + w.assumedDays;
              const rows = [
                {
                  key: 'kcal',
                  color: CHART.fuel,
                  name: 'Por día',
                  value: counted > 0 ? `${fmtKcal(w.avgKcal)} kcal` : 'sin registros',
                },
                {
                  key: 'days',
                  name: 'Días cargados',
                  value: `${w.loggedDays} de 7`,
                },
              ];
              if (w.assumedDays > 0) {
                rows.push({
                  key: 'assumed',
                  color: CHART.gold,
                  name: 'Días asumidos',
                  value: String(w.assumedDays),
                });
              }
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
          {/*
            Stacked in two parts so the bar says how much of its own height was
            written down. A single bar at the assumed height would have looked
            exactly like a week you logged in full.
          */}
          <Bar
            yAxisId="kcal"
            dataKey="avgLoggedKcal"
            stackId="intake"
            fill={CHART.fuel}
            radius={[0, 0, 0, 0]}
          />
          <Bar
            yAxisId="kcal"
            dataKey={(w: WeekIntake) => Math.max(0, w.avgKcal - w.avgLoggedKcal)}
            stackId="intake"
            name="asumido"
            fill={CHART.gold}
            fillOpacity={0.45}
            radius={[4, 4, 0, 0]}
          />
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
    // The trend needs only the scale, so it survives every blocker above. It
    // used to be withheld along with the estimate, which meant a month of
    // weigh-ins bought you nothing but an excuse.
    const trend = estimate.weightChangeKgPerWeek;
    const hasTrend = estimate.weighIns >= 2;
    const flat = Math.abs(trend) < 0.15;

    return (
      <Card className="p-4">
        {hasTrend ? (
          <>
            <p className="text-[10px] font-semibold tracking-widest text-faint uppercase">
              Lo que dice la balanza
            </p>
            <p
              className={cx(
                'tabular mt-1 text-3xl leading-none font-semibold',
                flat ? 'text-gold' : trend < 0 ? 'text-good' : 'text-stride',
              )}
            >
              {flat ? '≈ 0' : `${trend < 0 ? '−' : '+'}${fmtKg(Math.abs(trend))}`}
              <span className="ml-1 text-sm font-medium text-muted">kg por semana</span>
            </p>
            <p className="mt-2 text-[11px] leading-snug text-faint">
              {flat
                ? `Sobre ${estimate.weighIns} pesajes, tu peso está plano. Si estás buscando bajar, estás comiendo en tu mantenimiento: el ajuste va por la comida, no por más paciencia.`
                : `Sobre ${estimate.weighIns} pesajes. Es un ajuste sobre todos ellos, no el primero contra el último, así que el ruido de agua y glucógeno ya está lavado.`}
            </p>
            <div className="my-3 h-px bg-line" />
          </>
        ) : null}

        <p className="text-sm font-medium text-muted">
          Para el mantenimiento todavía no alcanza
        </p>
        <p className="mt-1 text-[11px] leading-snug text-faint">{estimate.blocker}</p>
        <p className="mt-3 text-[11px] leading-snug text-faint">
          Se calcula al revés: lo que comiste más lo que el peso dice que te faltó. Le gana a
          cualquier fórmula, porque está medido sobre vos — pero por eso mismo necesita las dos
          mitades, y la del peso ya la tenés.
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
        Sobre {estimate.spanDays} días: {estimate.loggedDays} anotados
        {estimate.assumedDays > 0 ? ` y ${estimate.assumedDays} asumidos` : ''}. Un día en blanco no
        es un día sin comer, así que se cuenta con tu cifra asumida en vez de descartarse — y si son
        demasiados, este número no sale.
      </p>
    </>
  );
}
