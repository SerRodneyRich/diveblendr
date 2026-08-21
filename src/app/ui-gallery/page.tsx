'use client'

/**
 * Visual reference for the primitive library.
 *
 * Not linked from the app's navigation — it exists so a change to a token or a
 * variant can be eyeballed against every primitive at once, rather than being
 * discovered later on some screen nobody thought to check.
 */
import { useState } from 'react'
import { FiPlay, FiDownload } from 'react-icons/fi'
import {
  Banner,
  BannerStack,
  Button,
  Card,
  CardHeader,
  Input,
  Modal,
  NumberField,
  SegmentedControl,
  Select,
  Slider,
  StatCard,
  Switch,
  Table,
  TabPanel,
  Tabs,
  Tooltip,
} from '@/components/ui'

export default function UiGallery() {
  const [modalOpen, setModalOpen] = useState(false)
  const [num, setNum] = useState(42)
  const [ppo2, setPpo2] = useState(1.4)
  const [sw, setSw] = useState(true)
  const [seg, setSeg] = useState<'oc' | 'ccr'>('oc')
  const [tab, setTab] = useState<'a' | 'b'>('a')

  return (
    <main className="mx-auto max-w-5xl space-y-10 p-6 md:p-10">
      <header>
        <h1 className="text-display font-semibold">UI primitives</h1>
        <p className="mt-2 text-text-muted">
          Every primitive in <code className="font-mono text-accent">src/components/ui</code>,
          rendered against the live tokens.
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-h2 font-semibold">Buttons</h2>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary" leadingIcon={<FiPlay />}>Plan dive</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Delete</Button>
          <Button variant="primary" loading>Loading</Button>
          <Button disabled>Disabled</Button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm">Small</Button>
          <Button size="md">Medium</Button>
          <Button size="lg" trailingIcon={<FiDownload />}>Large</Button>
          <Button iconOnly aria-label="Download"><FiDownload /></Button>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-h2 font-semibold">Stat cards</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard label="Runtime" value={68} unit="min" />
          <StatCard label="MOD" value={42.7} unit="m" tone="warning" hint="at ppO₂ 1.4" />
          <StatCard label="Gas density" value={6.9} unit="g/L" tone="danger" hint="limit 6.2" />
          <StatCard label="CNS" value={38} unit="%" tone="success" />
          <StatCard label="O₂" value={21} unit="%" tone="o2" />
          <StatCard label="He" value={35} unit="%" tone="he" />
          <StatCard label="N₂" value={44} unit="%" tone="n2" />
          <StatCard label="TTS" value={12} unit="min" tone="info" />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-h2 font-semibold">Banners</h2>
        <BannerStack
          items={[
            { id: '1', severity: 'info', message: 'END computed with the N₂-only model.' },
            { id: '2', severity: 'danger', message: 'ppO₂ 1.72 bar at 45 m exceeds the 1.4 bar working limit.' },
            { id: '3', severity: 'warning', message: 'Gas density 6.9 g/L is above the 6.2 g/L advisory limit.' },
          ]}
        />
        <Banner severity="success" title="Mix verified">Analysed 21/35 matches the plan.</Banner>
      </section>

      <section className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader title="Form controls" description="Inputs, steppers and pickers." />
          <div className="space-y-4">
            <Input label="Dive site" placeholder="Blue Hole" hint="Where you're diving." />
            <Input label="Depth" type="number" suffix="m" defaultValue={40} />
            <Input label="Fill pressure" error="Exceeds tank rating" defaultValue="300" />
            <Select label="Tank" defaultValue="al80">
              <option value="al80">Aluminium 80</option>
              <option value="lp85">Steel LP85</option>
            </Select>
            <NumberField label="Target depth" value={num} onChange={setNum} min={0} max={200} step={1} unit="m" />
          </div>
        </Card>

        <Card>
          <CardHeader title="Selection" description="Sliders, switches, segments." />
          <div className="space-y-5">
            <Slider label="Target ppO₂" value={ppo2} onChange={setPpo2} min={1} max={1.6} step={0.1} unit=" bar" hint="Working limit for the bottom gas." />
            <Slider label="Helium" value={35} onChange={() => {}} min={0} max={80} step={1} unit="%" tone="he" />
            <Switch checked={sw} onChange={setSw} label="High contrast" description="Maximises contrast for low-vision use." />
            <SegmentedControl
              label="Dive mode"
              value={seg}
              onChange={setSeg}
              options={[
                { value: 'oc', label: 'Open circuit' },
                { value: 'ccr', label: 'Rebreather' },
              ]}
            />
            <div className="flex items-center gap-2">
              <span className="text-sm text-text-muted">Tooltip (tap or hover)</span>
              <Tooltip content="Works on touch — tap to toggle, Escape to close." />
            </div>
          </div>
        </Card>
      </section>

      <section className="space-y-3">
        <h2 className="text-h2 font-semibold">Tabs &amp; table</h2>
        <Tabs items={[{ value: 'a', label: 'Schedule' }, { value: 'b', label: 'Gases', badge: 2 }]} value={tab} onChange={setTab} ariaLabel="Gallery tabs" />
        <TabPanel value={tab}>
          <Table
            caption="Decompression schedule"
            maxHeight="16rem"
            rows={[
              { depth: 21, stop: 1, run: 42, gas: '21/35' },
              { depth: 18, stop: 1, run: 44, gas: '21/35' },
              { depth: 9, stop: 4, run: 53, gas: 'EAN50' },
              { depth: 6, stop: 8, run: 62, gas: 'O₂' },
            ]}
            rowKey={(r) => String(r.depth)}
            rowSeverity={(r) => (r.depth === 6 ? 'warning' : undefined)}
            columns={[
              { key: 'depth', header: 'Depth', numeric: true, cell: (r) => `${r.depth} m` },
              { key: 'stop', header: 'Stop', numeric: true, cell: (r) => `${r.stop} min` },
              { key: 'run', header: 'Runtime', numeric: true, cell: (r) => `${r.run} min` },
              { key: 'gas', header: 'Gas', cell: (r) => r.gas },
            ]}
          />
        </TabPanel>
      </section>

      <section className="space-y-3">
        <h2 className="text-h2 font-semibold">Modal</h2>
        <Button variant="primary" onClick={() => setModalOpen(true)}>Open modal</Button>
        <Modal
          isOpen={modalOpen}
          onClose={() => setModalOpen(false)}
          title="Preferences"
          description="Focus is trapped and restored on close."
          size="lg"
          footer={
            <>
              <Button variant="ghost" onClick={() => setModalOpen(false)}>Cancel</Button>
              <Button variant="primary" onClick={() => setModalOpen(false)}>Save</Button>
            </>
          }
        >
          <div className="space-y-4">
            <Input label="Max ppO₂ (working)" type="number" suffix="bar" defaultValue={1.4} />
            <Switch checked onChange={() => {}} label="Include O₂ in END" description="NOAA/DCIEM model." />
          </div>
        </Modal>
      </section>
    </main>
  )
}
