// @vitest-environment jsdom
/**
 * Usage tests for the primitive library (Phase 3 §2).
 *
 * These assert the *contracts* other code relies on — accessible roles and
 * names, value clamping, focus behaviour, severity ordering — rather than
 * class strings, which are an implementation detail and would make the suite
 * a change-detector.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react'
import { Button } from './Button'
import { StatCard } from './Card'
import { Modal } from './Modal'
import { Input, Select } from './Field'
import { NumberField } from './NumberField'
import { Slider } from './Slider'
import { Switch } from './Switch'
import { SegmentedControl } from './SegmentedControl'
import { Tabs } from './Tabs'
import { Tooltip } from './Tooltip'
import { Banner, BannerStack, severityRank } from './Banner'
import { Table } from './Table'
import { cn } from './cn'

afterEach(cleanup)

describe('cn', () => {
  it('lets a later utility win over an earlier conflicting one', () => {
    expect(cn('px-4 py-2', 'px-8')).toBe('py-2 px-8')
  })

  it('drops falsy conditionals', () => {
    expect(cn('a', false && 'b', undefined, 'c')).toBe('a c')
  })
})

describe('Button', () => {
  it('renders as a non-submitting button by default', () => {
    render(<Button>Blend</Button>)
    expect(screen.getByRole('button', { name: 'Blend' })).toHaveProperty('type', 'button')
  })

  it('is disabled and busy while loading, and fires nothing', () => {
    const onClick = vi.fn()
    render(<Button loading onClick={onClick}>Save</Button>)
    const btn = screen.getByRole('button', { name: 'Save' })
    expect(btn).toHaveProperty('disabled', true)
    expect(btn.getAttribute('aria-busy')).toBe('true')
    fireEvent.click(btn)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('hides decorative icons from assistive tech', () => {
    render(<Button leadingIcon={<svg data-testid="ico" />}>Go</Button>)
    expect(screen.getByTestId('ico').parentElement?.getAttribute('aria-hidden')).toBe('true')
  })
})

describe('StatCard', () => {
  it('renders label, value and unit as readable text', () => {
    render(<StatCard label="MOD" value={42.7} unit="m" hint="at ppO₂ 1.4" />)
    expect(screen.getByText('MOD')).toBeTruthy()
    expect(screen.getByText('42.7')).toBeTruthy()
    expect(screen.getByText('m')).toBeTruthy()
    expect(screen.getByText('at ppO₂ 1.4')).toBeTruthy()
  })
})

describe('Modal', () => {
  it('renders nothing when closed', () => {
    render(<Modal isOpen={false} onClose={() => {}} title="X">body</Modal>)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('exposes a modal dialog named by its title', () => {
    render(<Modal isOpen onClose={() => {}} title="Preferences">body</Modal>)
    const dialog = screen.getByRole('dialog', { name: 'Preferences' })
    expect(dialog.getAttribute('aria-modal')).toBe('true')
  })

  it('closes on Escape', () => {
    const onClose = vi.fn()
    render(<Modal isOpen onClose={onClose} title="X">body</Modal>)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('ignores Escape and hides the close button when mandatory', () => {
    const onClose = vi.fn()
    render(<Modal isOpen mandatory onClose={onClose} title="Safety">body</Modal>)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Close dialog' })).toBeNull()
  })

  it('locks background scroll while open and restores it on close', () => {
    const { unmount } = render(<Modal isOpen onClose={() => {}} title="X">body</Modal>)
    expect(document.body.style.overflow).toBe('hidden')
    unmount()
    expect(document.body.style.overflow).not.toBe('hidden')
  })
})

describe('Input / Select', () => {
  it('associates the label with the control', () => {
    render(<Input label="Dive site" />)
    expect(screen.getByLabelText('Dive site')).toBeTruthy()
  })

  it('marks the control invalid and describes it when there is an error', () => {
    render(<Input label="Depth" error="Too deep" />)
    const input = screen.getByLabelText('Depth')
    expect(input.getAttribute('aria-invalid')).toBe('true')
    const describedBy = input.getAttribute('aria-describedby')!
    expect(document.getElementById(describedBy)?.textContent).toBe('Too deep')
  })

  it('renders select options behind an associated label', () => {
    render(
      <Select label="Tank">
        <option value="al80">AL80</option>
      </Select>
    )
    const select = screen.getByLabelText('Tank')
    expect(within(select).getByText('AL80')).toBeTruthy()
  })

  // C2. The suffix used to be absolutely positioned inside the input's right
  // padding, so a long value scrolled underneath it — measured at 24px of
  // overlap on a nine-digit value in the gallery. jsdom does no layout, so
  // these assert the structural property that made the overlap possible
  // rather than the pixel overlap itself: an absolutely-positioned span
  // cannot reserve space, a grid sibling always does.
  it('renders the suffix as a sibling of the input, not an overlay', () => {
    const { container } = render(<Input label="Depth" suffix="m" defaultValue={40} />)
    const input = screen.getByLabelText('Depth')
    const suffix = screen.getByText('m')
    expect(suffix.parentElement).toBe(input.parentElement)
    expect(suffix.className).not.toMatch(/\babsolute\b/)
    expect(input.parentElement?.className).toMatch(/\bgrid\b/)
    // The old fixed reserve is gone: nothing hardcodes room for the suffix.
    expect(container.querySelector('.pr-10')).toBeNull()
  })

  it('announces the suffix as part of the field, so the unit is not lost', () => {
    render(<Input label="Depth" suffix="m" defaultValue={40} />)
    const input = screen.getByLabelText('Depth')
    const describedBy = input.getAttribute('aria-describedby') ?? ''
    const ids = describedBy.split(/\s+/).filter(Boolean)
    const described = ids.map((id) => document.getElementById(id)?.textContent).join(' ')
    expect(described).toContain('m')
  })

  it('keeps the hint describing the field when a suffix is also present', () => {
    render(<Input label="Depth" suffix="m" hint="Planned maximum" />)
    const input = screen.getByLabelText('Depth')
    const ids = (input.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean)
    const described = ids.map((id) => document.getElementById(id)?.textContent).join(' ')
    expect(described).toContain('Planned maximum')
    expect(described).toContain('m')
  })

  it('still marks the field invalid when it has a suffix', () => {
    render(<Input label="Depth" suffix="m" error="Too deep" />)
    const input = screen.getByLabelText('Depth')
    expect(input.getAttribute('aria-invalid')).toBe('true')
    // The error border moves to the wrapper, which is what paints the chrome.
    expect(input.parentElement?.className).toMatch(/border-danger/)
  })

  it('leaves a suffixless input on the plain control, with no wrapper grid', () => {
    render(<Input label="Dive site" />)
    const input = screen.getByLabelText('Dive site')
    expect(input.parentElement?.className ?? '').not.toMatch(/\bgrid\b/)
  })
})

describe('NumberField', () => {
  it('clamps to max when stepping up past it', () => {
    const onChange = vi.fn()
    render(
      <NumberField label="Depth" value={100} onChange={onChange} min={0} max={100} step={5} />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Increase Depth' }))
    // Already at max, so the stepper is disabled and nothing fires.
    expect(onChange).not.toHaveBeenCalled()
  })

  it('clamps a typed value that exceeds max, on blur', () => {
    const onChange = vi.fn()
    render(
      <NumberField label="Depth" value={50} onChange={onChange} min={0} max={100} step={1} />
    )
    const input = screen.getByLabelText('Depth')
    fireEvent.change(input, { target: { value: '250' } })
    // Out of range, so nothing is pushed while typing — 250 might be on its
    // way to being deleted back down to 25.
    expect(onChange).not.toHaveBeenCalled()
    fireEvent.blur(input)
    expect(onChange).toHaveBeenCalledWith(100)
  })

  it('snaps to the precision implied by a fractional step', () => {
    const onChange = vi.fn()
    render(
      <NumberField label="ppO2" value={1.4} onChange={onChange} min={0} max={2} step={0.1} />
    )
    const input = screen.getByLabelText('ppO2')
    fireEvent.change(input, { target: { value: '1.2345' } })
    fireEvent.blur(input)
    expect(onChange).toHaveBeenCalledWith(1.2)
  })

  // The regression this field was rebuilt for. Clamping on every keystroke made
  // most values impossible to type: with min=10, a "3" became 10, so the next
  // character produced "103".
  it('lets a digit below min be typed on the way to a valid number', () => {
    const onChange = vi.fn()
    render(
      <NumberField label="Depth" value={40} onChange={onChange} min={10} max={150} step={1} />
    )
    const input = screen.getByLabelText('Depth') as HTMLInputElement

    fireEvent.change(input, { target: { value: '3' } })
    // Below min: held as a draft, not clamped up to 10 underneath the cursor.
    expect(input.value).toBe('3')
    expect(onChange).not.toHaveBeenCalled()

    fireEvent.change(input, { target: { value: '30' } })
    expect(input.value).toBe('30')
    expect(onChange).toHaveBeenLastCalledWith(30)
  })

  it('allows the box to be emptied while typing', () => {
    const onChange = vi.fn()
    render(
      <NumberField label="Depth" value={40} onChange={onChange} min={10} max={150} step={1} />
    )
    const input = screen.getByLabelText('Depth') as HTMLInputElement
    fireEvent.change(input, { target: { value: '' } })
    expect(input.value).toBe('')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('reverts to the last good value when blurred empty', () => {
    const onChange = vi.fn()
    render(
      <NumberField label="Depth" value={40} onChange={onChange} min={10} max={150} step={1} />
    )
    const input = screen.getByLabelText('Depth') as HTMLInputElement
    fireEvent.change(input, { target: { value: '' } })
    fireEvent.blur(input)
    // No NaN written into the calculation, and the box shows the old value.
    expect(onChange).not.toHaveBeenCalled()
    expect(input.value).toBe('40')
  })

  it('steppers still clamp immediately', () => {
    const onChange = vi.fn()
    render(
      <NumberField label="Depth" value={12} onChange={onChange} min={10} max={150} step={5} />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Decrease Depth' }))
    expect(onChange).toHaveBeenCalledWith(10)
  })

  it('keeps the unit out of the value box and spoken with the field', () => {
    // The unit used to be an overlay pinned inside the input's padding, so a
    // long value ran underneath it and became unreadable in narrow columns.
    // It is a sibling grid column now, and described-by so it is still
    // announced — labels say "Start pressure", not "Start pressure (psi)".
    render(<NumberField label="Fill pressure" value={2901} onChange={() => {}} unit="psi" />)
    const input = screen.getByLabelText('Fill pressure')
    const unit = screen.getByText('psi')
    expect(input.contains(unit)).toBe(false)
    expect(input.getAttribute('aria-describedby')).toContain(unit.id)
  })
})

describe('Slider', () => {
  it('exposes range semantics and a spoken value with its unit', () => {
    render(<Slider label="ppO₂" value={1.4} onChange={() => {}} min={1} max={1.6} step={0.1} unit=" bar" />)
    const slider = screen.getByLabelText('ppO₂')
    expect(slider.getAttribute('aria-valuetext')).toBe('1.4 bar')
    expect(slider.getAttribute('max')).toBe('1.6')
  })
})

describe('Switch', () => {
  it('reports on/off state through the switch role', () => {
    const onChange = vi.fn()
    render(<Switch checked={false} onChange={onChange} label="High contrast" />)
    const sw = screen.getByRole('switch', { name: 'High contrast' })
    expect(sw.getAttribute('aria-checked')).toBe('false')
    fireEvent.click(sw)
    expect(onChange).toHaveBeenCalledWith(true)
  })
})

describe('SegmentedControl', () => {
  const options = [
    { value: 'oc' as const, label: 'Open circuit' },
    { value: 'ccr' as const, label: 'Rebreather' },
  ]

  it('renders radios with exactly one checked', () => {
    render(<SegmentedControl options={options} value="oc" onChange={() => {}} label="Mode" />)
    expect(screen.getByRole('radio', { name: 'Open circuit' }).getAttribute('aria-checked')).toBe('true')
    expect(screen.getByRole('radio', { name: 'Rebreather' }).getAttribute('aria-checked')).toBe('false')
  })

  it('moves selection with arrow keys', () => {
    const onChange = vi.fn()
    render(<SegmentedControl options={options} value="oc" onChange={onChange} label="Mode" />)
    fireEvent.keyDown(screen.getByRole('radio', { name: 'Open circuit' }), { key: 'ArrowRight' })
    expect(onChange).toHaveBeenCalledWith('ccr')
  })
})

describe('Tabs', () => {
  const items = [
    { value: 'a' as const, label: 'Profile' },
    { value: 'b' as const, label: 'Limits' },
  ]

  it('wires each tab to its panel', () => {
    render(<Tabs items={items} value="a" onChange={() => {}} ariaLabel="Preferences" />)
    const tab = screen.getByRole('tab', { name: 'Profile' })
    expect(tab.getAttribute('aria-selected')).toBe('true')
    expect(tab.getAttribute('aria-controls')).toBe('tabpanel-a')
  })

  it('wraps around with ArrowLeft from the first tab', () => {
    const onChange = vi.fn()
    render(<Tabs items={items} value="a" onChange={onChange} ariaLabel="Preferences" />)
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Profile' }), { key: 'ArrowLeft' })
    expect(onChange).toHaveBeenCalledWith('b')
  })
})

describe('Tooltip', () => {
  it('opens on tap, not only on hover — the mobile case the old tooltips failed', () => {
    render(<Tooltip content="Fraction of oxygen." />)
    const trigger = screen.getByRole('button', { name: 'More information' })
    expect(screen.queryByRole('tooltip')).toBeNull()
    fireEvent.click(trigger)
    expect(screen.getByRole('tooltip').textContent).toBe('Fraction of oxygen.')
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
  })

  it('closes on Escape', () => {
    render(<Tooltip content="x" />)
    fireEvent.click(screen.getByRole('button', { name: 'More information' }))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('tooltip')).toBeNull()
  })
})

describe('Banner', () => {
  it('uses the alert role for danger so it interrupts', () => {
    render(<Banner severity="danger">ppO₂ exceeded</Banner>)
    expect(screen.getByRole('alert')).toBeTruthy()
  })

  it('uses status for non-danger severities', () => {
    render(<Banner severity="info">FYI</Banner>)
    expect(screen.getByRole('status')).toBeTruthy()
  })

  it('orders a stack most-serious-first regardless of input order', () => {
    render(
      <BannerStack
        items={[
          { id: 'i', severity: 'info', message: 'info msg' },
          { id: 'd', severity: 'danger', message: 'danger msg' },
          { id: 'w', severity: 'warning', message: 'warning msg' },
        ]}
      />
    )
    const texts = screen.getAllByText(/msg$/).map((n) => n.textContent)
    expect(texts).toEqual(['Danger — danger msg', 'Warning — warning msg', 'Note — info msg'])
  })

  it('ranks severities danger < warning < info < success', () => {
    expect(severityRank.danger).toBeLessThan(severityRank.warning)
    expect(severityRank.warning).toBeLessThan(severityRank.info)
    expect(severityRank.info).toBeLessThan(severityRank.success)
  })

  it('renders nothing for an empty stack', () => {
    const { container } = render(<BannerStack items={[]} />)
    expect(container.firstChild).toBeNull()
  })
})

describe('Table', () => {
  const rows = [{ depth: 21, time: 1 }, { depth: 9, time: 4 }]

  it('renders a scoped header per column and one row per datum', () => {
    render(
      <Table
        caption="Deco schedule"
        rows={rows}
        rowKey={(r) => String(r.depth)}
        columns={[
          { key: 'depth', header: 'Depth', numeric: true, cell: (r) => r.depth },
          { key: 'time', header: 'Time', numeric: true, cell: (r) => r.time },
        ]}
      />
    )
    expect(screen.getByRole('columnheader', { name: 'Depth' })).toBeTruthy()
    // 1 header row + 2 body rows.
    expect(screen.getAllByRole('row')).toHaveLength(3)
  })

  it('shows the empty message instead of an empty body', () => {
    render(
      <Table
        rows={[]}
        rowKey={() => 'x'}
        emptyMessage="No stops required."
        columns={[{ key: 'd', header: 'Depth', cell: () => null }]}
      />
    )
    expect(screen.getByText('No stops required.')).toBeTruthy()
  })
})
