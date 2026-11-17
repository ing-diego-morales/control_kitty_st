<script setup>
import { ref, computed, watch } from 'vue'
import { History, MessageCircle } from 'lucide-vue-next'
import CrudView from '../components/CrudView.vue'
import CustomerHistory from '../components/CustomerHistory.vue'
import { formatPhone } from '../utils'

const INACTIVE_DAYS = 30
const ALERT_DAYS = 60

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`

function statusChip(r) {
  if (r.status === 'active') {
    return {
      text: `Activo · ${plural(Number(r.active_services), 'servicio', 'servicios')}`,
      cls: 'bg-emerald-100 text-emerald-700',
      hint: r.last_end ? `Cubierto hasta el ${r.last_end}` : '',
    }
  }
  if (r.status === 'never') {
    return { text: 'Sin compras', cls: 'bg-slate-100 text-slate-600', hint: '' }
  }
  const d = Number(r.idle_days)
  if (r.status === 'recent') {
    return {
      text: `Venció hace ${plural(d, 'día', 'días')}`,
      cls: 'bg-slate-100 text-slate-600',
      hint: `Último vencimiento: ${r.last_end}`,
    }
  }
  return {
    text: `${plural(d, 'día', 'días')} sin comprar`,
    cls: d >= ALERT_DAYS ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-800',
    hint: `Último vencimiento: ${r.last_end}`,
  }
}

const columns = [
  { key: 'name', label: 'Nombre' },
  { key: 'phone', label: 'Teléfono', format: (r) => formatPhone(r.phone) },
  { key: 'email', label: 'Correo' },
  { key: 'status', label: 'Servicio', sortKey: 'idle_sort', chip: statusChip },
  { key: 'notes', label: 'Notas' },
]
const fields = [
  { key: 'name', label: 'Nombre', required: true },
  { key: 'email', label: 'Correo', type: 'email', required: true, placeholder: 'cliente@correo.com' },
  { key: 'phone', label: 'Teléfono (WhatsApp)', type: 'phone', required: true, wide: true },
  { key: 'notes', label: 'Notas', type: 'textarea', wide: true },
]

const tabs = [
  { value: '', label: 'Todos' },
  { value: 'active', label: 'Activos' },
  { value: 'inactive', label: 'Inactivos' },
  { value: 'never', label: 'Sin compras' },
]
const status = ref('')
const minDays = ref('')
const params = computed(() => ({
  status: status.value,
  min_days: Number(minDays.value) > 0 ? Number(minDays.value) : '',
}))
watch(status, (s) => { if (s !== 'inactive') minDays.value = '' })

const historyOf = ref(null)

function waLink(r) {
  const digits = String(r.phone || '').replace(/\D/g, '')
  if (!digits) return null
  const phone = digits.length === 10 ? `57${digits}` : digits
  const first = String(r.name || '').split(' ')[0]
  const msg = `Hola ${first} 👋 hace un tiempo no cuentas con nuestros servicios. ¿Quieres reactivar alguno o ver lo que tenemos disponible?`
  return `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`
}
</script>

<template>
  <CrudView title="Clientes" endpoint="/customers" noun="cliente" plural="clientes"
    :columns="columns" :fields="fields" :params="params">
    <template #filters>
      <div class="flex max-w-full gap-1 overflow-x-auto rounded-lg bg-white p-1 shadow-sm">
        <button v-for="t in tabs" :key="t.value" type="button"
          :class="['shrink-0 whitespace-nowrap rounded-md px-3 py-1.5 text-sm transition', status === t.value ? 'bg-indigo-950 text-white' : 'text-slate-600 hover:bg-slate-100']"
          :title="t.value === 'inactive' ? `${INACTIVE_DAYS} días o más sin comprar nada` : undefined"
          @click="status = t.value">{{ t.label }}</button>
      </div>

      <div v-if="status === 'inactive'" class="flex items-center gap-1.5 text-sm">
        <span class="text-slate-500">Más de</span>
        <input v-model.number="minDays" type="number" min="1" :placeholder="String(INACTIVE_DAYS)" aria-label="Días sin comprar"
          class="w-20 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm" />
        <span class="text-slate-500">días</span>
        <button v-for="d in [60, 90, 120]" :key="d" type="button"
          :class="['rounded-md px-2 py-1 text-xs transition', Number(minDays) === d ? 'bg-indigo-950 text-white' : 'bg-white text-slate-600 shadow-sm hover:bg-slate-100']"
          @click="minDays = Number(minDays) === d ? '' : d">{{ d }}</button>
      </div>
    </template>

    <template #row-actions="{ row }">
      <a v-if="row.status !== 'active' && waLink(row)" :href="waLink(row)" target="_blank" rel="noopener"
        title="Escribir por WhatsApp"
        class="grid size-9 place-items-center rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100">
        <MessageCircle class="size-4" />
      </a>
      <button type="button" title="Historial de pagos"
        class="grid size-9 place-items-center rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200"
        @click="historyOf = row">
        <History class="size-4" />
      </button>
    </template>
  </CrudView>

  <CustomerHistory :customer="historyOf" @close="historyOf = null" />
</template>