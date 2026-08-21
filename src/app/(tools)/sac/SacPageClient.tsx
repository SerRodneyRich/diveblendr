'use client'

import { useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import {
  MessageBar,
  Button,
  MathTrigger,
  Card,
  CardHeader,
  Modal,
  NumberField,
  StatCard,
  Table,
  type Severity,
} from '@/components/ui'
import { CylinderField, CUSTOM_CYLINDER } from '@/components/consumption/CylinderField'
import { useUnitConversion } from '@/hooks/useUnitConversion'
import { calculateSAC } from '@/lib/consumption'
import { sacDerivation } from '@/lib/recommendations/consumptionMath'
import type { TankSpecification } from '@/data/tankSpecifications'

/** One logged dive. Stored canonically (bar, metres, litres) like the library. */
interface LoggedDive {
  id: number
  startPressureBar: number
  endPressureBar: number
  avgDepthM: number
  minutes: number
  cylinderLabel: string
  sacBarPerMin: number
  rmvLitersPerMin: number
}

const EM_DASH = '—'

/** KaTeX loads only when a diver asks for the working. */
const MathSteps = dynamic(() => import('@/components/mix/MathSteps'), {
  ssr: false,
  loading: () => <p className="text-sm text-text-muted">Rendering the math…</p>,
})

export default function SacPageClient() {
  const {
    convertPressure,
    convertDepth,
    convertVolume,
    parsePressureInput,
    parseDepthInput,
    parseVolumeInput,
    getUnitLabels,
    preferences,
  } = useUnitConversion()

  const units = getUnitLabels()
  const metric = preferences.system === 'metric'

  /**
   * Every input is held in the canonical unit the library takes — bar, metres,
   * litres — and converted only for display. Holding display units in state
   * instead means a unit switch silently reinterprets 200 bar as 200 psi, and
   * makes the initial value depend on whether `localStorage` has loaded yet.
   */
  const [cylinderId, setCylinderId] = useState('al80-metric')
  const [cylinderName, setCylinderName] = useState('AL80')
  const [waterVolumeL, setWaterVolumeL] = useState(11.1)
  const [startPressureBar, setStartPressureBar] = useState(200)
  const [endPressureBar, setEndPressureBar] = useState(50)
  const [avgDepthM, setAvgDepthM] = useState(18)
  const [minutes, setMinutes] = useState(45)

  const [log, setLog] = useState<LoggedDive[]>([])
  const [showMath, setShowMath] = useState(false)

  const pressurePrecision = metric ? 0 : 0
  const pressureStep = metric ? 5 : 50
  const pressureMax = metric ? 350 : 5100
  const depthMax = metric ? 200 : 660
  const volumePrecision = metric ? 1 : 2

  const startDisplay = convertPressure(startPressureBar, pressurePrecision)
  const endDisplay = convertPressure(endPressureBar, pressurePrecision)
  const depthInputDisplay = convertDepth(avgDepthM, 0)
  const waterVolumeDisplay = convertVolume(waterVolumeL, volumePrecision)

  const handleCylinder = (id: string, tank?: TankSpecification) => {
    setCylinderId(id)
    if (tank) {
      setWaterVolumeL(tank.waterVolumeL)
      setCylinderName(tank.name)
    } else {
      setCylinderName('Custom')
    }
  }

  const result = useMemo(() => {
    try {
      return calculateSAC({
        startPressureBar,
        endPressureBar,
        averageDepthMeters: avgDepthM,
        durationMinutes: minutes,
        tankVolumeL: waterVolumeL,
      })
    } catch {
      // The numbers on screen do not yet describe a dive — an empty state,
      // not an error worth shouting about.
      return null
    }
  }, [startPressureBar, endPressureBar, avgDepthM, minutes, waterVolumeL])

  const derivation = useMemo(
    () =>
      result
        ? sacDerivation({
            startPressureBar,
            endPressureBar,
            averageDepthMeters: avgDepthM,
            durationMinutes: minutes,
            tankVolumeL: waterVolumeL,
            tankLabel: cylinderName,
            result,
          })
        : null,
    [result, startPressureBar, endPressureBar, avgDepthM, minutes, waterVolumeL, cylinderName]
  )

  const sacDisplay = result ? convertPressure(result.sacBarPerMin, metric ? 2 : 1) : null
  const rmvDisplay = result ? convertVolume(result.rmvLitersPerMin, volumePrecision) : null
  const gasUsedDisplay = result ? convertVolume(result.gasUsedLiters, metric ? 0 : 1) : null

  const warnings = useMemo(() => {
    const items: { id: string; severity: Severity; title: string; message: string }[] = []
    if (!result) return items

    if (minutes < 20) {
      items.push({
        id: 'short-dive',
        severity: 'warning',
        title: 'Short dive',
        message:
          'Under about 20 minutes the descent and the faff at the start dominate the average, so this rate will not repeat. Measure on a longer dive.',
      })
    }
    if (startPressureBar - endPressureBar < 40) {
      items.push({
        id: 'small-delta',
        severity: 'warning',
        title: 'Small pressure drop',
        message:
          'Under 40 bar consumed. Gauge error is a large fraction of that, so the rate carries a wide margin either side.',
      })
    }
    if (startPressureBar > 232) {
      items.push({
        id: 'hp-fill',
        severity: 'info',
        title: 'High-pressure fill',
        message:
          'Contents are computed as pressure times water volume, which assumes ideal gas. Real air holds about 1% less than that at 232 bar and about 8% less at 300 bar, so gas used here is slightly overstated.',
      })
    }
    if (result.rmvLitersPerMin > 30) {
      items.push({
        id: 'high-rmv',
        severity: 'info',
        title: 'High consumption',
        message:
          'Above 30 L/min is high for a settled dive. Check the depth came from the computer average rather than the maximum — entering maximum depth understates the rate.',
      })
    }
    return items
  }, [result, minutes, startPressureBar, endPressureBar])

  const logDive = () => {
    if (!result) return
    setLog((prev) => [
      {
        id: Date.now(),
        startPressureBar,
        endPressureBar,
        avgDepthM,
        minutes,
        cylinderLabel: cylinderName,
        sacBarPerMin: result.sacBarPerMin,
        rmvLitersPerMin: result.rmvLitersPerMin,
      },
      ...prev,
    ])
  }

  const meanRmv = useMemo(
    () => (log.length ? log.reduce((a, d) => a + d.rmvLitersPerMin, 0) / log.length : null),
    [log]
  )
  const worstRmv = useMemo(
    () => (log.length ? Math.max(...log.map((d) => d.rmvLitersPerMin)) : null),
    [log]
  )

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-h3 font-semibold text-text">SAC and RMV</h2>
        <p className="text-sm text-text-muted">Measure your own gas consumption from a dive you have already done.</p>
      </header>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
        <Card panel="input">
          <CardHeader title="The dive" description="Straight off the computer and the gauge." />
          <div className="space-y-3">
            <CylinderField
              value={cylinderId}
              onChange={handleCylinder}
              hint={
                cylinderId === CUSTOM_CYLINDER
                  ? undefined
                  : `Water volume ${waterVolumeDisplay.formatted} — the internal volume, not the cubic-foot rating.`
              }
            />

            {cylinderId === CUSTOM_CYLINDER && (
              <NumberField
                label="Water volume"
                value={Number(waterVolumeDisplay.value.toFixed(volumePrecision))}
                onChange={(v) => setWaterVolumeL(parseVolumeInput(v))}
                min={metric ? 0.5 : 0.02}
                max={metric ? 60 : 2.2}
                step={metric ? 0.1 : 0.01}
                unit={units.volume}
                hint="Internal water volume of the cylinder."
              />
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <NumberField
                label="Start pressure"
                value={Number(startDisplay.value.toFixed(pressurePrecision))}
                onChange={(v) => setStartPressureBar(parsePressureInput(v))}
                min={0}
                max={pressureMax}
                step={pressureStep}
                unit={units.pressure}
              />
              <NumberField
                label="End pressure"
                value={Number(endDisplay.value.toFixed(pressurePrecision))}
                onChange={(v) => setEndPressureBar(parsePressureInput(v))}
                min={0}
                max={pressureMax}
                step={pressureStep}
                unit={units.pressure}
              />
              <NumberField
                label="Average depth"
                value={Number(depthInputDisplay.value.toFixed(0))}
                onChange={(v) => setAvgDepthM(parseDepthInput(v))}
                min={0}
                max={depthMax}
                step={1}
                unit={units.depth}
                hint="Average, not maximum."
              />
              <NumberField
                label="Dive time"
                value={minutes}
                onChange={setMinutes}
                min={1}
                max={600}
                step={1}
                unit="min"
              />
            </div>
          </div>
        </Card>

        <div className="space-y-4">
          {derivation && <MathTrigger onClick={() => setShowMath(true)} />}

          <div className="grid grid-cols-2 gap-3">
            <StatCard
              label="RMV"
              value={rmvDisplay ? rmvDisplay.value.toFixed(volumePrecision) : EM_DASH}
              unit={`${units.volume}/min`}
              tone="accent"
              hint="Yours. Carries between cylinders."
            />
            <StatCard
              label="SAC"
              value={sacDisplay ? sacDisplay.value.toFixed(metric ? 2 : 1) : EM_DASH}
              unit={`${units.pressure}/min`}
              hint={`On this cylinder only (${cylinderName}).`}
            />
            <StatCard
              label="Gas used"
              value={gasUsedDisplay ? gasUsedDisplay.value.toFixed(metric ? 0 : 1) : EM_DASH}
              unit={units.volume}
              hint="Surface-equivalent volume."
            />
            <StatCard
              label="Pressure at depth"
              value={result ? result.ataAtAverageDepth.toFixed(2) : EM_DASH}
              unit="bar"
              hint={`Ambient at ${depthInputDisplay.formatted}.`}
            />
          </div>

          <Card>
            <CardHeader
              title="Why there are two numbers"
              description="Conflating them is the usual gas-planning error."
            />
            <p className="text-sm text-text-muted">
              <span className="font-medium text-text">RMV</span> is how much gas your lungs move
              per minute at the surface. It is a property of you, so it is the figure worth
              keeping and the one gas planning asks for.{' '}
              <span className="font-medium text-text">SAC</span> is how fast the needle falls on
              one particular cylinder — the same diver on a 15 L shows a lower SAC than on an
              11 L without breathing any differently.
            </p>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader
          title="Dive log"
          description="Several dives of the same kind give an average worth planning on. Held for this session only."
          actions={
            <Button variant="primary" size="sm" onClick={logDive} disabled={!result}>
              Log this dive
            </Button>
          }
        />

        {meanRmv !== null && worstRmv !== null && (
          <div className="mb-4 grid grid-cols-2 gap-3 sm:max-w-md">
            <StatCard
              label="Mean RMV"
              value={convertVolume(meanRmv, volumePrecision).value.toFixed(volumePrecision)}
              unit={`${units.volume}/min`}
              tone="info"
              hint={`Across ${log.length} ${log.length === 1 ? 'dive' : 'dives'}.`}
            />
            <StatCard
              label="Worst RMV"
              value={convertVolume(worstRmv, volumePrecision).value.toFixed(volumePrecision)}
              unit={`${units.volume}/min`}
              hint="Size reserves on this, not the mean."
            />
          </div>
        )}

        <Table
          caption="Logged dives"
          hideCaption
          rows={log}
          rowKey={(d) => String(d.id)}
          emptyMessage="No dives logged yet. Enter a dive above and log it."
          columns={[
            { key: 'cyl', header: 'Cylinder', cell: (d) => d.cylinderLabel },
            {
              key: 'depth',
              header: `Avg depth (${units.depth})`,
              numeric: true,
              cell: (d) => convertDepth(d.avgDepthM, 0).value.toFixed(0),
            },
            { key: 'time', header: 'Time (min)', numeric: true, cell: (d) => d.minutes },
            {
              key: 'used',
              header: `Used (${units.pressure})`,
              numeric: true,
              cell: (d) =>
                convertPressure(d.startPressureBar - d.endPressureBar, 0).value.toFixed(0),
            },
            {
              key: 'rmv',
              header: `RMV (${units.volume}/min)`,
              numeric: true,
              cell: (d) =>
                convertVolume(d.rmvLitersPerMin, volumePrecision).value.toFixed(volumePrecision),
            },
            {
              key: 'sac',
              header: `SAC (${units.pressure}/min)`,
              numeric: true,
              cell: (d) =>
                convertPressure(d.sacBarPerMin, metric ? 2 : 1).value.toFixed(metric ? 2 : 1),
            },
          ]}
        />
      </Card>

      <Modal
        isOpen={showMath}
        onClose={() => setShowMath(false)}
        title={derivation?.title ?? 'How this is derived'}
        description="In bar, litres and metres — the units the formulas are written in. Converting the working would make it uncheckable against a textbook."
        size="xl"
      >
        {derivation ? (
          <MathSteps derivation={derivation} columns />
        ) : (
          <p className="text-sm text-text-muted">
            Enter a dive above — two pressures, an average depth and a runtime — and the
            derivation appears here.
          </p>
        )}
      </Modal>

      <MessageBar
        items={[
          ...warnings,
          {
            id: 'measure-your-rate',
            severity: 'info' as const,
            title: 'Log a dive to measure your rate',
            message: (
              <>
                This is not a number to guess at. Take a dive off your computer — average depth and
        runtime — with the two pressures off the gauge, and it returns the rate you actually
        breathed at. Do that for several dives of the same kind, then carry the average into{' '}
        <Link href="/gas-planning/" className="text-accent underline underline-offset-2">
          gas planning
        </Link>
        .
              </>
            ),
          },
        ]}
      />
    </div>
  )
}
