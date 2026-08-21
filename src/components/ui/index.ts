/**
 * DiveBlendr primitive library — Phase 3 §2.
 *
 * Every visual decision here comes from the tokens in `src/app/globals.css`.
 * Components elsewhere in the app should compose these rather than restyling
 * raw elements; the point of the library is that there is one button, one
 * modal, one slider, not 144 / 16 / 4 of them.
 */
export { Button, buttonVariants, type ButtonProps } from './Button'
export {
  Card,
  CardHeader,
  CollapsibleCard,
  StatCard,
  cardVariants,
  type CardProps,
  type StatCardProps,
  type StatTone,
} from './Card'
export { Modal, type ModalProps } from './Modal'
export {
  FieldShell,
  Input,
  Select,
  controlBase,
  type InputProps,
  type SelectProps,
} from './Field'
export { NumberField, type NumberFieldProps } from './NumberField'
export { Slider, type SliderProps } from './Slider'
export { Switch, type SwitchProps } from './Switch'
export {
  SegmentedControl,
  type SegmentedControlProps,
  type SegmentedOption,
} from './SegmentedControl'
export { Tabs, TabPanel, type TabsProps, type TabItem } from './Tabs'
export { ToolLayout, Inputs, Results, type ToolLayoutProps } from './ToolLayout'
export { Tooltip, type TooltipProps } from './Tooltip'
export { MessageBar } from './MessageBar'
export { MathTrigger, ShowMathButton } from './ShowMathButton'
export type { ShowMathButtonProps } from './ShowMathButton'
export type { MessageBarItem, MessageBarProps } from './MessageBar'
export {
  Banner,
  BannerStack,
  severityRank,
  type Severity,
  type BannerProps,
  type BannerStackProps,
} from './Banner'
export { Table, type TableProps, type TableColumn } from './Table'
export { cn } from './cn'
