<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { UserPlus, Pencil, KeyRound, Trash2, Eye, EyeOff, Copy, RefreshCw } from 'lucide-vue-next'
import { api } from '../api'
import { setSession } from '../auth'
import { useToast } from '../toast'
import { useConfirm } from '../confirm'
import BaseModal from '../components/BaseModal.vue'
import { inputCls, btnGhost, btnPrimary } from '../ui'

const toast = useToast()
const { ask } = useConfirm()

const me = ref(null)
const isAdmin = computed(() => me.value?.role === 'admin')

const roles = [
  { value: 'staff', label: 'Usuario' },
  { value: 'admin', label: 'Administrador' },
]
const segCls = (active, locked) => [
  'rounded-md px-3 py-1.5 text-sm transition',
  active ? 'bg-white font-medium shadow-sm' : 'text-slate-500 hover:text-slate-700',
  locked && 'cursor-not-allowed opacity-60',
]

function genPassword(len = 12) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
  const buf = new Uint32Array(len)
  crypto.getRandomValues(buf)
  return Array.from(buf, (n) => chars[n % chars.length]).join('')
}

async function copy(text, label) {
  if (!text) return
  try {
    await navigator.clipboard.writeText(text)
    toast.success(`${label} copiada`)
  } catch {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.cssText = 'position:fixed;opacity:0'
    document.body.appendChild(ta)
    ta.select()
    try { document.execCommand('copy'); toast.success(`${label} copiada`) }
    catch { toast.error('No se pudo copiar') }
    ta.remove()
  }
}

const profile = reactive({ name: '', email: '', current_password: '' })
const savingProfile = ref(false)
const emailChanged = computed(() =>
  !!me.value && profile.email.trim().toLowerCase() !== me.value.email)

async function loadMe() {
  try {
    const res = await api.get('/account')
    me.value = res.user
    Object.assign(profile, { name: res.user.name, email: res.user.email, current_password: '' })
    if (res.user.role === 'admin') await loadUsers()
  } catch (e) { toast.error(e.message) }
}

async function saveProfile() {
  if (!profile.name.trim()) { toast.error('Escribe tu nombre'); return }
  if (emailChanged.value && !profile.current_password) {
    toast.error('Para cambiar el correo escribe tu contraseña actual')
    return
  }
  savingProfile.value = true
  try {
    const res = await api.put('/account/profile', { ...profile })
    setSession(res.token, res.user)
    me.value = res.user
    profile.current_password = ''
    toast.success('Datos actualizados')
  } catch (e) { toast.error(e.message) }
  finally { savingProfile.value = false }
}

const pw = reactive({ current: '', next: '', confirm: '' })
const showPw = ref(false)
const savingPw = ref(false)

async function savePassword() {
  if (!pw.current) { toast.error('Escribe tu contraseña actual'); return }
  if (pw.next.length < 8) { toast.error('La nueva contraseña debe tener al menos 8 caracteres'); return }
  if (pw.next !== pw.confirm) { toast.error('Las contraseñas nuevas no coinciden'); return }
  savingPw.value = true
  try {
    const res = await api.put('/account/password', { current_password: pw.current, new_password: pw.next })
    setSession(res.token, res.user)
    Object.assign(pw, { current: '', next: '', confirm: '' })
    toast.success('Contraseña actualizada. Se cerró tu sesión en los demás dispositivos.')
  } catch (e) { toast.error(e.message) }
  finally { savingPw.value = false }
}

const users = ref([])
async function loadUsers() {
  try { users.value = await api.get('/users') }
  catch (e) { toast.error(e.message) }
}

const showNew = ref(false)
const creating = ref(false)
const nu = reactive({ name: '', email: '', role: 'staff', password: '' })

function openNew() {
  Object.assign(nu, { name: '', email: '', role: 'staff', password: genPassword() })
  showNew.value = true
}
async function saveNew() {
  if (!nu.name.trim() || !nu.email.trim()) { toast.error('Escribe el nombre y el correo'); return }
  if (nu.password.length < 8) { toast.error('La contraseña debe tener al menos 8 caracteres'); return }
  creating.value = true
  try {
    await api.post('/users', { ...nu })
    showNew.value = false
    toast.success('Usuario creado')
    await loadUsers()
  } catch (e) { toast.error(e.message) }
  finally { creating.value = false }
}

const editU = ref(null)
const editing = ref(false)
const eu = reactive({ name: '', role: 'staff', active: true })
const isSelf = (u) => u?.id === me.value?.id

function openEdit(u) {
  Object.assign(eu, { name: u.name, role: u.role, active: !!u.active })
  editU.value = u
}
async function saveEdit() {
  if (!eu.name.trim()) { toast.error('Escribe el nombre'); return }
  editing.value = true
  try {
    await api.put(`/users/${editU.value.id}`, { name: eu.name, role: eu.role, active: eu.active })
    editU.value = null
    toast.success('Usuario actualizado')
    await loadUsers()
  } catch (e) { toast.error(e.message) }
  finally { editing.value = false }
}

const resetU = ref(null)
const resetting = ref(false)
const rp = ref('')

function openReset(u) { rp.value = genPassword(); resetU.value = u }
async function saveReset() {
  if (rp.value.length < 8) { toast.error('La contraseña debe tener al menos 8 caracteres'); return }
  resetting.value = true
  try {
    await api.post(`/users/${resetU.value.id}/password`, { new_password: rp.value })
    resetU.value = null
    toast.success('Contraseña restablecida. Cópiala y compártela con la persona.')
  } catch (e) { toast.error(e.message) }
  finally { resetting.value = false }
}

async function removeUser(u) {
  const ok = await ask({
    title: 'Eliminar usuario',
    message: 'Dejará de poder entrar al panel. No se puede deshacer.',
    detail: `${u.name} · ${u.email}`,
    confirmText: 'Eliminar',
    tone: 'danger',
  })
  if (!ok) return
  try {
    await api.del(`/users/${u.id}`)
    toast.success('Usuario eliminado')
    await loadUsers()
  } catch (e) { toast.error(e.message) }
}

onMounted(loadMe)
</script>

<template>
  <div>
    <h1 class="text-2xl font-semibold">Mi cuenta</h1>
    <p class="text-slate-500">Tus datos de acceso{{ isAdmin ? ' y los usuarios de la página' : '' }}.</p>

    <p v-if="!me" class="mt-6 text-slate-500">Cargando…</p>

    <template v-else>
      <div class="mt-6 grid gap-6 lg:grid-cols-2">
        <form class="space-y-3 rounded-xl bg-white p-5 shadow-sm" @submit.prevent="saveProfile">
          <div class="flex items-center justify-between gap-2">
            <h2 class="font-semibold">Mis datos</h2>
            <span :class="['rounded-full px-2.5 py-1 text-xs font-medium', isAdmin ? 'bg-violet-100 text-violet-700' : 'bg-slate-100 text-slate-600']">
              {{ isAdmin ? 'Administrador' : 'Usuario' }}
            </span>
          </div>
          <label class="block text-sm">Nombre
            <input v-model="profile.name" maxlength="80" :class="inputCls" />
          </label>
          <label class="block text-sm">Correo
            <input v-model="profile.email" type="email" maxlength="120" autocomplete="username" :class="inputCls" />
          </label>
          <label v-if="emailChanged" class="block text-sm">Contraseña actual <span class="text-rose-500">*</span>
            <input v-model="profile.current_password" type="password" autocomplete="current-password" :class="inputCls" />
            <span class="mt-1 block text-xs text-slate-500">Para cambiar el correo necesitamos confirmar que eres tú.</span>
          </label>
          <div class="flex justify-end pt-1">
            <button :disabled="savingProfile" :class="btnPrimary">{{ savingProfile ? 'Guardando…' : 'Guardar cambios' }}</button>
          </div>
        </form>

        <form class="space-y-3 rounded-xl bg-white p-5 shadow-sm" @submit.prevent="savePassword">
          <h2 class="font-semibold">Contraseña</h2>
          <label class="block text-sm">Contraseña actual
            <input v-model="pw.current" :type="showPw ? 'text' : 'password'" autocomplete="current-password" :class="inputCls" />
          </label>
          <label class="block text-sm">Nueva contraseña
            <div class="relative">
              <input v-model="pw.next" :type="showPw ? 'text' : 'password'" autocomplete="new-password" :class="[inputCls, 'pr-10']" />
              <button type="button" class="absolute right-3 top-3.5 text-slate-400 hover:text-slate-700"
                :aria-label="showPw ? 'Ocultar contraseñas' : 'Mostrar contraseñas'" @click="showPw = !showPw">
                <component :is="showPw ? EyeOff : Eye" class="size-4" />
              </button>
            </div>
            <span class="mt-1 block text-xs" :class="pw.next && pw.next.length < 8 ? 'text-rose-600' : 'text-slate-500'">Mínimo 8 caracteres.</span>
          </label>
          <label class="block text-sm">Repite la nueva contraseña
            <input v-model="pw.confirm" :type="showPw ? 'text' : 'password'" autocomplete="new-password" :class="inputCls" />
            <span v-if="pw.confirm && pw.confirm !== pw.next" class="mt-1 block text-xs text-rose-600">No coinciden.</span>
          </label>
          <div class="flex items-center justify-between gap-3 pt-1">
            <span class="text-xs text-slate-500">Al cambiarla se cierra tu sesión en los demás dispositivos.</span>
            <button :disabled="savingPw" :class="btnPrimary">{{ savingPw ? 'Guardando…' : 'Cambiar contraseña' }}</button>
          </div>
        </form>
      </div>

      <section v-if="isAdmin" class="mt-6 rounded-xl bg-white p-5 shadow-sm">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 class="font-semibold">Usuarios de la página</h2>
            <p class="text-sm text-slate-500">{{ users.length }} {{ users.length === 1 ? 'usuario' : 'usuarios' }}. Un administrador puede crear y gestionar usuarios; un usuario normal solo gestiona su cuenta.</p>
          </div>
          <button type="button" class="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700" @click="openNew">
            <UserPlus class="size-4" /> Nuevo usuario
          </button>
        </div>

        <ul class="mt-4 divide-y divide-slate-100">
          <li v-for="u in users" :key="u.id" class="flex flex-wrap items-center gap-3 py-3">
            <div class="min-w-0 flex-1 basis-52">
              <p class="flex items-center gap-2">
                <span class="truncate font-medium">{{ u.name }}</span>
                <span v-if="isSelf(u)" class="shrink-0 rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-indigo-700">Tú</span>
              </p>
              <p class="truncate text-sm text-slate-500">{{ u.email }}</p>
            </div>
            <div class="flex shrink-0 items-center gap-1.5">
              <span :class="['rounded-full px-2.5 py-1 text-xs font-medium', u.role === 'admin' ? 'bg-violet-100 text-violet-700' : 'bg-slate-100 text-slate-600']">
                {{ u.role === 'admin' ? 'Administrador' : 'Usuario' }}
              </span>
              <span v-if="!u.active" class="rounded-full bg-rose-100 px-2.5 py-1 text-xs font-medium text-rose-700">Desactivado</span>
            </div>
            <div class="flex shrink-0 gap-1.5">
              <button type="button" title="Editar" class="grid size-9 place-items-center rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100" @click="openEdit(u)"><Pencil class="size-4" /></button>
              <template v-if="!isSelf(u)">
                <button type="button" title="Restablecer contraseña" class="grid size-9 place-items-center rounded-lg bg-amber-100 text-amber-800 hover:opacity-80" @click="openReset(u)"><KeyRound class="size-4" /></button>
                <button type="button" title="Eliminar" class="grid size-9 place-items-center rounded-lg bg-rose-50 text-rose-700 hover:bg-rose-100" @click="removeUser(u)"><Trash2 class="size-4" /></button>
              </template>
            </div>
          </li>
        </ul>
      </section>
    </template>

    <BaseModal :open="showNew" title="Nuevo usuario" size="md" :busy="creating" @close="showNew = false" @submit="saveNew">
      <label class="block">Nombre <span class="text-rose-500">*</span>
        <input v-model="nu.name" maxlength="80" :class="inputCls" />
      </label>
      <label class="block">Correo <span class="text-rose-500">*</span>
        <input v-model="nu.email" type="email" maxlength="120" :class="inputCls" />
      </label>
      <div>
        <p class="mb-1">Rol</p>
        <div class="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1">
          <button v-for="r in roles" :key="r.value" type="button" :class="segCls(nu.role === r.value, false)" @click="nu.role = r.value">{{ r.label }}</button>
        </div>
        <p class="mt-1 text-xs text-slate-500">
          {{ nu.role === 'admin' ? 'Puede además crear y gestionar usuarios.' : 'Usa el panel, pero no gestiona usuarios.' }}
        </p>
      </div>
      <label class="block">Contraseña <span class="text-rose-500">*</span>
        <div class="flex gap-1.5">
          <input v-model="nu.password" class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm" />
          <button type="button" title="Generar otra" class="mt-1 grid size-10 shrink-0 place-items-center rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-100" @click="nu.password = genPassword()"><RefreshCw class="size-4" /></button>
          <button type="button" title="Copiar" class="mt-1 grid size-10 shrink-0 place-items-center rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-100" @click="copy(nu.password, 'Contraseña')"><Copy class="size-4" /></button>
        </div>
        <span class="mt-1 block text-xs text-slate-500">Cópiala ahora y compártela: después no se puede volver a ver. La persona puede cambiarla en "Mi cuenta".</span>
      </label>
      <template #footer>
        <button type="button" :class="btnGhost" @click="showNew = false">Cancelar</button>
        <button :disabled="creating" :class="btnPrimary">{{ creating ? 'Creando…' : 'Crear usuario' }}</button>
      </template>
    </BaseModal>

    <BaseModal :open="!!editU" size="md" :busy="editing" :title="`Editar a ${editU?.name ?? ''}`" @close="editU = null" @submit="saveEdit">
      <label class="block">Nombre
        <input v-model="eu.name" maxlength="80" :class="inputCls" />
      </label>
      <div>
        <p class="mb-1">Rol</p>
        <div class="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1">
          <button v-for="r in roles" :key="r.value" type="button" :disabled="isSelf(editU)"
            :class="segCls(eu.role === r.value, isSelf(editU))" @click="eu.role = r.value">{{ r.label }}</button>
        </div>
      </div>
      <label class="flex items-center gap-2.5 rounded-lg border border-slate-200 px-3 py-2">
        <input v-model="eu.active" type="checkbox" :disabled="isSelf(editU)" />
        <span class="flex-1">Usuario activo</span>
        <span class="text-xs text-slate-500">{{ eu.active ? 'Puede entrar' : 'No puede entrar' }}</span>
      </label>
      <p v-if="isSelf(editU)" class="text-xs text-slate-500">No puedes cambiar tu propio rol ni desactivarte.</p>
      <template #footer>
        <button type="button" :class="btnGhost" @click="editU = null">Cancelar</button>
        <button :disabled="editing" :class="btnPrimary">{{ editing ? 'Guardando…' : 'Guardar' }}</button>
      </template>
    </BaseModal>

    <BaseModal :open="!!resetU" size="md" :busy="resetting" :title="`Nueva contraseña para ${resetU?.name ?? ''}`" @close="resetU = null" @submit="saveReset">
      <label class="block">Contraseña nueva
        <div class="flex gap-1.5">
          <input v-model="rp" class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm" />
          <button type="button" title="Generar otra" class="mt-1 grid size-10 shrink-0 place-items-center rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-100" @click="rp = genPassword()"><RefreshCw class="size-4" /></button>
          <button type="button" title="Copiar" class="mt-1 grid size-10 shrink-0 place-items-center rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-100" @click="copy(rp, 'Contraseña')"><Copy class="size-4" /></button>
        </div>
      </label>
      <p class="text-xs text-slate-500">Se cerrará su sesión en todos los dispositivos. Cópiala antes de guardar y compártela.</p>
      <template #footer>
        <button type="button" :class="btnGhost" @click="resetU = null">Cancelar</button>
        <button :disabled="resetting" :class="btnPrimary">{{ resetting ? 'Guardando…' : 'Restablecer' }}</button>
      </template>
    </BaseModal>
  </div>
</template>