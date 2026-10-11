import './BrandFlightMark.css'

export default function BrandFlightMark() {
  return <svg className="brand-flight-mark" viewBox="0 0 40 40" aria-hidden="true" fill="none" strokeLinecap="round" strokeLinejoin="round">
    <path className="brand-flight-mark__trail" d="M5 31c3 2 7 2 10-1" />
    <g className="brand-flight-mark__plane"><path d="m8 16 26-8-8 26-6-11-12-7Z" /><path d="m20 23 14-15M20 23l-2 8 5-4" /></g>
  </svg>
}
