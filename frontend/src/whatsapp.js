const SHOW_ACCOUNT_EMAIL = true

const digits = (v) => String(v ?? '').replace(/\D/g, '')

export function waPhone(raw) {
  const d = digits(raw)
  if (!d) return ''
  return d.length === 10 ? `57${d}` : d
}

const firstName = (name) => String(name ?? '').trim().split(/\s+/)[0] || ''
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s)

function niceDate(iso) {
  const d = new Date(`${String(iso).slice(0, 10)}T00:00:00`)
  if (Number.isNaN(d.getTime())) return String(iso)
  const opts = { day: 'numeric', month: 'long' }
  if (d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric'
  return d.toLocaleDateString('es-CO', opts)
}

function profileWord(name) {
  const n = String(name ?? '').trim()
  if (!n) return 'perfil'
  if (/^perfil\s*\d*$/i.test(n)) return n.toLowerCase()
  if (/^\d+$/.test(n)) return `perfil ${n}`
  return `perfil "${n}"`
}

function describe(r, kind) {
  const product = r.product_name || 'servicio'
  const email = SHOW_ACCOUNT_EMAIL && r.account_email ? r.account_email : ''
  return kind === 'profile'
    ? `${profileWord(r.profile_name)} de ${product}${email ? ` (cuenta ${email})` : ''}`
    : `cuenta de ${product}${email ? ` (${email})` : ''}`
}

function whenText(r) {
  const date = niceDate(r.end_date)
  const d = Number(r.days_left)
  if (d < 0) return `venció el ${date} (hace ${plural(-d, 'día', 'días')})`
  if (d === 0) return `vence hoy (${date})`
  if (d === 1) return `vence mañana (${date})`
  return `vence el ${date} (en ${d} días)`
}

export function renewalText(r, kind = 'full') {
  const verb = kind === 'profile' ? 'renovarlo' : 'renovarla'
  const d = Number(r.days_left)
  const close = d < 0
    ? `¿Deseas ${verb}? Si no, se cortará el acceso.`
    : `¿Quieres ${verb} para que no se corte el servicio?`
  const greeting = firstName(r.customer_name)
  return `Hola${greeting ? ` ${greeting}` : ''}, tu ${describe(r, kind)} ${whenText(r)}. ${close}`
}

export function waUrl(rawPhone, text) {
  const phone = waPhone(rawPhone)
  return phone ? `https://wa.me/${phone}?text=${encodeURIComponent(text)}` : null
}

export function renewalUrl(r, kind = 'full') {
  return waUrl(r.customer_phone, renewalText(r, kind))
}

export function renewalGroupText(items) {
  if (items.length === 1) return renewalText(items[0], items[0].kind)
  const MAX = 10
  const sorted = [...items].sort((a, b) => Number(a.days_left) - Number(b.days_left))
  const lines = sorted.slice(0, MAX).map((r) => `• ${cap(describe(r, r.kind))}: ${whenText(r)}`)
  if (sorted.length > MAX) lines.push(`• …y ${sorted.length - MAX} más`)
  const expired = sorted.some((r) => Number(r.days_left) < 0)
  const close = expired
    ? '¿Deseas renovarlos? Si no, se cortará el acceso.'
    : '¿Quieres renovarlos para que no se corte el servicio?'
  const greeting = firstName(sorted[0].customer_name)
  return `Hola${greeting ? ` ${greeting}` : ''}, te recordamos el estado de tus servicios:\n${lines.join('\n')}\n${close}`
}

export const DEFAULT_GENERAL =
  'Hola {nombre}, te recordamos que tu servicio vence pronto. ¿Deseas renovarlo? Si no, se cortará el acceso.'

export function fillGeneral(template, name) {
  return String(template)
    .replace(/\{nombre\}/gi, firstName(name))
    .replace(/\s+([,.!?;:])/g, '$1')
}

export function plainGeneral(template) {
  return String(template).replace(/\s*\{nombre\}/gi, '')
}

export function downText(r, kind = 'full') {
  const greeting = firstName(r.customer_name)
  const vigente = Number(r.days_left) >= 0
    ? ` Tu servicio está vigente hasta el ${niceDate(r.end_date)}.`
    : ''
  return `Hola${greeting ? ` ${greeting}` : ''}, tu ${describe(r, kind)} presentó una falla.${vigente} Ya lo estamos revisando y te daremos una solución lo antes posible. Gracias por tu paciencia.`
}

export function downUrl(r, kind = 'full') {
  return waUrl(r.customer_phone, downText(r, kind))
}