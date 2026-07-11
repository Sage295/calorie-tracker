import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabaseClient'
import './App.css'

type Goal = 'lose' | 'maintain' | 'gain' | 'muscle' | 'health'
type Sex = 'female' | 'male'
type Period = 'week' | 'month' | 'year'
type DashboardTab = 'home' | 'progress' | 'labels' | 'foods' | 'settings'
type NutrientKey = 'fat' | 'saturated_fat' | 'trans_fat' | 'sugar' | 'cholesterol' | 'sodium' | 'potassium'
type Profile = { displayName: string; trackedNutrients: NutrientKey[]; goal: Goal; heightFeet: string; heightInches: string; weight: string; age: string; sex: Sex; activity: string }
type NutritionLog = { log_date: string; calories: number; protein_grams: number; fiber_grams: number; carbs_grams: number; extra_nutrients: Partial<Record<NutrientKey, number>> | null }
type LogDraft = { date: string; foodName: string; serving: string; calories: string; protein: string; fiber: string; carbs: string; extras: Partial<Record<NutrientKey, string>>; servings: string; baseServing: string; baseCalories: string; baseProtein: string; baseFiber: string; baseCarbs: string; baseExtras: Partial<Record<NutrientKey, string>> }
type FoodSearchResult = { fdcId: number; name: string; servingSize: string; calories: number; protein: number; fiber: number; carbs: number; nutrients: Partial<Record<NutrientKey, number>> }
type FoodEntry = { id: number; entry_date: string; food_name: string; serving_size: string; calories: number; protein_grams: number; fiber_grams: number; carbs_grams: number; image_url: string | null }
type ExtraFoodNutrient = { name: string; value: string; unit: string }
type SavedFood = { id: number; name: string; serving_size: string; calories: number; protein_grams: number; fiber_grams: number; carbs_grams: number; image_url: string | null; extra_nutrients: ExtraFoodNutrient[]; source_type: 'label' | 'custom' }
type FoodDraft = { name: string; serving: string; calories: string; protein: string; fiber: string; carbs: string; extras: ExtraFoodNutrient[] }
type FoodIngredient = { key: string; name: string; servingLabel: string; servings: string; imageUrl: string | null; baseCalories: number; baseProtein: number; baseFiber: number; baseCarbs: number; baseExtras: Partial<Record<NutrientKey, number>> }
type WeightLog = { log_date: string; weight_lbs: number }

const today = () => new Date().toLocaleDateString('en-CA')
const lastSevenDays = () => {
  const now = new Date(); now.setHours(0, 0, 0, 0)
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(now); date.setDate(now.getDate() - (6 - index))
    return { dateStr: date.toLocaleDateString('en-CA'), label: date.toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 2) }
  })
}
const initialProfile: Profile = { displayName: '', trackedNutrients: [], goal: 'maintain', heightFeet: '', heightInches: '', weight: '', age: '', sex: 'female', activity: '1.375' }
const emptyLog = (): LogDraft => ({ date: today(), foodName: '', serving: '', calories: '', protein: '', fiber: '', carbs: '', extras: {}, servings: '1', baseServing: '', baseCalories: '', baseProtein: '', baseFiber: '', baseCarbs: '', baseExtras: {} })
const emptyFood = (): FoodDraft => ({ name: '', serving: '', calories: '', protein: '', fiber: '', carbs: '', extras: [] })
const nutrients: Record<NutrientKey, { label: string; unit: 'g' | 'mg'; target: number; icon: string }> = {
  fat: { label: 'Fat', unit: 'g', target: 70, icon: '◐' }, saturated_fat: { label: 'Saturated fat', unit: 'g', target: 20, icon: '◐' },
  trans_fat: { label: 'Trans fat', unit: 'g', target: 2, icon: '◐' }, sugar: { label: 'Sugar', unit: 'g', target: 50, icon: '◆' },
  cholesterol: { label: 'Cholesterol', unit: 'mg', target: 300, icon: '⊚' }, sodium: { label: 'Sodium', unit: 'mg', target: 2300, icon: '❆' },
  potassium: { label: 'Potassium', unit: 'mg', target: 4700, icon: '⊕' },
}
const goals: { id: Goal; title: string; note: string; icon: string }[] = [
  { id: 'lose', title: 'Lose weight', note: 'A steady, sustainable deficit', icon: '↓' },
  { id: 'maintain', title: 'Maintain weight', note: 'Keep your current balance', icon: '=' },
  { id: 'gain', title: 'Gain weight', note: 'A gradual calorie surplus', icon: '↑' },
  { id: 'muscle', title: 'Build muscle', note: 'Fuel training and recovery', icon: '✦' },
  { id: 'health', title: 'Eat healthier', note: 'Build nourishing habits', icon: '♥' },
]
const activityLevels = [
  ['1.2', 'Mostly seated', 'Little or no exercise'], ['1.375', 'Lightly active', 'Exercise 1-3 days a week'],
  ['1.55', 'Active', 'Exercise 3-5 days a week'], ['1.725', 'Very active', 'Hard exercise 6-7 days a week'],
]

async function prepareImageForScanning(file: File) {
  try {
    const bitmap = await createImageBitmap(file)
    const maxSide = 1600
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()
    return canvas.toDataURL('image/jpeg', 0.82)
  } catch {
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }
}

function calculatePlan(profile: Profile) {
  const kg = Number(profile.weight) * 0.453592
  const cm = (Number(profile.heightFeet) * 12 + Number(profile.heightInches)) * 2.54
  const bmr = 10 * kg + 6.25 * cm - 5 * Number(profile.age) + (profile.sex === 'male' ? 5 : -161)
  const maintenance = bmr * Number(profile.activity)
  const adjustment: Record<Goal, number> = { lose: -400, maintain: 0, gain: 300, muscle: 250, health: 0 }
  const calories = Math.max(1200, Math.round((maintenance + adjustment[profile.goal]) / 10) * 10)
  const protein = Math.round(kg * (profile.goal === 'muscle' ? 1.8 : profile.goal === 'lose' ? 1.6 : 1.4))
  const fat = Math.round((calories * 0.28) / 9)
  const carbs = Math.max(0, Math.round((calories - protein * 4 - fat * 9) / 4))
  return { calories, protein, fat, carbs, fiber: 28 }
}

function ProgressChart({ logs, period }: { logs: NutritionLog[]; period: Period }) {
  const buckets = useMemo(() => {
    const now = new Date(); now.setHours(0, 0, 0, 0)
    const count = period === 'week' ? 7 : period === 'month' ? 4 : 12
    return Array.from({ length: count }, (_, index) => {
      let start: Date, end: Date, label: string
      if (period === 'week') {
        start = new Date(now); start.setDate(now.getDate() - (6 - index)); end = new Date(start)
        label = start.toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 2)
      } else if (period === 'month') {
        end = new Date(now); end.setDate(now.getDate() - ((3 - index) * 7)); start = new Date(end); start.setDate(end.getDate() - 6)
        label = `W${index + 1}`
      } else {
        start = new Date(now.getFullYear(), now.getMonth() - (11 - index), 1); end = new Date(start.getFullYear(), start.getMonth() + 1, 0)
        label = start.toLocaleDateString('en-US', { month: 'short' }).slice(0, 1)
      }
      const inside = logs.filter(log => { const date = new Date(`${log.log_date}T00:00:00`); return date >= start && date <= end })
      return { label, protein: inside.reduce((a, l) => a + l.protein_grams, 0), fiber: inside.reduce((a, l) => a + l.fiber_grams, 0), carbs: inside.reduce((a, l) => a + l.carbs_grams, 0) }
    })
  }, [logs, period])
  const max = Math.max(1, ...buckets.map(b => b.protein + b.fiber + b.carbs))
  const totals = buckets.reduce((sum, b) => ({ protein: sum.protein + b.protein, fiber: sum.fiber + b.fiber, carbs: sum.carbs + b.carbs }), { protein: 0, fiber: 0, carbs: 0 })
  const totalGrams = totals.protein + totals.fiber + totals.carbs
  const pct = (value: number) => totalGrams ? Math.round((value / totalGrams) * 100) : 0
  return <section className="chart-card">
    <div className="chart-title"><div><span className="eyebrow">Your progress</span><h2>{period === 'week' ? 'This week' : period === 'month' ? 'Last 4 weeks' : 'Last 12 months'}</h2></div><div className="legend"><span className="fiber-dot" />Fiber {pct(totals.fiber)}% <span className="protein-dot" />Protein {pct(totals.protein)}% <span className="carbs-dot" />Carbs {pct(totals.carbs)}%</div></div>
    <div className="chart-grid"><i /><i /><i /></div>
    <div className="bars">{buckets.map((bucket, index) => { const scale = 150 / max; return <div className="bar-column" key={index}><div className="bar-stack"><span className="protein-bar" style={{ height: Math.max(bucket.protein * scale, bucket.protein ? 3 : 0) }} /><span className="fiber-bar" style={{ height: Math.max(bucket.fiber * scale, bucket.fiber ? 3 : 0) }} /><span className="carbs-bar" style={{ height: Math.max(bucket.carbs * scale, bucket.carbs ? 3 : 0) }} /></div><small>{bucket.label}</small></div> })}</div>
    {!logs.length && <p className="empty-chart">Log your first day to start building this chart.</p>}
  </section>
}

function WeeklyCalorieBalance({ logs }: { logs: NutritionLog[] }) {
  const days = useMemo(() => lastSevenDays().map(day => {
    const log = logs.find(l => l.log_date === day.dateStr)
    return { ...day, calories: log ? log.calories : null }
  }), [logs])
  return <section className="chart-card calorie-balance-card">
    <div className="chart-title"><div><span className="eyebrow">Day by day</span><h2>Calories logged</h2></div></div>
    <div className="calorie-balance">{days.map(day => <div key={day.dateStr} className="calorie-balance-day"><small>{day.label}</small><strong className={day.calories == null ? 'no-data' : 'logged'}>{day.calories == null ? '--' : `${day.calories.toLocaleString()} cal`}</strong></div>)}</div>
  </section>
}

function WeightChart({ weightLogs }: { weightLogs: WeightLog[] }) {
  const sorted = useMemo(() => [...weightLogs].sort((a, b) => a.log_date.localeCompare(b.log_date)), [weightLogs])
  if (!sorted.length) return <p className="weight-empty">Record your weight to start tracking your trend.</p>
  const values = sorted.map(w => w.weight_lbs)
  const min = Math.min(...values), max = Math.max(...values)
  const range = Math.max(1, max - min)
  const width = 300, height = 120, padding = 12
  const points = sorted.map((w, index) => {
    const x = sorted.length === 1 ? width / 2 : padding + (index / (sorted.length - 1)) * (width - padding * 2)
    const y = height - padding - ((w.weight_lbs - min) / range) * (height - padding * 2)
    return { x, y }
  })
  return <>
    <svg viewBox={`0 0 ${width} ${height}`} className="weight-svg" preserveAspectRatio="none">
      <polyline points={points.map(p => `${p.x},${p.y}`).join(' ')} fill="none" stroke="#731630" strokeWidth="2" />
      {points.map((p, index) => <circle key={sorted[index].log_date} cx={p.x} cy={p.y} r="3.5" fill="#731630" />)}
    </svg>
    <div className="weight-range"><span>{new Date(`${sorted[0].log_date}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span><span>{values[values.length - 1]} lbs</span><span>{new Date(`${sorted[sorted.length - 1].log_date}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span></div>
  </>
}

function CalorieChart({ logs, period, onPeriodChange }: { logs: NutritionLog[]; period: Period; onPeriodChange: (period: Period) => void }) {
  const buckets = useMemo(() => {
    const now = new Date(); now.setHours(0, 0, 0, 0)
    const count = period === 'week' ? 7 : period === 'month' ? 4 : 12
    return Array.from({ length: count }, (_, index) => {
      let start: Date, end: Date, label: string
      if (period === 'week') {
        start = new Date(now); start.setDate(now.getDate() - (6 - index)); end = new Date(start)
        label = start.toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 2)
      } else if (period === 'month') {
        end = new Date(now); end.setDate(now.getDate() - ((3 - index) * 7)); start = new Date(end); start.setDate(end.getDate() - 6)
        label = `W${index + 1}`
      } else {
        start = new Date(now.getFullYear(), now.getMonth() - (11 - index), 1); end = new Date(start.getFullYear(), start.getMonth() + 1, 0)
        label = start.toLocaleDateString('en-US', { month: 'short' }).slice(0, 1)
      }
      const inside = logs.filter(log => { const date = new Date(`${log.log_date}T00:00:00`); return date >= start && date <= end })
      return { label, protein: inside.reduce((a, l) => a + l.protein_grams, 0), fiber: inside.reduce((a, l) => a + l.fiber_grams, 0), carbs: inside.reduce((a, l) => a + l.carbs_grams, 0) }
    })
  }, [logs, period])
  const max = Math.max(1, ...buckets.map(bucket => bucket.protein + bucket.fiber + bucket.carbs))
  const totals = buckets.reduce((sum, b) => ({ protein: sum.protein + b.protein, fiber: sum.fiber + b.fiber, carbs: sum.carbs + b.carbs }), { protein: 0, fiber: 0, carbs: 0 })
  const totalGrams = totals.protein + totals.fiber + totals.carbs
  const pct = (value: number) => totalGrams ? Math.round((value / totalGrams) * 100) : 0
  return <section className="home-chart">
    <div className="home-chart-header"><div><span>Macro breakdown</span><strong>{period === 'week' ? 'Last 7 days' : period === 'month' ? 'Last 4 weeks' : 'Last 12 months'}</strong><div className="home-legend"><span className="fiber-dot" />Fiber {pct(totals.fiber)}% <span className="protein-dot" />Protein {pct(totals.protein)}% <span className="carbs-dot" />Carbs {pct(totals.carbs)}%</div></div><select value={period} onChange={event => onPeriodChange(event.target.value as Period)} aria-label="Macro chart period"><option value="week">Weekly</option><option value="month">Monthly</option><option value="year">Yearly</option></select></div>
    <div className="home-chart-grid"><i /><i /><i /></div>
    <div className="calorie-bars">{buckets.map((bucket, index) => { const scale = 105 / max; return <div key={index} title={`${bucket.protein + bucket.fiber + bucket.carbs}g tracked`}><div className="home-bar-stack"><span className="protein-bar" style={{ height: Math.max(bucket.protein * scale, bucket.protein ? 2 : 0) }} /><span className="fiber-bar" style={{ height: Math.max(bucket.fiber * scale, bucket.fiber ? 2 : 0) }} /><span className="carbs-bar" style={{ height: Math.max(bucket.carbs * scale, bucket.carbs ? 2 : 0) }} /></div><small>{bucket.label}</small></div> })}</div>
    {!logs.length && <p>Log a day to begin your macro chart.</p>}
  </section>
}

function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [step, setStep] = useState(0)
  const [profile, setProfile] = useState<Profile>(initialProfile)
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [logs, setLogs] = useState<NutritionLog[]>([])
  const [period, setPeriod] = useState<Period>('week')
  const [dashboardTab, setDashboardTab] = useState<DashboardTab>('home')
  const [showLog, setShowLog] = useState(false)
  const [showDayFoods, setShowDayFoods] = useState(false)
  const [showNutrients, setShowNutrients] = useState(false)
  const [logDraft, setLogDraft] = useState<LogDraft>(emptyLog)
  const [foodSearchQuery, setFoodSearchQuery] = useState('')
  const [foodSearchResults, setFoodSearchResults] = useState<FoodSearchResult[]>([])
  const [searchingFood, setSearchingFood] = useState(false)
  const [foodSearchError, setFoodSearchError] = useState('')
  const [foodSearchCorrected, setFoodSearchCorrected] = useState('')
  const [savedFoods, setSavedFoods] = useState<SavedFood[]>([])
  const [foodEntries, setFoodEntries] = useState<FoodEntry[]>([])
  const [showFoodForm, setShowFoodForm] = useState(false)
  const [showCustomFoodForm, setShowCustomFoodForm] = useState(false)
  const [foodDraft, setFoodDraft] = useState<FoodDraft>(emptyFood)
  const [labelImage, setLabelImage] = useState<File | null>(null)
  const [labelPreview, setLabelPreview] = useState('')
  const [scanningLabel, setScanningLabel] = useState(false)
  const [scanError, setScanError] = useState('')
  const [ingredients, setIngredients] = useState<FoodIngredient[]>([])
  const [customFoodImage, setCustomFoodImage] = useState<File | null>(null)
  const [customFoodImagePreview, setCustomFoodImagePreview] = useState('')
  const [selectedSavedFoodId, setSelectedSavedFoodId] = useState('')
  const [ingredientSearchQuery, setIngredientSearchQuery] = useState('')
  const [ingredientSearchResults, setIngredientSearchResults] = useState<FoodSearchResult[]>([])
  const [searchingIngredient, setSearchingIngredient] = useState(false)
  const [ingredientSearchError, setIngredientSearchError] = useState('')
  const [ingredientSearchCorrected, setIngredientSearchCorrected] = useState('')
  const [weightLogs, setWeightLogs] = useState<WeightLog[]>([])
  const [showWeightForm, setShowWeightForm] = useState(false)
  const [weightDraft, setWeightDraft] = useState('')
  const plan = useMemo(() => calculatePlan(profile), [profile])
  const todaysLog = logs.find(log => log.log_date === today())

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setLoading(false) })
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => { setSession(nextSession); setLoading(false) })
    return () => data.subscription.unsubscribe()
  }, [])

  const loadLogs = useCallback(async (userId: string) => {
    const start = new Date(); start.setFullYear(start.getFullYear() - 1)
    const { data, error } = await supabase.from('daily_nutrition').select('log_date, calories, protein_grams, fiber_grams, carbs_grams, extra_nutrients').eq('user_id', userId).gte('log_date', start.toLocaleDateString('en-CA')).order('log_date')
    if (error) setMessage(error.message); else setLogs(data || [])
  }, [])
  const loadSavedFoods = useCallback(async (userId: string) => {
    const { data, error } = await supabase.from('saved_foods').select('id, name, serving_size, calories, protein_grams, fiber_grams, carbs_grams, image_url, extra_nutrients, source_type').eq('user_id', userId).order('created_at', { ascending: false })
    if (error) setMessage(error.message); else setSavedFoods(data || [])
  }, [])
  const loadFoodEntries = useCallback(async (userId: string) => {
    const start = new Date(); start.setFullYear(start.getFullYear() - 1)
    const { data, error } = await supabase.from('food_entries').select('id, entry_date, food_name, serving_size, calories, protein_grams, fiber_grams, carbs_grams, image_url').eq('user_id', userId).gte('entry_date', start.toLocaleDateString('en-CA')).order('created_at', { ascending: false })
    if (error) setMessage(error.message); else setFoodEntries(data || [])
  }, [])
  const loadWeightLogs = useCallback(async (userId: string) => {
    const start = new Date(); start.setFullYear(start.getFullYear() - 1)
    const { data, error } = await supabase.from('weight_logs').select('log_date, weight_lbs').eq('user_id', userId).gte('log_date', start.toLocaleDateString('en-CA')).order('log_date')
    if (error) setMessage(error.message); else setWeightLogs(data || [])
  }, [])

  useEffect(() => {
    if (!session) return
    supabase.from('profiles').select('*').eq('id', session.user.id).maybeSingle().then(({ data }) => {
      if (!data) return
      const trackedNutrients = (data.tracked_nutrients?.length ? data.tracked_nutrients : data.tracked_nutrient ? [data.tracked_nutrient] : []) as NutrientKey[]
      setProfile({ displayName: data.display_name || data.full_name || session.user.email?.split('@')[0] || 'Pal', trackedNutrients, goal: data.goal, heightFeet: String(data.height_feet), heightInches: String(data.height_inches), weight: String(data.weight_lbs), age: String(data.age), sex: data.sex, activity: String(data.activity_level) })
      setStep(4); loadLogs(session.user.id); loadSavedFoods(session.user.id); loadFoodEntries(session.user.id); loadWeightLogs(session.user.id)
    })
  }, [session, loadLogs, loadSavedFoods, loadFoodEntries, loadWeightLogs])

  const signIn = async () => {
    setMessage('')
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } })
    if (error) setMessage(error.message)
  }

  const savePlan = async () => {
    if (!session) return
    setSaving(true); setMessage('')
    const { error } = await supabase.from('profiles').upsert({ id: session.user.id, email: session.user.email, full_name: session.user.user_metadata.full_name, display_name: profile.displayName.trim() || session.user.user_metadata.given_name || session.user.email?.split('@')[0] || 'Pal', tracked_nutrients: profile.trackedNutrients, avatar_url: session.user.user_metadata.avatar_url, goal: profile.goal, height_feet: Number(profile.heightFeet), height_inches: Number(profile.heightInches), weight_lbs: Number(profile.weight), age: Number(profile.age), sex: profile.sex, activity_level: Number(profile.activity), daily_calories: plan.calories, protein_grams: plan.protein, carbs_grams: plan.carbs, fat_grams: plan.fat, updated_at: new Date().toISOString() })
    setSaving(false)
    if (error) setMessage(error.message); else { setStep(4); loadLogs(session.user.id) }
  }

  const saveDailyLog = async () => {
    if (!session) return
    setSaving(true); setMessage('')
    const current = logs.find(log => log.log_date === logDraft.date)
    const entry = { user_id: session.user.id, entry_date: logDraft.date, food_name: logDraft.foodName.trim() || 'Custom food', serving_size: logDraft.serving.trim() || '1 serving', calories: Number(logDraft.calories), protein_grams: Number(logDraft.protein), fiber_grams: Number(logDraft.fiber), carbs_grams: Number(logDraft.carbs) }
    const { error: entryError } = await supabase.from('food_entries').insert(entry)
    if (entryError) { setSaving(false); setMessage(entryError.message); return }
    const existingExtra = current?.extra_nutrients || {}
    const extra_nutrients = profile.trackedNutrients.reduce((values, key) => ({ ...values, [key]: Number(values[key] || 0) + Number(logDraft.extras[key] || 0) }), existingExtra)
    const { error } = await supabase.from('daily_nutrition').upsert({ user_id: session.user.id, log_date: logDraft.date, calories: (current?.calories || 0) + Number(logDraft.calories), protein_grams: (current?.protein_grams || 0) + Number(logDraft.protein), fiber_grams: (current?.fiber_grams || 0) + Number(logDraft.fiber), carbs_grams: (current?.carbs_grams || 0) + Number(logDraft.carbs), extra_nutrients, updated_at: new Date().toISOString() }, { onConflict: 'user_id,log_date' })
    setSaving(false)
    if (error) setMessage(error.message); else { setShowLog(false); setLogDraft(emptyLog()); loadLogs(session.user.id); loadFoodEntries(session.user.id) }
  }
  const searchFoods = async () => {
    const trimmed = foodSearchQuery.trim()
    if (!trimmed) return
    setSearchingFood(true); setFoodSearchError(''); setFoodSearchResults([]); setFoodSearchCorrected('')
    try {
      const response = await fetch('/.netlify/functions/search-food', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: trimmed }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'The food database could not be searched.')
      setFoodSearchResults(data.results || []); setFoodSearchCorrected(data.correctedQuery || '')
    } catch (error) {
      setFoodSearchError(error instanceof Error ? error.message : 'The food database could not be searched.')
    } finally { setSearchingFood(false) }
  }
  useEffect(() => {
    const trimmed = foodSearchQuery.trim()
    if (trimmed.length < 2) { setFoodSearchResults([]); setFoodSearchError(''); setFoodSearchCorrected(''); return }
    const timer = setTimeout(() => { searchFoods() }, 400)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [foodSearchQuery])
  const pickFoodResult = (result: FoodSearchResult) => {
    const extras: Partial<Record<NutrientKey, string>> = {}
    for (const key of profile.trackedNutrients) { const value = result.nutrients[key]; if (value != null) extras[key] = String(value) }
    setLogDraft(current => ({ ...current, foodName: result.name, serving: result.servingSize, calories: String(result.calories), protein: String(result.protein), fiber: String(result.fiber), carbs: String(result.carbs), extras, servings: '1', baseServing: result.servingSize, baseCalories: String(result.calories), baseProtein: String(result.protein), baseFiber: String(result.fiber), baseCarbs: String(result.carbs), baseExtras: extras }))
    setFoodSearchResults([]); setFoodSearchQuery('')
  }
  const clearFoodPick = () => setLogDraft(current => ({ ...current, servings: '1', baseServing: '', baseCalories: '', baseProtein: '', baseFiber: '', baseCarbs: '', baseExtras: {} }))
  const applyLogServings = (value: string) => {
    const multiplier = Number(value)
    setLogDraft(current => {
      if (!current.baseCalories || !Number.isFinite(multiplier) || multiplier < 0) return { ...current, servings: value }
      const scaleInt = (base: string) => base ? String(Math.round(Number(base) * multiplier)) : base
      const scaleDecimal = (base: string) => base ? String(Math.round(Number(base) * multiplier * 100) / 100) : base
      const extras: Partial<Record<NutrientKey, string>> = {}
      for (const key of Object.keys(current.baseExtras) as NutrientKey[]) extras[key] = scaleDecimal(current.baseExtras[key] || '')
      return { ...current, servings: value, calories: scaleInt(current.baseCalories), protein: scaleDecimal(current.baseProtein), fiber: scaleDecimal(current.baseFiber), carbs: scaleDecimal(current.baseCarbs), extras }
    })
  }

  const saveDisplayName = async () => {
    if (!session || !profile.displayName.trim()) return
    setSaving(true); setMessage('')
    const { error } = await supabase.from('profiles').update({ display_name: profile.displayName.trim(), updated_at: new Date().toISOString() }).eq('id', session.user.id)
    setSaving(false)
    setMessage(error ? error.message : 'Your display name has been saved.')
  }
  const saveWeight = async () => {
    if (!session) return
    const weight = Number(weightDraft)
    if (!weightDraft.trim() || !Number.isFinite(weight) || weight < 60 || weight > 1000) { setMessage('Enter a weight between 60 and 1000 lbs.'); return }
    setSaving(true); setMessage('')
    const { error: logError } = await supabase.from('weight_logs').upsert({ user_id: session.user.id, log_date: today(), weight_lbs: weight }, { onConflict: 'user_id,log_date' })
    if (logError) { setSaving(false); setMessage(logError.message); return }
    const { error } = await supabase.from('profiles').update({ weight_lbs: weight, updated_at: new Date().toISOString() }).eq('id', session.user.id)
    setSaving(false)
    if (error) { setMessage(error.message); return }
    setProfile(current => ({ ...current, weight: weightDraft.trim() })); setWeightDraft(''); setShowWeightForm(false); loadWeightLogs(session.user.id)
  }

  const openDailyLog = () => {
    setLogDraft(emptyLog())
    setFoodSearchQuery(''); setFoodSearchResults([]); setFoodSearchError('')
    setShowLog(true)
  }
  const chooseNutrient = async (nutrient: NutrientKey) => {
    if (!session) return
    if (profile.trackedNutrients.includes(nutrient)) return
    setSaving(true); setMessage('')
    const trackedNutrients = [...profile.trackedNutrients, nutrient]
    const { error } = await supabase.from('profiles').update({ tracked_nutrients: trackedNutrients, updated_at: new Date().toISOString() }).eq('id', session.user.id)
    setSaving(false)
    if (error) setMessage(error.message); else { setProfile({ ...profile, trackedNutrients }); setShowNutrients(false) }
  }
  const removeNutrient = async (nutrient: NutrientKey) => {
    if (!session) return
    setSaving(true); setMessage('')
    const trackedNutrients = profile.trackedNutrients.filter(key => key !== nutrient)
    const { error } = await supabase.from('profiles').update({ tracked_nutrients: trackedNutrients, updated_at: new Date().toISOString() }).eq('id', session.user.id)
    setSaving(false)
    if (error) setMessage(error.message); else setProfile({ ...profile, trackedNutrients })
  }
  const selectLabelImage = async (file?: File) => {
    if (!file) return
    if (labelPreview) URL.revokeObjectURL(labelPreview)
    setLabelImage(file); setLabelPreview(URL.createObjectURL(file)); setScanError(''); setScanningLabel(true)
    try {
      const image = await prepareImageForScanning(file)
      const response = await fetch('/.netlify/functions/scan-label', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image }) })
      const responseText = await response.text()
      let result: { error?: string; is_nutrition_label?: boolean; rejection_reason?: string; product_name?: string; serving_size?: string; nutrients?: { name: string; value: number; unit: string }[] }
      try { result = JSON.parse(responseText) } catch { throw new Error(response.ok ? 'The scanner returned an unreadable response.' : 'The scanning service could not process this image. Please try again.') }
      if (!response.ok) throw new Error(result.error || 'The label could not be scanned.')
      if (!result.is_nutrition_label) throw new Error(result.rejection_reason || 'This does not appear to be a readable nutrition label.')
      const values: Record<string, string> = {}
      const extras: ExtraFoodNutrient[] = []
      for (const nutrient of result.nutrients || []) {
        const name = nutrient.name.toLowerCase()
        if (name === 'calories' || name === 'energy') values.calories = String(nutrient.value)
        else if (name.includes('protein')) values.protein = String(nutrient.value)
        else if (name.includes('fiber') || name.includes('fibre')) values.fiber = String(nutrient.value)
        else if (name.includes('carbohydrate') || name === 'carbs') values.carbs = String(nutrient.value)
        else extras.push({ name: nutrient.name, value: String(nutrient.value), unit: nutrient.unit })
      }
      setFoodDraft(current => ({ ...current, name: result.product_name || current.name, serving: result.serving_size || current.serving, calories: values.calories || '', protein: values.protein || '', fiber: values.fiber || '', carbs: values.carbs || '', extras }))
    } catch (error) {
      setLabelImage(null); setScanError(error instanceof Error ? error.message : 'This image could not be scanned.')
    } finally { setScanningLabel(false) }
  }
  const selectCustomFoodImage = (file?: File) => {
    if (!file) return
    if (customFoodImagePreview) URL.revokeObjectURL(customFoodImagePreview)
    setCustomFoodImage(file); setCustomFoodImagePreview(URL.createObjectURL(file))
  }
  const saveFood = async () => {
    if (!session || !foodDraft.name.trim() || !foodDraft.serving.trim()) return
    setSaving(true); setMessage('')
    let image_url: string | null = null
    if (labelImage) {
      const extension = labelImage.name.split('.').pop() || 'jpg'
      const path = `${session.user.id}/${crypto.randomUUID()}.${extension}`
      const { error: uploadError } = await supabase.storage.from('nutrition-labels').upload(path, labelImage, { contentType: labelImage.type, upsert: false })
      if (uploadError) { setSaving(false); setMessage(uploadError.message); return }
      image_url = supabase.storage.from('nutrition-labels').getPublicUrl(path).data.publicUrl
    }
    const { error } = await supabase.from('saved_foods').insert({ user_id: session.user.id, name: foodDraft.name.trim(), serving_size: foodDraft.serving.trim(), calories: Number(foodDraft.calories || 0), protein_grams: Number(foodDraft.protein || 0), fiber_grams: Number(foodDraft.fiber || 0), carbs_grams: Number(foodDraft.carbs || 0), extra_nutrients: foodDraft.extras, image_url, source_type: 'label' })
    setSaving(false)
    if (error) setMessage(error.message); else { setFoodDraft(emptyFood()); setLabelImage(null); setLabelPreview(''); setShowFoodForm(false); loadSavedFoods(session.user.id) }
  }
  const logFoodEntry = async (food: { id: number | null; name: string; serving_size: string; calories: number; protein_grams: number; fiber_grams: number; carbs_grams: number; image_url: string | null }) => {
    if (!session) return false
    const current = logs.find(log => log.log_date === today())
    const { error: entryError } = await supabase.from('food_entries').insert({ user_id: session.user.id, entry_date: today(), saved_food_id: food.id, food_name: food.name, serving_size: food.serving_size, calories: food.calories, protein_grams: food.protein_grams, fiber_grams: food.fiber_grams, carbs_grams: food.carbs_grams, image_url: food.image_url })
    if (entryError) { setMessage(entryError.message); return false }
    const { error } = await supabase.from('daily_nutrition').upsert({ user_id: session.user.id, log_date: today(), calories: (current?.calories || 0) + food.calories, protein_grams: (current?.protein_grams || 0) + food.protein_grams, fiber_grams: (current?.fiber_grams || 0) + food.fiber_grams, carbs_grams: (current?.carbs_grams || 0) + food.carbs_grams, extra_nutrients: current?.extra_nutrients || {}, updated_at: new Date().toISOString() }, { onConflict: 'user_id,log_date' })
    if (error) { setMessage(error.message); return false }
    loadLogs(session.user.id); loadFoodEntries(session.user.id); return true
  }
  const deleteFoodEntry = async (entry: FoodEntry) => {
    if (!session) return
    setSaving(true); setMessage('')
    const { error: deleteError } = await supabase.from('food_entries').delete().eq('id', entry.id)
    if (deleteError) { setSaving(false); setMessage(deleteError.message); return }
    const remaining = foodEntries.filter(item => item.id !== entry.id && item.entry_date === entry.entry_date)
    const totals = remaining.reduce((sum, item) => ({ calories: sum.calories + item.calories, protein_grams: sum.protein_grams + item.protein_grams, fiber_grams: sum.fiber_grams + item.fiber_grams, carbs_grams: sum.carbs_grams + item.carbs_grams }), { calories: 0, protein_grams: 0, fiber_grams: 0, carbs_grams: 0 })
    const current = logs.find(log => log.log_date === entry.entry_date)
    const { error } = await supabase.from('daily_nutrition').upsert({ user_id: session.user.id, log_date: entry.entry_date, calories: totals.calories, protein_grams: totals.protein_grams, fiber_grams: totals.fiber_grams, carbs_grams: totals.carbs_grams, extra_nutrients: current?.extra_nutrients || {}, updated_at: new Date().toISOString() }, { onConflict: 'user_id,log_date' })
    setSaving(false)
    if (error) { setMessage(error.message); return }
    loadLogs(session.user.id); loadFoodEntries(session.user.id)
  }
  const syncFoodDraftFromIngredients = (list: FoodIngredient[]) => {
    const totals = list.reduce((sum, ing) => {
      const multiplier = Number(ing.servings) || 0
      const extras = { ...sum.extras }
      for (const key of Object.keys(ing.baseExtras) as NutrientKey[]) extras[key] = (extras[key] || 0) + (ing.baseExtras[key] || 0) * multiplier
      return { calories: sum.calories + ing.baseCalories * multiplier, protein: sum.protein + ing.baseProtein * multiplier, fiber: sum.fiber + ing.baseFiber * multiplier, carbs: sum.carbs + ing.baseCarbs * multiplier, extras }
    }, { calories: 0, protein: 0, fiber: 0, carbs: 0, extras: {} as Partial<Record<NutrientKey, number>> })
    const extras: ExtraFoodNutrient[] = (Object.keys(totals.extras) as NutrientKey[]).map(key => ({ name: nutrients[key].label, value: String(Math.round((totals.extras[key] || 0) * 100) / 100), unit: nutrients[key].unit }))
    setFoodDraft(current => ({ ...current, calories: String(Math.round(totals.calories)), protein: String(Math.round(totals.protein * 100) / 100), fiber: String(Math.round(totals.fiber * 100) / 100), carbs: String(Math.round(totals.carbs * 100) / 100), extras }))
  }
  const addSavedFoodIngredient = () => {
    const food = savedFoods.find(item => String(item.id) === selectedSavedFoodId)
    if (!food) return
    const next = [...ingredients, { key: crypto.randomUUID(), name: food.name, servingLabel: food.serving_size, servings: '1', imageUrl: food.image_url, baseCalories: food.calories, baseProtein: food.protein_grams, baseFiber: food.fiber_grams, baseCarbs: food.carbs_grams, baseExtras: {} }]
    setIngredients(next); syncFoodDraftFromIngredients(next); setSelectedSavedFoodId('')
  }
  
  const searchIngredients = async () => {
    const trimmed = ingredientSearchQuery.trim()
    if (!trimmed) return
    setSearchingIngredient(true); setIngredientSearchError(''); setIngredientSearchResults([]); setIngredientSearchCorrected('')
    try {
      const response = await fetch('/.netlify/functions/search-food', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: trimmed }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'The food database could not be searched.')
      setIngredientSearchResults(data.results || []); setIngredientSearchCorrected(data.correctedQuery || '')
    } catch (error) {
      setIngredientSearchError(error instanceof Error ? error.message : 'The food database could not be searched.')
    } finally { setSearchingIngredient(false) }
  }
  useEffect(() => {
    const trimmed = ingredientSearchQuery.trim()
    if (trimmed.length < 2) { setIngredientSearchResults([]); setIngredientSearchError(''); setIngredientSearchCorrected(''); return }
    const timer = setTimeout(() => { searchIngredients() }, 400)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ingredientSearchQuery])
  const addUsdaIngredient = (result: FoodSearchResult) => {
    const next = [...ingredients, { key: crypto.randomUUID(), name: result.name, servingLabel: result.servingSize, servings: '1', imageUrl: null, baseCalories: result.calories, baseProtein: result.protein, baseFiber: result.fiber, baseCarbs: result.carbs, baseExtras: result.nutrients }]
    setIngredients(next); syncFoodDraftFromIngredients(next); setIngredientSearchResults([]); setIngredientSearchQuery('')
  }
  const updateIngredientServings = (key: string, value: string) => {
    const next = ingredients.map(ing => ing.key === key ? { ...ing, servings: value } : ing)
    setIngredients(next); syncFoodDraftFromIngredients(next)
  }
  const removeIngredient = (key: string) => {
    const next = ingredients.filter(ing => ing.key !== key)
    setIngredients(next); syncFoodDraftFromIngredients(next)
  }
  const saveCustomFood = async () => {
    if (!session || !foodDraft.name.trim() || !foodDraft.serving.trim()) return
    setSaving(true); setMessage('')
    let image_url = ingredients.length === 1 ? ingredients[0].imageUrl : null
    if (customFoodImage) {
      const extension = customFoodImage.name.split('.').pop() || 'jpg'
      const path = `${session.user.id}/${crypto.randomUUID()}.${extension}`
      const { error: uploadError } = await supabase.storage.from('nutrition-labels').upload(path, customFoodImage, { contentType: customFoodImage.type, upsert: false })
      if (uploadError) { setSaving(false); setMessage(uploadError.message); return }
      image_url = supabase.storage.from('nutrition-labels').getPublicUrl(path).data.publicUrl
    }
    const { data, error } = await supabase.from('saved_foods').insert({ user_id: session.user.id, name: foodDraft.name.trim(), serving_size: foodDraft.serving.trim(), calories: Number(foodDraft.calories || 0), protein_grams: Number(foodDraft.protein || 0), fiber_grams: Number(foodDraft.fiber || 0), carbs_grams: Number(foodDraft.carbs || 0), extra_nutrients: foodDraft.extras, image_url, source_type: 'custom' }).select().single()
    if (error) { setSaving(false); setMessage(error.message); return }
    const logged = await logFoodEntry({ id: data.id, name: data.name, serving_size: data.serving_size, calories: data.calories, protein_grams: data.protein_grams, fiber_grams: data.fiber_grams, carbs_grams: data.carbs_grams, image_url: data.image_url })
    setSaving(false)
    if (logged) { setMessage(`${data.name} saved and added to today.`); setFoodDraft(emptyFood()); setIngredients([]); setCustomFoodImage(null); setCustomFoodImagePreview(''); setShowCustomFoodForm(false); loadSavedFoods(session.user.id) }
  }
  const addSavedFood = async (food: SavedFood) => {
    if (!session) return
    setSaving(true); setMessage('')
    const logged = await logFoodEntry(food)
    setSaving(false)
    if (logged) setMessage(`${food.name} added to today.`)
  }
  const bodyValid = Number(profile.heightFeet) >= 3 && Number(profile.heightInches) >= 0 && Number(profile.heightInches) < 12 && Number(profile.weight) >= 60
  const detailsValid = Number(profile.age) >= 18 && Number(profile.age) <= 100
  const logValid = Number(logDraft.calories) >= 0 && logDraft.calories !== '' && Number(logDraft.protein) >= 0 && Number(logDraft.fiber) >= 0 && Number(logDraft.carbs) >= 0

  if (loading) return <main className="splash"><img src="/calpal-logo-green.png" alt="CalPal" /></main>
  if (!session) return <main className="login-screen"><div className="login-card"><img className="login-logo" src="/calpal-logo.png" alt="CalPal" /><img className="mascot" src="/calpal-mascot.png" alt="CalPal's cheerful salad bowl mascot" /><div className="login-copy"><span className="eyebrow">Nutrition that knows you</span><h1>Your goals.<br />Your plan. <em>Your pal.</em></h1><p>A friendly daily calorie plan made around your body, routine, and goals.</p></div><button className="google-button" onClick={signIn}><span className="google-g">G</span> Continue with Google <span>→</span></button>{message && <p className="error">{message}</p>}<p className="login-note">Simple, secure, and no passwords to remember.</p></div></main>

  if (step === 4) return <main className="dashboard">
    <div className="dashboard-content">
      {dashboardTab === 'home' && <>
        <section className="figma-welcome"><div><h1>Welcome {profile.displayName || session.user.user_metadata.given_name || session.user.email?.split('@')[0] || 'Pal'}</h1><p>Your daily nutrition at a glance.</p></div><img src="/calpal-mascot.png" alt="" /></section>
        <CalorieChart logs={logs} period={period} onPeriodChange={setPeriod} />
        <div className="daily-title"><span>Count Your Daily Calories</span><button onClick={openDailyLog}>+ Add food</button></div>
        <button className="figma-calories" onClick={() => setShowDayFoods(true)}><span>Calories <small>Tap to see today's foods →</small></span><div className="figma-gauge"><svg viewBox="0 0 200 110" role="img" aria-label={`${todaysLog?.calories || 0} of ${plan.calories} calories consumed`}><path className="gauge-track" d="M 20 100 A 80 80 0 0 1 180 100" pathLength="100" /><path className="gauge-progress" d="M 20 100 A 80 80 0 0 1 180 100" pathLength="100" style={{ strokeDasharray: `${Math.min(100, ((todaysLog?.calories || 0) / plan.calories) * 100)} 100` }} /></svg><div><strong>{Math.max(0, plan.calories - (todaysLog?.calories || 0)).toLocaleString()}</strong><small>Left</small></div></div><div className="gauge-labels"><small>0</small><small>{plan.calories.toLocaleString()}</small></div></button>
        <section className="figma-macros">
          <div className="macro-box carbs-box"><b>▦</b><span>Carbs</span><strong>{todaysLog?.carbs_grams || 0}g <small>{plan.carbs}g</small></strong><i><em style={{ width: `${Math.min(100, ((todaysLog?.carbs_grams || 0) / plan.carbs) * 100)}%` }} /></i></div>
          <div className="macro-box protein-box"><b>◉</b><span>Protein</span><strong>{todaysLog?.protein_grams || 0}g <small>{plan.protein}g</small></strong><i><em style={{ width: `${Math.min(100, ((todaysLog?.protein_grams || 0) / plan.protein) * 100)}%` }} /></i></div>
          <div className="macro-box fiber-box"><b>❧</b><span>Fiber</span><strong>{todaysLog?.fiber_grams || 0}g <small>{plan.fiber}g</small></strong><i><em style={{ width: `${Math.min(100, ((todaysLog?.fiber_grams || 0) / plan.fiber) * 100)}%` }} /></i></div>
          {profile.trackedNutrients.map((key, index) => <div className={`macro-box custom-macro ${index % 2 ? 'protein-box' : 'fiber-box'}`} key={key}><b>{nutrients[key].icon}</b><span>{nutrients[key].label}</span><strong>{todaysLog?.extra_nutrients?.[key] || 0}{nutrients[key].unit} <small>{nutrients[key].target}{nutrients[key].unit}</small></strong><i><em style={{ width: `${Math.min(100, ((todaysLog?.extra_nutrients?.[key] || 0) / nutrients[key].target) * 100)}%` }} /></i></div>)}
          {profile.trackedNutrients.length < Object.keys(nutrients).length && <button className="macro-box total-box add-macro" onClick={() => setShowNutrients(true)}><b>＋</b><strong>Add nutrient</strong><small>Choose what to track</small></button>}
        </section>
      </>}
      {dashboardTab === 'progress' && <><div className="tab-header"><div><span className="eyebrow">Your stats</span><h1>Progress</h1></div><select value={period} onChange={e => setPeriod(e.target.value as Period)}><option value="week">Weekly</option><option value="month">Monthly</option><option value="year">Yearly</option></select></div><ProgressChart logs={logs} period={period} />{period === 'week' && <WeeklyCalorieBalance logs={logs} />}<section className="chart-card weight-card"><div className="chart-title"><div><span className="eyebrow">Your trend</span><h2>Weight</h2></div><button className="record-weight-button" onClick={() => { setWeightDraft(profile.weight); setShowWeightForm(true) }}>Record weight</button></div><WeightChart weightLogs={weightLogs} /></section><section className="progress-note"><h2>Keep showing up.</h2><p>Each logged day makes your trends more useful. Your chart combines protein, fiber, and carbs from every daily entry.</p></section></>}
      {dashboardTab === 'labels' && <><div className="tab-header label-heading"><div><span className="eyebrow">Your label library</span><h1>Saved labels</h1></div><button className="add-label-button" onClick={() => { setFoodDraft(emptyFood()); setLabelImage(null); setLabelPreview(''); setScanError(''); setShowFoodForm(true) }}>＋</button></div>{savedFoods.some(food => food.source_type === 'label') ? <section className="food-library">{savedFoods.filter(food => food.source_type === 'label').map(food => <article key={food.id}>{food.image_url ? <img src={food.image_url} alt={`${food.name} nutrition label`} /> : <div className="food-placeholder">▤</div>}<div><h2>{food.name}</h2><p>{food.serving_size}</p><span>{food.calories} cal · {food.protein_grams}g protein · {food.carbs_grams}g carbs</span></div><button disabled={saving} onClick={() => addSavedFood(food)}>Add</button></article>)}</section> : <section className="empty-library"><img src="/calpal-mascot.png" alt="" /><h2>No saved labels yet</h2><p>Photograph a nutrition label, customize the food and serving, then reuse it whenever you eat it.</p><button onClick={() => setShowFoodForm(true)}>＋ Scan your first label</button></section>}</>}
      {dashboardTab === 'foods' && <><div className="tab-header label-heading"><div><span className="eyebrow">Made by you</span><h1>My foods</h1></div><button className="add-label-button" onClick={() => { setFoodDraft(emptyFood()); setIngredients([]); setSelectedSavedFoodId(''); setIngredientSearchQuery(''); setIngredientSearchResults([]); setIngredientSearchError(''); setCustomFoodImage(null); setCustomFoodImagePreview(''); setShowCustomFoodForm(true) }}>＋</button></div>{savedFoods.some(food => food.source_type === 'custom') ? <section className="food-library custom-library">{savedFoods.filter(food => food.source_type === 'custom').map(food => <article key={food.id}>{food.image_url ? <img src={food.image_url} alt={`${food.name}`} /> : <div className="food-placeholder">♨</div>}<div><h2>{food.name}</h2><p>{food.serving_size}</p><span>{food.calories} cal · {food.protein_grams}g protein · {food.carbs_grams}g carbs</span></div><button disabled={saving} onClick={() => addSavedFood(food)}>Add</button></article>)}</section> : <section className="empty-library"><img src="/calpal-mascot.png" alt="" /><h2>Create your own foods</h2><p>Save meals, recipes, snacks, and drinks you eat often, then add a serving to today anytime.</p><button onClick={() => { setFoodDraft(emptyFood()); setIngredients([]); setSelectedSavedFoodId(''); setIngredientSearchQuery(''); setIngredientSearchResults([]); setIngredientSearchError(''); setCustomFoodImage(null); setCustomFoodImagePreview(''); setShowCustomFoodForm(true) }}>＋ Create a food</button></section>}</>}
      {dashboardTab === 'settings' && <><div className="tab-header"><div><span className="eyebrow">Your account</span><h1>Settings</h1></div><button className="avatar-button"><img src={session.user.user_metadata.avatar_url || '/calpal-mascot.png'} alt="Account" /></button></div><section className="settings-card name-settings"><h2>Display name</h2><p>This is the name CalPal uses to welcome you.</p><label>Name<input value={profile.displayName} maxLength={50} onChange={e => setProfile({ ...profile, displayName: e.target.value })} placeholder={session.user.email?.split('@')[0] || 'Your name'} /></label><button className="settings-primary" disabled={!profile.displayName.trim() || saving} onClick={saveDisplayName}>{saving ? 'Saving...' : 'Save name'}</button></section><section className="settings-card tracked-settings"><h2>Tracked nutrients</h2><p>Remove nutrients you no longer want shown. Past log data stays saved.</p>{profile.trackedNutrients.length ? <div>{profile.trackedNutrients.map(key => <span key={key}><b>{nutrients[key].label}</b><button disabled={saving} onClick={() => removeNutrient(key)}>Remove</button></span>)}</div> : <small>No extra nutrients selected.</small>}<button className="settings-primary" onClick={() => setShowNutrients(true)}>Add nutrient</button></section><section className="settings-card"><h2>Your calorie plan</h2><p>Update your goal, body details, or activity level and CalPal will recalculate your targets.</p><button className="settings-primary" onClick={() => setStep(0)}>Update my plan</button></section><section className="settings-card account-card"><h2>Account</h2><p>{session.user.email}</p><button className="signout-button" onClick={() => supabase.auth.signOut()}>Sign out</button></section></>}
      {message && <p className="error">{message}</p>}
    </div>
    <nav className="bottom-nav" aria-label="Main navigation">
      <button className={dashboardTab === 'home' ? 'active' : ''} onClick={() => setDashboardTab('home')} aria-label="Home"><b><svg viewBox="0 0 24 24"><path d="M3.5 10.5 12 3l8.5 7.5v9a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5z" /></svg></b></button>
      <button className={dashboardTab === 'progress' ? 'active' : ''} onClick={() => setDashboardTab('progress')} aria-label="Progress"><b><svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="17" rx="5" /><path d="m7 15 3-3 2.5 2 4.5-5" /></svg></b></button>
      <button className={`label-nav ${dashboardTab === 'labels' ? 'active' : ''}`} onClick={() => setDashboardTab('labels')} aria-label="Scan and saved labels"><b><svg viewBox="0 0 24 24"><path d="M12 2.5c.7 5.4 3.7 8.5 9.5 9.5-5.8 1-8.8 4.1-9.5 9.5-.7-5.4-3.7-8.5-9.5-9.5 5.8-1 8.8-4.1 9.5-9.5Z" /></svg></b></button>
      <button className={`tray-nav ${dashboardTab === 'foods' ? 'active' : ''}`} onClick={() => setDashboardTab('foods')} aria-label="My custom foods"><b><svg viewBox="0 0 24 24"><path d="M4 12h16v7H4zM7 12a5 5 0 0 1 10 0M12 5V3" /><path d="M2.5 20.5h19" /></svg></b></button>
      <button className={dashboardTab === 'settings' ? 'active' : ''} onClick={() => setDashboardTab('settings')} aria-label="Settings"><b><svg viewBox="0 0 24 24"><path d="M9.7 3.4 10.4 2h3.2l.7 1.4 1.6.7 1.5-.5 2.2 2.2-.5 1.5.7 1.6 1.4.7v3.2l-1.4.7-.7 1.6.5 1.5-2.2 2.2-1.5-.5-1.6.7-.7 1.4h-3.2l-.7-1.4-1.6-.7-1.5.5-2.2-2.2.5-1.5-.7-1.6-1.4-.7V9.6l1.4-.7.7-1.6-.5-1.5 2.2-2.2 1.5.5z" /><circle cx="12" cy="11.2" r="3" /></svg></b></button>
    </nav>
    {showLog && <div className="modal-backdrop" onMouseDown={() => setShowLog(false)}><section className="log-modal" onMouseDown={e => e.stopPropagation()}><button className="close-button" onClick={() => setShowLog(false)}>×</button><span className="eyebrow">Add food</span><h2>What did you eat?</h2><p>Search the USDA food database, or add any meal, snack, drink, or custom food by hand.</p><label>Search a food<div className="food-search-row"><input value={foodSearchQuery} onChange={e => setFoodSearchQuery(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); searchFoods() } }} placeholder="e.g. Kodiak pancakes" /><button type="button" disabled={searchingFood || !foodSearchQuery.trim()} onClick={searchFoods}>{searchingFood ? 'Searching...' : 'Search'}</button></div></label>{foodSearchError && <><p className="error">{foodSearchError}</p><p className="search-fallback-hint">Can't find it? Tap the <b>✦</b> icon below to scan a nutrition label into your library for daily use instead.</p></>}{foodSearchCorrected && <p className="search-hint">Showing results for "{foodSearchCorrected}"</p>}{foodSearchResults.length > 0 && <div className="food-search-results">{foodSearchResults.map(result => <button type="button" key={result.fdcId} onClick={() => pickFoodResult(result)}><strong>{result.name}</strong><small>{result.servingSize} · {result.calories} cal</small></button>)}</div>}<label>Date<input type="date" value={logDraft.date} max={today()} onChange={e => setLogDraft({ ...logDraft, date: e.target.value })} /></label><div className="food-fields"><label>Food name<input value={logDraft.foodName} onChange={e => setLogDraft({ ...logDraft, foodName: e.target.value })} placeholder="e.g. Turkey sandwich" /></label><label>Serving size<input value={logDraft.serving} onChange={e => setLogDraft({ ...logDraft, serving: e.target.value })} placeholder="e.g. 1 sandwich" /></label></div>{logDraft.baseCalories && <div className="scan-reference"><p>From database: <strong>{logDraft.baseServing}</strong> · {logDraft.baseCalories} kcal <button type="button" className="clear-pick-button" onClick={clearFoodPick}>Enter manually instead</button></p><label>Number of servings<input type="number" min="0" step="0.1" value={logDraft.servings} onChange={e => applyLogServings(e.target.value)} /></label></div>}<div className="log-inputs">{([['calories','Calories','kcal'],['protein','Protein','g'],['fiber','Fiber','g'],['carbs','Carbs','g']] as const).map(([key,label,unit]) => <label key={key}>{label}<div><input type="number" min="0" readOnly={!!logDraft.baseCalories} value={logDraft[key]} onChange={e => setLogDraft({ ...logDraft, [key]: e.target.value })} placeholder="0" /><span>{unit}</span></div></label>)}{profile.trackedNutrients.map(key => <label key={key}>{nutrients[key].label}<div><input type="number" min="0" readOnly={!!logDraft.baseCalories} value={logDraft.extras[key] || ''} onChange={e => setLogDraft({ ...logDraft, extras: { ...logDraft.extras, [key]: e.target.value } })} placeholder="0" /><span>{nutrients[key].unit}</span></div></label>)}</div><button className="next-button save-log" disabled={!logValid || !logDraft.foodName.trim() || saving} onClick={saveDailyLog}>{saving ? 'Adding...' : 'Add to my day'}</button></section></div>}
    {showDayFoods && <div className="modal-backdrop" onMouseDown={() => setShowDayFoods(false)}><section className="log-modal day-foods-modal" onMouseDown={e => e.stopPropagation()}><button className="close-button" onClick={() => setShowDayFoods(false)}>×</button><span className="eyebrow">Today</span><h2>Your food diary</h2><p>{todaysLog?.calories || 0} calories logged today.</p><div className="day-food-list">{foodEntries.filter(entry => entry.entry_date === today()).map(entry => <article key={entry.id}>{entry.image_url ? <img src={entry.image_url} alt="" /> : <div>♢</div>}<span><strong>{entry.food_name}</strong><small>{entry.serving_size}</small><i>{entry.protein_grams}g protein · {entry.carbs_grams}g carbs</i></span><b>{entry.calories}<small>cal</small></b><button className="delete-entry-button" disabled={saving} aria-label={`Delete ${entry.food_name}`} onClick={() => deleteFoodEntry(entry)}>×</button></article>)}{!foodEntries.some(entry => entry.entry_date === today()) && <div className="empty-day"><strong>No itemized foods yet</strong><p>Add a custom food or a saved nutrition label to start your diary.</p></div>}</div><button className="next-button save-log" onClick={() => { setShowDayFoods(false); openDailyLog() }}>＋ Add another food</button></section></div>}
    {showWeightForm && <div className="modal-backdrop" onMouseDown={() => setShowWeightForm(false)}><section className="log-modal" onMouseDown={e => e.stopPropagation()}><button className="close-button" onClick={() => setShowWeightForm(false)}>×</button><span className="eyebrow">Update your weight</span><h2>Record your weight</h2><p>Tracking changes over time updates your calorie plan too.</p><div className="input-wrap full"><input inputMode="decimal" value={weightDraft} onChange={e => setWeightDraft(e.target.value)} placeholder="145" /><span>lbs</span></div><button className="next-button save-log" disabled={!weightDraft.trim() || saving} onClick={saveWeight}>{saving ? 'Saving...' : 'Save weight'}</button></section></div>}
    {showNutrients && <div className="modal-backdrop" onMouseDown={() => setShowNutrients(false)}><section className="log-modal nutrient-modal" onMouseDown={e => e.stopPropagation()}><button className="close-button" onClick={() => setShowNutrients(false)}>×</button><span className="eyebrow">Customize your dashboard</span><h2>Add a nutrient</h2><p>Choose another nutrient to track each day.</p><div className="nutrient-options">{(Object.keys(nutrients) as NutrientKey[]).map(key => { const selected = profile.trackedNutrients.includes(key); return <button className={selected ? 'selected' : ''} key={key} disabled={saving || selected} onClick={() => chooseNutrient(key)}><span><strong>{nutrients[key].label}</strong><small>Daily guide: {nutrients[key].target}{nutrients[key].unit}</small></span><b>{selected ? '✓' : '+'}</b></button> })}</div></section></div>}
    {showFoodForm && <div className="modal-backdrop" onMouseDown={() => setShowFoodForm(false)}><section className="log-modal food-modal" onMouseDown={e => e.stopPropagation()}><button className="close-button" onClick={() => setShowFoodForm(false)}>×</button><span className="eyebrow">New saved food</span><h2>Scan a nutrition label</h2><p>Take a clear photo. CalPal will verify and fill in every readable nutrient.</p><label className={`camera-capture ${labelPreview ? 'has-image' : ''}`}>{labelPreview ? <img src={labelPreview} alt="Nutrition label preview" /> : <><b>⌁</b><strong>{scanningLabel ? 'Scanning label...' : 'Take label photo'}</strong><small>Camera or photo library</small></>}<input type="file" accept="image/*" capture="environment" disabled={scanningLabel} onChange={e => selectLabelImage(e.target.files?.[0])} /></label>{scanningLabel && <div className="scan-status"><i />Reading serving size and nutrients...</div>}{scanError && <p className="error">{scanError} Choose a clear Nutrition Facts photo and try again.</p>}{labelImage && !scanningLabel && <><p className="review-note">Label found. Review and edit anything before saving.</p><div className="food-fields"><label>Food name<input value={foodDraft.name} onChange={e => setFoodDraft({ ...foodDraft, name: e.target.value })} placeholder="e.g. Granola bar" /></label><label>Serving size<input value={foodDraft.serving} onChange={e => setFoodDraft({ ...foodDraft, serving: e.target.value })} placeholder="e.g. 1 bar (40g)" /></label></div><div className="log-inputs">{([['calories','Calories','kcal'],['protein','Protein','g'],['fiber','Fiber','g'],['carbs','Carbs','g']] as const).map(([key,label,unit]) => <label key={key}>{label}<div><input type="number" min="0" value={foodDraft[key]} onChange={e => setFoodDraft({ ...foodDraft, [key]: e.target.value })} placeholder="0" /><span>{unit}</span></div></label>)}</div><div className="extra-food-fields">{foodDraft.extras.map((nutrient,index) => <div key={`${nutrient.name}-${index}`}><input aria-label="Nutrient name" value={nutrient.name} onChange={e => setFoodDraft({ ...foodDraft, extras: foodDraft.extras.map((item,i) => i === index ? { ...item, name:e.target.value } : item) })} /><input aria-label={`${nutrient.name} value`} type="number" min="0" value={nutrient.value} onChange={e => setFoodDraft({ ...foodDraft, extras: foodDraft.extras.map((item,i) => i === index ? { ...item, value:e.target.value } : item) })} /><input aria-label={`${nutrient.name} unit`} value={nutrient.unit} onChange={e => setFoodDraft({ ...foodDraft, extras: foodDraft.extras.map((item,i) => i === index ? { ...item, unit:e.target.value } : item) })} /><button onClick={() => setFoodDraft({ ...foodDraft, extras: foodDraft.extras.filter((_,i) => i !== index) })}>×</button></div>)}<button className="add-extra" onClick={() => setFoodDraft({ ...foodDraft, extras: [...foodDraft.extras,{name:'',value:'',unit:'g'}] })}>＋ Add another nutrient</button></div><button className="next-button save-log" disabled={!foodDraft.name.trim() || !foodDraft.serving.trim() || saving} onClick={saveFood}>{saving ? 'Saving...' : 'Save to my foods'}</button></>}</section></div>}
    {showCustomFoodForm && <div className="modal-backdrop" onMouseDown={() => setShowCustomFoodForm(false)}><section className="log-modal food-modal" onMouseDown={e => e.stopPropagation()}><button className="close-button" onClick={() => setShowCustomFoodForm(false)}>×</button><span className="eyebrow">Reusable custom food</span><h2>Create a food</h2><p>Combine saved labels and USDA foods into one food, or enter nutrition by hand.</p><label className={`camera-capture custom-food-photo ${customFoodImagePreview ? 'has-image' : ''}`}>{customFoodImagePreview ? <img src={customFoodImagePreview} alt="Custom food preview" /> : <><b>⌁</b><strong>Add a photo (optional)</strong><small>Camera or photo library</small></>}<input type="file" accept="image/*" capture="environment" onChange={e => selectCustomFoodImage(e.target.files?.[0])} /></label>{customFoodImagePreview && <button type="button" className="clear-pick-button" onClick={() => { URL.revokeObjectURL(customFoodImagePreview); setCustomFoodImage(null); setCustomFoodImagePreview('') }}>Remove photo</button>}<label>Add a saved label<div className="food-search-row"><select value={selectedSavedFoodId} onChange={e => setSelectedSavedFoodId(e.target.value)}><option value="">Choose a saved label...</option>{savedFoods.filter(food => food.source_type === 'label').map(food => <option key={food.id} value={food.id}>{food.name} ({food.serving_size})</option>)}</select><button type="button" disabled={!selectedSavedFoodId} onClick={addSavedFoodIngredient}>Add</button></div></label><label>Search USDA foods<div className="food-search-row"><input value={ingredientSearchQuery} onChange={e => setIngredientSearchQuery(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); searchIngredients() } }} placeholder="e.g. Kodiak pancakes" /><button type="button" disabled={searchingIngredient || !ingredientSearchQuery.trim()} onClick={searchIngredients}>{searchingIngredient ? 'Searching...' : 'Search'}</button></div></label>{ingredientSearchError && <><p className="error">{ingredientSearchError}</p><p className="search-fallback-hint">Can't find it? Tap the <b>✦</b> icon below to scan a nutrition label into your library, then add it here as a saved label.</p></>}{ingredientSearchCorrected && <p className="search-hint">Showing results for "{ingredientSearchCorrected}"</p>}{ingredientSearchResults.length > 0 && <div className="food-search-results">{ingredientSearchResults.map(result => <button type="button" key={result.fdcId} onClick={() => addUsdaIngredient(result)}><strong>{result.name}</strong><small>{result.servingSize} · {result.calories} cal</small></button>)}</div>}{ingredients.length > 0 && <div className="ingredient-list">{ingredients.map(ing => <div key={ing.key} className="ingredient-row"><span><strong>{ing.name}</strong><small>{ing.servingLabel}</small></span><input type="number" min="0" step="0.1" value={ing.servings} onChange={e => updateIngredientServings(ing.key, e.target.value)} aria-label={`Servings of ${ing.name}`} /><b>{Math.round(ing.baseCalories * (Number(ing.servings) || 0))} cal</b><button type="button" onClick={() => removeIngredient(ing.key)} aria-label={`Remove ${ing.name}`}>×</button></div>)}<div className="ingredient-total">Total: {foodDraft.calories || 0} cal · {foodDraft.protein || 0}g protein · {foodDraft.fiber || 0}g fiber · {foodDraft.carbs || 0}g carbs</div></div>}<div className="food-fields"><label>Food name<input value={foodDraft.name} onChange={e => setFoodDraft({ ...foodDraft, name: e.target.value })} placeholder="e.g. Mom's pasta" /></label><label>Serving size<input value={foodDraft.serving} onChange={e => setFoodDraft({ ...foodDraft, serving: e.target.value })} placeholder="e.g. 1 bowl (250g)" /></label></div><div className="log-inputs">{([['calories','Calories','kcal'],['protein','Protein','g'],['fiber','Fiber','g'],['carbs','Carbs','g']] as const).map(([key,label,unit]) => <label key={key}>{label}<div><input type="number" min="0" readOnly={ingredients.length > 0} value={foodDraft[key]} onChange={e => setFoodDraft({ ...foodDraft, [key]: e.target.value })} placeholder="0" /><span>{unit}</span></div></label>)}</div>{ingredients.length === 0 && <div className="extra-food-fields">{foodDraft.extras.map((nutrient,index) => <div key={index}><input value={nutrient.name} onChange={e => setFoodDraft({ ...foodDraft, extras: foodDraft.extras.map((item,i) => i === index ? {...item,name:e.target.value} : item) })} placeholder="Nutrient" /><input type="number" min="0" value={nutrient.value} onChange={e => setFoodDraft({ ...foodDraft, extras: foodDraft.extras.map((item,i) => i === index ? {...item,value:e.target.value} : item) })} placeholder="0" /><input value={nutrient.unit} onChange={e => setFoodDraft({ ...foodDraft, extras: foodDraft.extras.map((item,i) => i === index ? {...item,unit:e.target.value} : item) })} /><button onClick={() => setFoodDraft({ ...foodDraft, extras: foodDraft.extras.filter((_,i) => i !== index) })}>×</button></div>)}<button className="add-extra" onClick={() => setFoodDraft({ ...foodDraft, extras: [...foodDraft.extras,{name:'',value:'',unit:'g'}] })}>＋ Add another nutrient</button></div>}{ingredients.length > 0 && foodDraft.extras.length > 0 && <div className="ingredient-extras">{foodDraft.extras.map((nutrient, index) => <span key={index}>{nutrient.name}: {nutrient.value}{nutrient.unit}</span>)}</div>}<button className="next-button save-log" disabled={!foodDraft.name.trim() || !foodDraft.serving.trim() || saving} onClick={saveCustomFood}>{saving ? 'Saving...' : 'Save custom food'}</button></section></div>}
  </main>

  return <main className="onboarding-page"><div className="onboarding-frame"><header><img src="/calpal-logo-green.png" alt="CalPal" /><span>Step {step + 1} of 4</span></header><div className="progress"><i style={{ width: `${((step + 1) / 4) * 100}%` }} /></div><section className="step-card">
    {step === 0 && <><span className="eyebrow">Let's get to know you</span><h1>What's your main goal?</h1><p className="intro">Pick the one that matters most right now. You can always change it later.</p><div className="goal-list">{goals.map(goal => <button key={goal.id} className={profile.goal === goal.id ? 'selected' : ''} onClick={() => setProfile({ ...profile, goal: goal.id })}><b>{goal.icon}</b><span><strong>{goal.title}</strong><small>{goal.note}</small></span><i>✓</i></button>)}</div></>}
    {step === 1 && <><span className="eyebrow">The basics</span><h1>Tell us about your body.</h1><p className="intro">This helps us estimate the energy your body uses each day.</p><label>Height</label><div className="input-row"><div className="input-wrap"><input inputMode="numeric" value={profile.heightFeet} onChange={e => setProfile({ ...profile, heightFeet: e.target.value })} placeholder="5" /><span>ft</span></div><div className="input-wrap"><input inputMode="numeric" value={profile.heightInches} onChange={e => setProfile({ ...profile, heightInches: e.target.value })} placeholder="6" /><span>in</span></div></div><label>Weight</label><div className="input-wrap full"><input inputMode="decimal" value={profile.weight} onChange={e => setProfile({ ...profile, weight: e.target.value })} placeholder="145" /><span>lbs</span></div></>}
    {step === 2 && <><span className="eyebrow">A little more about you</span><h1>Fine-tune your plan.</h1><p className="intro">Age and sex help make your daily estimate more accurate.</p><label>Age</label><div className="input-wrap full"><input inputMode="numeric" value={profile.age} onChange={e => setProfile({ ...profile, age: e.target.value })} placeholder="28" /><span>years</span></div><label>Sex used for calculation</label><div className="segmented"><button className={profile.sex === 'female' ? 'selected' : ''} onClick={() => setProfile({ ...profile, sex: 'female' })}>Female</button><button className={profile.sex === 'male' ? 'selected' : ''} onClick={() => setProfile({ ...profile, sex: 'male' })}>Male</button></div><p className="privacy-note">We only use this information to calculate your estimate.</p></>}
    {step === 3 && <><span className="eyebrow">Last one</span><h1>How active are you?</h1><p className="intro">Think about a typical week—not your very best week.</p><div className="activity-list">{activityLevels.map(([value, title, note]) => <button key={value} className={profile.activity === value ? 'selected' : ''} onClick={() => setProfile({ ...profile, activity: value })}><span><strong>{title}</strong><small>{note}</small></span><i>✓</i></button>)}</div></>}{message && <p className="error">{message}</p>}
  </section><footer>{step > 0 ? <button className="back-button" onClick={() => setStep(step - 1)}>← Back</button> : <span />}{step < 3 ? <button className="next-button" disabled={(step === 1 && !bodyValid) || (step === 2 && !detailsValid)} onClick={() => setStep(step + 1)}>Continue →</button> : <button className="next-button" disabled={saving} onClick={savePlan}>{saving ? 'Building plan...' : 'See my plan →'}</button>}</footer></div></main>
}

export default App
